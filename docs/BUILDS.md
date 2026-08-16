# Build status of the microfrontends

Every microfrontend of a project is built by the CI of the provider its repository lives on, and
until now the only way to know whether the last pipeline passed was to open GitHub, GitLab or
Azure DevOps, one tab per repository. The **Builds** page collects those runs in a single table:
one row per microfrontend, the outcome of its latest run, the recent history behind it, and the
version each environment is currently serving.

Nothing is stored: the runs are read from the providers when the page is opened and refreshed
while it stays open. The platform keeps no build history of its own, so the page shows what the
providers show and nothing more.

## What the page shows

![The builds page with a status badge per microfrontend and one row expanded on its last runs](assets/builds-page.png)

The table has one row per microfrontend of the current project, sorted by name, with:

| Column               | Content                                                                    |
| -------------------- | -------------------------------------------------------------------------- |
| Microfrontend        | Name and slug                                                              |
| Last build           | Status badge of the most recent run, or why no run could be read           |
| Tag / branch         | The ref that run was started from, tags included, without the `refs/*` prefix |
| Last built version   | Most recent version whose bundle actually reached the platform             |
| One column per environment | Version that environment serves, taken from its **active deployment**  |

The environment columns come after the fixed ones, in the order the environments are configured
on the project, and the production one is flagged with a badge.

Two of these deserve a distinction that the table cannot make on its own. *Last built version* is
the newest bundle uploaded to the platform, and the environment columns are what a deployment
froze — a deployment ships a fixed set of versions, so an environment keeps serving what it was
given even after a newer bundle exists. Inside the expanded row a third one appears, the
*selected version*: the version the microfrontend itself currently points at, which is what the
next deployment would pick up.

Expanding a row shows the repository it is linked to and the **last five runs** of that
repository, newest first, each with its status, ref, workflow name, start moment, who started it,
and a link to the run on the provider.

### Status badges

The providers each describe a run in their own vocabulary; the console reduces all of them to six
buckets.

| Status     | Meaning                                                          |
| ---------- | ---------------------------------------------------------------- |
| `QUEUED`   | Accepted but not started — including a GitLab pipeline waiting on a manual action |
| `RUNNING`  | In progress                                                      |
| `SUCCESS`  | Finished and passed (Azure `partiallySucceeded` counts as passed) |
| `FAILED`   | Finished and failed, timed out, or failed to start               |
| `CANCELED` | Canceled or skipped                                              |
| `UNKNOWN`  | The provider reported a state this platform does not know        |

GitHub and Azure DevOps both split the outcome over two fields — `status` plus `conclusion` on
GitHub, `status` plus `result` on Azure — and the second one only means something once the first
says the run is over. A run still in progress is therefore always `RUNNING`, whatever result the
provider left on it from a previous attempt.

### When there is no run to show

A microfrontend without runs says why, instead of showing an empty history:

| Reason                  | Cause                                                                 |
| ----------------------- | --------------------------------------------------------------------- |
| `NO_REPOSITORY`         | The microfrontend has no code repository connected, or it is disabled  |
| `REPOSITORY_NOT_FOUND`  | It points at a code repository connection that no longer exists        |
| `PROVIDER_ERROR`        | The provider call failed — revoked token, network error, missing Azure configuration |

`PROVIDER_ERROR` is confined to the row that produced it: one unreachable provider never blanks
the page, and the row keeps its versions. A microfrontend whose repository is reachable but has
simply never run a pipeline carries no reason at all and an empty run list.

## How the status is read

The snapshot is assembled per project, in one pass:

1. The microfrontends of the project are listed, together with its environments.
2. The version each environment serves is read from the **active deployment** of that environment.
3. The latest built version of each microfrontend is read from the most recent uploaded bundle.
4. For every microfrontend with `codeRepository.enabled`, the code repository connection it points
   at is resolved, and its runs are read through that connection's provider API with the token
   stored on the connection.

Step 4 is the only one that leaves the platform, and how a microfrontend is addressed depends on
the provider:

| Provider     | Addressed by                                                     | Read from                                                                 |
| ------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| GitHub       | The repository **name** on the connection, under the organization or user of the connection | `GET /repos/:owner/:repo/actions/runs?per_page=5`                          |
| GitLab       | The repository **id**                                             | `GET /projects/:id/pipelines?per_page=5&order_by=id&sort=desc`             |
| Azure DevOps | The repository **id**, inside the organization and project of the connection | `GET /_apis/build/builds?repositoryId=…&repositoryType=TfsGit&queryOrder=queueTimeDescending&$top=5` |

GitHub addresses a repository by name and the other two by id, so a microfrontend missing the
field its provider needs contributes an empty run list rather than an error. An Azure DevOps
connection without its organization and project configured is a genuine failure and surfaces as
`PROVIDER_ERROR`.

The runs are read repository-wide: every workflow, pipeline or build definition attached to the
repository is in scope, and no filter selects "the build pipeline" among them.

### Caching

A snapshot is reused for **15 seconds**, keyed by project and shared by the snapshot endpoint and
the stream, so several people watching the same project cost the providers as much as one. The
in-flight request is what gets cached, not just its result, so simultaneous callers join the same
round of provider calls instead of each starting their own. A failed snapshot is evicted
immediately, so an error is never replayed for the rest of the window.

The **Refresh** button re-requests the snapshot; within the cache window it gets the cached one
back. `fetchedAt` reports when the snapshot was read from the providers, not when it was sent, so
it is the field to look at to tell a fresh snapshot from a reused one.

## Live updates

The page opens a Server-Sent Events stream alongside the initial request and keeps it for as long
as it stays mounted. The stream carries a full snapshot — never a delta — so every frame can be
treated as the new truth, which is exactly how the console consumes it: the snapshot replaces the
cached query rather than triggering a refetch.

