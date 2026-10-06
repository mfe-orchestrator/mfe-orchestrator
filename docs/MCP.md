# Remote MCP server

The console can expose its features to AI clients (Claude, Claude Code, Cursor, VS Code and any other
client speaking the [Model Context Protocol](https://modelcontextprotocol.io)) through a remote MCP
server. The client connects with OAuth: the user signs in to the console as usual, chooses **one
project** and whether the client may change things, and the client only ever acts inside that project.

It is off by default.

## Turning it on

| Variable             | Default                     | What it does                                                                              |
| -------------------- | --------------------------- | ----------------------------------------------------------------------------------------- |
| `MCP_ENABLED`        | `false`                     | Mounts the MCP server, the OAuth endpoints and the discovery documents.                    |
| `FRONTEND_URL`       | _(required)_                | Public URL of the console: the consent page lives there.                                   |
| `JWT_SECRET`         | _(required)_                | Your own secret, at least 32 bytes (`openssl rand -hex 32`). With MCP on, the backend refuses to start on a missing, placeholder or short one. |
| `MCP_DCR_ENABLED`    | `true`                      | Dynamic client registration (RFC 7591), what most clients use today.                       |
| `MCP_API_KEY_ENABLED` | `true`                     | Lets clients that cannot do OAuth use a project API key instead (see below).               |
| `MCP_RATE_LIMIT_MAX` | `120`                       | MCP requests per minute for each grant or API key, on top of `RATE_LIMIT_MAX` per IP.      |
| `MCP_CIMD_ENABLED`   | `true`                      | Client ID metadata documents: the `client_id` is an https URL describing the client.       |
| `CIMD_ALLOWED_HOSTS` | _(any)_                     | Comma separated hosts allowed to publish client metadata documents. Listed hosts show as verified on the consent page; with no list every CIMD client is unverified. |
| `OAUTH_ISSUER_URL`   | `BACKEND_URL`               | Only when the issuer cannot be derived (default: `FRONTEND_URL` + `/api`).                 |
| `MCP_RESOURCE_URL`   | issuer + `/mcp`             | Only when the MCP endpoint is published somewhere else.                                    |
| `TRUST_PROXY`        | `127.0.0.1` in the images   | Proxies whose `X-Forwarded-For` is trusted, so per-IP rate limits see the real client.     |

The URL to give to MCP clients is shown in the console (Settings → MCP clients). With the default
layout it is `https://<your console>/api/mcp`.

## What the client can do

Two scopes, chosen on the consent page:

- `mfe:read` — read the project: microfrontends, environments, deployments, canary users, global
  variables, build status, storages and repository connections (credentials masked), dependency and
  integration plans.
- `mfe:write` — everything the console does inside a project, **deploy and rollback included**:
  create and edit microfrontends and environments, trigger builds, import repositories, change
  global variables, apply dependency alignments and integrations.

A project **VIEWER** can only grant `mfe:read`. The cap is applied again on every request, so
demoting a member takes write access away from their clients immediately.

Left out on purpose: API keys, scaffolding a repository from a template, creating or editing
storages and repository connections (their input is a secret), projects, organizations, members,
invitations, the user profile, bundle upload and the canvas layout.

## Fallback: a project API key

OAuth is the way to connect: the user consents in the browser and can revoke the client from the
console. For a client that cannot do OAuth (a script, a CI job, a client without browser login),
`/mcp` also accepts a **project API key** (Settings → API keys), either as
`Authorization: Bearer <key>` or as an `api-key: <key>` header.

- The key reaches its own project and nothing else; organization-level operations are denied.
- A `VIEWER` key gets `mfe:read`, a `MANAGER` key gets `mfe:read` and `mfe:write` (deploy and
  rollback included). The same tools stay excluded as for OAuth.
- Revoked and expired keys are refused, exactly as on the API key routes.
- A valid key is remembered for up to 60 seconds (in Redis when configured, in memory otherwise),
  so the bcrypt check is not repeated on every call. Revoking or deleting the key in the console
  drops it at once; a key that simply expires stops working at its expiry.
- Whoever holds the key acts as the project, not as a person: there is no user to revoke it from
  and nothing on the consent page. Prefer OAuth whenever the client supports it, and set
  `MCP_API_KEY_ENABLED=false` to turn the fallback off.

The audit log line of every tool call names either `grantId` (OAuth) or `apiKeyId` (API key).

Client configuration, with `https://<your console>/api/mcp` as the URL:

```bash
# Claude Code
claude mcp add --transport http mfe-orchestrator https://<your console>/api/mcp \
  --header "Authorization: Bearer <api key>"
```

```json
// Gemini CLI: ~/.gemini/settings.json
{
  "mcpServers": {
    "mfe-orchestrator": {
      "httpUrl": "https://<your console>/api/mcp",
      "headers": { "Authorization": "Bearer <api key>" }
    }
  }
}
```

```json
// Cursor: ~/.cursor/mcp.json (or .cursor/mcp.json in the project)
{
  "mcpServers": {
    "mfe-orchestrator": {
      "url": "https://<your console>/api/mcp",
      "headers": { "Authorization": "Bearer ${env:MFE_ORCHESTRATOR_API_KEY}" }
    }
  }
}
```

## Revoking access

Settings → MCP clients lists the clients connected to the project. A project OWNER (or an
organization admin) sees and can revoke everyone's; other members see and revoke their own. A
revocation takes effect on the client's next request. A grant also ends by itself when the user
loses access to the project, after 30 days without use, and in any case after 90 days.

## How it works

- **Discovery.** `POST /api/mcp` without a token answers `401` with
  `WWW-Authenticate: Bearer resource_metadata=".../.well-known/oauth-protected-resource/api/mcp"`.
  That document (RFC 9728) names the authorization server, whose metadata (RFC 8414) is at
  `/.well-known/oauth-authorization-server/api` (also served as `openid-configuration`).
- **Authorization.** OAuth 2.1 authorization code with PKCE (S256 only), public clients, RFC 8707
  resource indicators and the RFC 9207 `iss` parameter. `/oauth/authorize` parks the request for 10
  minutes and sends the browser to `/oauth/consent` in the console; the code it produces is
  single-use and lives 60 seconds.
- **Tokens.** Access tokens are JWTs (`typ: at+jwt`) valid 15 minutes, signed with a key derived from
  `JWT_SECRET` but distinct from the console's: a console session token is refused by `/mcp` and an
  MCP token cannot open a console session. Refresh tokens are opaque, rotate on every use, and a
  replayed one revokes the whole grant.
- **Transport.** Streamable HTTP, stateless: `POST` only, `GET`/`DELETE` answer `405`.

## What the consent page warns about

- **unverified** — the client's name is self-asserted: always for dynamically registered clients,
  and for metadata-document clients whose host is not in `CIMD_ALLOWED_HOSTS`. The page shows the
  `client_id` host, the only part of a metadata-document client that is actually proven.
- **redirect_host_mismatch** — the code would be sent to an https host other than the client's.
- **localhost** / **custom_scheme** — the code goes to a local application.

## Reverse proxy

The discovery documents live at the **origin root**, outside `/api`. The bundled nginx already
routes `/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server` and
`/.well-known/openid-configuration` to the backend with the path untouched, and serves `/api/mcp`
without buffering. If you put another proxy in front, do the same.

Rate limits are per client IP (client registration: 10 per hour; `/mcp` also has its own limit per
grant and per API key), so the backend must know which
proxies to believe in `X-Forwarded-For`. The images trust their own nginx (`TRUST_PROXY=127.0.0.1`).
Behind a Kubernetes ingress the request reaches that nginx from the ingress controller's pod, so add
that hop, or every client is seen with the controller's IP and shares one bucket:

```yaml
# helm values
env:
  TRUST_PROXY: "loopback,10.0.0.0/8"   # in-pod nginx + ingress pods in the pod CIDR
  # TRUST_PROXY: "2"                   # or count the hops: nginx + ingress
```

Trust only the hops you actually run: a trusted hop lets the caller choose its own IP.

## Trying it

```bash
# Claude Code
claude mcp add --transport http mfe-orchestrator https://<your console>/api/mcp

# MCP Inspector
npx @modelcontextprotocol/inspector
```
