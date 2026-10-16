# AI providers

The console assistant, the project draft of the new project wizard and
[editing a microfrontend with AI](AI-CODE-CHANGES.md) all use one model, chosen per installation with
`AI_PROVIDER`. With no provider configured AI is off: the assistant is hidden, its endpoints answer
404 and nothing is sent anywhere.

| `AI_PROVIDER`   | Model                              | Required variables                                                                                     | Optional                                   |
| --------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| `anthropic`     | Claude, Anthropic API              | `ANTHROPIC_API_KEY`                                                                                    | `ANTHROPIC_MODEL` (`claude-opus-5-5`)      |
| `azure-foundry` | Claude on Microsoft Foundry        | `AZURE_FOUNDRY_RESOURCE`, `AZURE_FOUNDRY_API_KEY`                                                      | `AZURE_FOUNDRY_MODEL` (`claude-opus-5-5`)  |
| `gemini`        | Gemini, Gemini API                 | `GEMINI_API_KEY`, `GEMINI_MODEL`                                                                       |                                            |
| `azure-openai`  | GPT on Azure OpenAI                | `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`                             | `AZURE_OPENAI_REASONING` (`false`)         |

`AI_PROVIDER` left empty with `ANTHROPIC_API_KEY` set keeps working as before: Claude through the
Anthropic API. A provider named without one of its required variables stops the backend at boot,
with the missing variables in the error.

## Notes per provider

- **anthropic**: requests that Claude declines are retried on another model by the API itself
  (server-side fallback).
- **azure-foundry**: `AZURE_FOUNDRY_RESOURCE` is the resource name, as in
  `https://<resource>.services.ai.azure.com`; `AZURE_FOUNDRY_MODEL` is the name of the Claude
  deployment. Foundry has no server-side fallback, so a declined request is reported as declined.
- **gemini**: `GEMINI_MODEL` has no default, because Gemini models are retired often. Use a model
  with function calling, such as a current Gemini Pro.
- **azure-openai**: `AZURE_OPENAI_ENDPOINT` is `https://<resource>.openai.azure.com/` and
  `AZURE_OPENAI_DEPLOYMENT` the name of the GPT deployment. Requests go to the v1 endpoint
  (`/openai/v1/`) through the Responses API, so there is no api-version to set: Chat Completions
  rejects function tools with reasoning on from GPT-5.6 onwards. Nothing is stored on Azure: the
  conversation is sent whole every turn. Set `AZURE_OPENAI_REASONING=true` for reasoning models
  (GPT-5 and later, o-series): the effort is then sent as `reasoning.effort`; other models reject it.

Authentication is by API key on every provider. The quality of the assistant and above all of
the code agent depends on the model: the prompts and tools were written and tested with Claude.

## The console assistant

The assistant acts on the project open in the console, for the signed-in user and with that user's
permissions. Its tools are the [MCP tools](MCP.md) run in process, plus a few it alone has (searching
the documentation, reading the logs of a failed build, with credentials blanked). The project always
comes from the console, never from the model, and every tool goes through the same checks as on MCP:
the input is validated, a **VIEWER** cannot change anything, and errors read the same.

- **Writes** run directly. Tools that need a confirmation do not: every **destructive** one (deleting,
  deploying, rolling back, committing to a repository), and the writes that hand out access or cannot
  be undone without being destructive (`requiresConfirmation: true` on the tool: inviting to a project
  or an organization, resending a project invitation, creating an API key, discarding an AI change,
  setting canary users). The assistant stops and the panel shows a card, and the action runs only
  when the user confirms it. The card lists what the action acts on with names instead of ids
  (users by name and email, organization, project, environments, microfrontends with version and
  host, API key, MCP client, AI change with its request and files), resolved by the server with the
  user's own access; a `deploy` card says, per environment, which microfrontend versions, hosts and
  variables change compared to the active deployment (or everything it will serve on a first
  deployment). A name that cannot be resolved is shown as the raw value; the input the model sent is
  one click away. The card expires after 15 minutes and can be answered once; it is bound to the user
  and the project it was asked in (kept in Redis when configured, in memory otherwise).
- When a turn stops for a confirmation, what the model said and got back since the user's message is
  parked with the action (thinking blocks and thought signatures included, up to 400 000 characters,
  dropping the oldest rounds first) and replayed when the user answers, with the real outcome in
  place of the waiting call's result: Gemini and Claude with thinking reject a tool call replayed
  without them.
- Every answer shows under it the tokens it used, every model round summed: the input (with the
  part read from the prompt cache, far cheaper) and the output. Each answer is also logged with
  `audit: "assistant_usage"`, the user, the project and the same counts. Input tokens count the
  whole prompt on every provider: for Claude the cache reads and writes are added back.
- Every write the assistant runs, confirmed or refused, is logged with `audit: "assistant_tool_call"`,
  the tool, the project (or the `organizationId` for organization tools), the user, the outcome, the
  `actionId` of a confirmed action on each of its lines, and the arguments reduced to ids and short
  identifying values (email, role, name, key...): never free text or secrets.
- Beyond the MCP tools, the assistant also has console-only tools (never offered to MCP clients):
  deleting the project, project members (inviting, resending invitations, changing roles, removing;
  only a project owner or an administrator of its organization, and never the last owner), organization settings,
  creation, deletion and members, API keys (a new key is shown in the panel only, never sent to the
  model), MCP client connections, bulk creation and deletion of environments, bulk deletion of
  microfrontends, the canvas layout, creating a microfrontend from a template, and AI code changes.
  Changing a member's role (in a project or an organization), removing a member and revoking a key or
  a connection are destructive, so they are confirmed through the card; inviting, resending an
  invitation and creating a key are confirmed too. Inviting to a project or resending its invitation
  takes a project owner (or an organization administrator), and inviting an organization owner takes
  an organization owner, in the console pages as through the assistant.
- Build logs read by the assistant are redacted before they reach the model: known token formats
  (GitHub, GitLab, npm, AWS, Slack, JWT), credentials in URLs, `password=`/`token:` assignments,
  variables named like `*SECRET*`, `*KEY*`, `*TOKEN*`, `*PASSWORD*`, `*PASSWD*`, `*PWD*`, `Bearer`
  tokens, PEM private keys, Azure `AccountKey=` and `SharedAccessSignature=` values and `sig=` in
  SAS URLs.
- Some things stay in the console pages on purpose, because their input or output is a secret that
  would travel to the model provider: storages, repository connections, the user profile and bundle
  upload.