On the server the stream polls its own service every 15 seconds, matched to the cache window, and
compares the result with what it last sent, ignoring `fetchedAt`. An unchanged snapshot is written
as a comment heartbeat instead of a frame, so an idle project keeps the connection alive without
re-rendering anything. "Live" therefore means *within 15 seconds*, not pushed from the provider:
neither provider webhooks nor any other callback are involved.

The header of the page shows whether the stream is connected, and the moment of the last snapshot
received.

A few consequences worth knowing:

- The **first snapshot is resolved before the response is hijacked**, so a missing project header
  or a project the user cannot access still comes back as a normal HTTP error rather than as a
  stream that fails after the headers are out.
- A provider failure during a poll ends that round, not the connection: a `stream-error` event is
  sent, the browser keeps showing the last snapshot, and the next poll retries.
- The console reads the stream over `fetch` rather than through `EventSource`, because the API
  requires an `Authorization` and a `Project-Id` header on every call and `EventSource` cannot send
  either. Automatic reconnection is therefore reimplemented client side, with a backoff that
  starts at 2 seconds, doubles, and is capped at 30 seconds.
- The project travels in a header, so switching project drops the connection and opens a new one —
  the URL alone would look unchanged.
- The token is resolved before every connection attempt, so a reconnection after a long outage
  uses a current token.

## API

Both endpoints are authenticated and scoped to the project carried by the `Project-Id` header;
the request is rejected when that header is missing, and when the authenticated user has no access
to that project.

| Method | Path                 | Description                                        |
| ------ | -------------------- | -------------------------------------------------- |
| `GET`  | `/api/builds`        | Current build status of the project, as one snapshot |
| `GET`  | `/api/builds/stream` | The same snapshot, pushed over SSE as it changes    |

Neither endpoint takes a query parameter or a body.

### Snapshot

```http
GET /api/builds
```

```json
{
  "projectId": "6717c0f2f1a2b3c4d5e6f701",
  "fetchedAt": "2026-08-16T10:00:00.000Z",
  "environments": [
    { "_id": "6717c0f2f1a2b3c4d5e6f702", "name": "Production", "slug": "prod", "color": "#22c55e", "isProduction": true }
  ],
  "microfrontends": [
    {
      "microfrontendId": "6717c0f2f1a2b3c4d5e6f708",
      "name": "Checkout",
      "slug": "checkout",
      "provider": "GITHUB",
      "repositoryName": "checkout-mfe",
      "selectedVersion": "1.3.0",
      "latestBuiltVersion": "1.3.0",
      "versionByEnvironmentId": { "6717c0f2f1a2b3c4d5e6f702": "1.2.0" },
      "builds": [
        {
          "id": "10",
          "name": "build",
          "status": "SUCCESS",
          "ref": "1.3.0",
          "commitSha": "abc123",
          "url": "https://github.com/acme/checkout-mfe/actions/runs/10",
          "triggeredBy": "jane",
          "startedAt": "2026-08-16T09:55:00.000Z",
          "finishedAt": "2026-08-16T09:58:00.000Z"
        }
      ]
    }
  ]
}
```

`provider` is one of `GITHUB`, `GITLAB`, `AZURE_DEV_OPS` and is absent on a microfrontend with no
repository. Every field of a run except `id` and `status` is optional — which of them the provider
exposes varies, `triggeredBy` for instance is never populated on GitLab, and `finishedAt` is
omitted while the run is queued or running. A microfrontend that could not be read carries
`unavailableReason` and an empty `builds`.

Environments an environment serves nothing on are simply absent from `versionByEnvironmentId`, so
the map is not guaranteed to have one entry per environment.

### Stream

```http
GET /api/builds/stream
Accept: text/event-stream
```

The response is `text/event-stream`, sent with `Cache-Control: no-cache, no-transform`,
`Connection: keep-alive` and `X-Accel-Buffering: no` — the last one is what stops nginx from
buffering the whole response until the connection closes. The headers already staged on the reply,
CORS included, are carried over, so the stream works from a console served on a different origin
than the API.

Two named events are sent:

```
event: snapshot
data: {"projectId":"…","fetchedAt":"…","environments":[…],"microfrontends":[…]}

event: stream-error
data: {"message":"Request failed with status code 401"}
```

`snapshot` carries the same payload as `GET /api/builds` and is sent once on connect, then only
when the snapshot actually changed. `stream-error` reports a poll that failed and does not close
the connection. Between the two, `: ping` comment lines are written on every poll that produced no
change; a client that follows the SSE framing ignores them on its own.

## Limitations

- Only the **last five runs** per microfrontend are read, and only for the repository as a whole:
  a repository whose last five runs are all from an unrelated workflow shows those, and the
  console offers no way to select which workflow to track.
- On Azure DevOps only builds of **Azure Repos Git** repositories are matched
  (`repositoryType=TfsGit`); a pipeline defined on a repository hosted elsewhere is not listed.
- Nothing is persisted. There is no history beyond what the providers still return, and no trend,
  duration or failure-rate statistic is derived from it.
- The status is at most 15 seconds old, and refreshing sooner returns the cached snapshot.
- The run list is presented in the order the provider returns it. GitLab and Azure are asked
  explicitly for the newest runs first; GitHub is not, and its default ordering is what decides
  which run the table treats as the last one.
- Runs are read with the token of the code repository connection, so a token without access to the
  CI of that repository yields `PROVIDER_ERROR` even when the repository itself is readable.

## Related

- [Importing repositories as microfrontends](REPOSITORY-IMPORT.md) — linking the repositories
  whose pipelines are read here.
- [Dependency analysis](DEPENDENCIES.md) — the other feature that reads the linked repositories
  live through the provider APIs.
