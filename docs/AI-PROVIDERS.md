# AI providers

The console assistant, the project draft of the new project wizard and
[editing a microfrontend with AI](AI-CODE-CHANGES.md) run on the AIs an **organization** defines.
Each AI is a provider, a model and the credentials to reach it; an organization may define several
(Claude on the Anthropic API and on AWS Bedrock, GPT on Azure OpenAI...), and the user picks one per
request in a selector next to the effort, preselected on the default.

## AIs of an organization

On the organization page every member sees the list of AIs; owners and admins add, edit and delete
them. Credentials (`apiKey`, `secretAccessKey`) are encrypted at rest like the storage credentials
(see [SECRETS.md](SECRETS.md)) and never sent back: the API answers a placeholder, and saving the
form with the placeholder keeps the stored key, as long as the provider and where the key is sent
(the Foundry resource, the Azure OpenAI endpoint, the AWS access key id) stay the same. Pointing a key
elsewhere means typing it again.

| Provider        | Model                       | Configuration                              | Model field                                 |
| --------------- | --------------------------- | ------------------------------------------ | ------------------------------------------- |
| `anthropic`     | Claude, Anthropic API       | `apiKey`                                   | optional, `claude-opus-5-5`                 |
| `azure-foundry` | Claude on Microsoft Foundry | `resource`, `apiKey`                       | the deployment, optional, `claude-opus-5-5` |
| `aws-bedrock`   | Claude on Amazon Bedrock    | `region`, `accessKeyId`, `secretAccessKey` | required: the Bedrock model id              |
| `gemini`        | Gemini, Gemini API          | `apiKey`                                   | required                                    |
| `azure-openai`  | GPT on Azure OpenAI         | `endpoint`, `apiKey`, `reasoning`          | required: the deployment                    |

An AI may also have a **maximum effort** (see below) and be the organization's **default**: at most
one is, marking one unmarks the others. Names are unique in the organization, whatever the case.
Changing the provider of an AI means typing its keys again: the stored ones are never sent to another
provider. Deleting an AI takes it out of every project restricted to it. Deleting the organization
deletes its AIs.

The Azure OpenAI endpoint of an organization's AI must be an Azure host, exactly
`https://<resource>.openai.azure.com/` (or `.cognitiveservices.azure.com`, `.services.ai.azure.com`):
no IP address, no credentials, no port other than 443, no path or query; redirects are not followed.
The server sends the key there and relays the outcome, so a free URL would let an organization
administrator reach the network the server sits in. For the sovereign clouds the installation adds
suffixes with `AZURE_OPENAI_ENDPOINT_SUFFIXES`, comma separated (e.g.
`.openai.azure.us,.openai.azure.cn`). For the same reason a provider's own error message is never
shown to users nor stored on a job: they get a generic error (`AI_PROVIDER_ERROR`), or `RATE_LIMITED`
for a rate limit, and the provider's message goes to the server log.

Errors of the AI form are 422 `AI_MODEL_INVALID` with `details.field`, the first field at fault
(`name`, `provider`, `model`, `config.apiKey`, `config.endpoint`, `config.region`, `config.resource`...),
`details.missing` listing every field when several are missing, and `details.reason: "secret_required"`
when a stored key cannot be reused and has to be typed again.

## Which AIs a project may use

By default a project may use every AI of its organization, the ones added later included. Owners and
admins of the organization may restrict a project to some of them in the "Project access" table of the
organization page; restricting it to none turns AI off for that project. With no AI available the
assistant is hidden, the AI endpoints answer 404 (`ASSISTANT_DISABLED`) and nothing is sent anywhere.

The AI preselected is the organization's default when the project may use it, otherwise the first one
(the organization's by name, then the system AI). A request naming an AI the project may not use is
refused with 422 `AI_MODEL_NOT_AVAILABLE`, before anything starts. A follow-up of an AI job runs on its
parent's AI unless another is chosen, or on the default when the parent's is no longer available: the
conversation kept between jobs holds no provider-specific data, so switching is safe. Jobs, their
requests and the assistant usage record the AI they ran on (`aiModelId`). The wizard, which runs before
the project exists, uses the AIs of the organization the project is created in.

## The system AI

The environment variables of the installation describe one more AI, the **system AI**, offered to every
organization next to its own, with the id `system`. It is read-only in the console, shown to
administrators too without its configuration, and can be excluded from a project like any other. With
none of these variables set there is no system AI: a project restricted to `system` alone then has no
AI left, until the variables come back or the project is given other AIs.

| `AI_PROVIDER`   | Model                              | Required variables                                                                                     | Optional                                   |
| --------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| `anthropic`     | Claude, Anthropic API              | `ANTHROPIC_API_KEY`                                                                                    | `ANTHROPIC_MODEL` (`claude-opus-5-5`)      |
| `azure-foundry` | Claude on Microsoft Foundry        | `AZURE_FOUNDRY_RESOURCE`, `AZURE_FOUNDRY_API_KEY`                                                      | `AZURE_FOUNDRY_MODEL` (`claude-opus-5-5`)  |
| `aws-bedrock`   | Claude on Amazon Bedrock           | `AWS_BEDROCK_REGION`, `AWS_BEDROCK_ACCESS_KEY_ID`, `AWS_BEDROCK_SECRET_ACCESS_KEY`, `AWS_BEDROCK_MODEL` |                                            |
| `gemini`        | Gemini, Gemini API                 | `GEMINI_API_KEY`, `GEMINI_MODEL`                                                                       |                                            |
| `azure-openai`  | GPT on Azure OpenAI                | `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`                             | `AZURE_OPENAI_REASONING` (`false`)         |

`AI_PROVIDER` left empty with `ANTHROPIC_API_KEY` set keeps working as before: Claude through the
Anthropic API. A provider named without one of its required variables stops the backend at boot,
with the missing variables in the error. `AI_MAX_EFFORT` is the system AI's maximum effort.

## Notes per provider

- **anthropic**: requests that Claude declines are retried on another model by the API itself
  (server-side fallback).
- **azure-foundry**: `AZURE_FOUNDRY_RESOURCE` is the resource name, as in
  `https://<resource>.services.ai.azure.com`; `AZURE_FOUNDRY_MODEL` is the name of the Claude
  deployment. Foundry has no server-side fallback, so a declined request is reported as declined.
- **aws-bedrock**: Claude through the Messages API of Bedrock (`bedrock-mantle.<region>.api.aws`),
  signed with the access key given (never the AWS variables of the process). The model is the
  Bedrock model id, such as `anthropic.claude-opus-5-5`, or an inference profile such as
  `global.anthropic.claude-sonnet-5-5`; the key needs permission to invoke it. Effort, adaptive
  thinking, prompt caching and structured outputs work as on the Anthropic API; there is no
  server-side fallback, so a declined request is reported as declined.
- **gemini**: the model has no default, because Gemini models are retired often. Use a model
  with function calling, such as a current Gemini Pro.
- **azure-openai**: the endpoint (`AZURE_OPENAI_ENDPOINT`) is `https://<resource>.openai.azure.com/`
  and the model (`AZURE_OPENAI_DEPLOYMENT`) the name of the GPT deployment. Requests go to the v1 endpoint
  (`/openai/v1/`) through the Responses API, so there is no api-version to set: Chat Completions
  rejects function tools with reasoning on from GPT-5.6 onwards. Nothing is stored on Azure: the
  conversation is sent whole every turn. Turn `reasoning` on (`AZURE_OPENAI_REASONING=true` for the
  system AI) for reasoning models (GPT-5 and later, o-series): the effort is then sent as
  `reasoning.effort`; other models reject it.

Authentication is by API key on every provider. The quality of the assistant and above all of
the code agent depends on the model: the prompts and tools were written and tested with Claude.

## Reasoning effort and visible reasoning

Users choose how hard the model reasons: per question in the assistant, per job (and follow-up) in
Code with AI. The levels are `low`, `medium`, `high`, `xhigh` and `max`: more effort means deeper
reasoning, slower answers and more tokens. When none is chosen the assistant answers at `medium`, a
new AI job runs at `high` and a follow-up at its parent's effort. The effort used is shown next to
the token usage and recorded in the usage audit (`assistant_usage`, `ai_job_usage`). The reasoning
counts towards the output ceiling of each model turn, so the ceiling grows with the effort: 16K
tokens up to `medium`, 32K at `high` and 64K at `xhigh` and `max` for the assistant; 32K up to
`high` and 64K above for the code agent.

| Provider                                          | Levels offered                                                |
| ------------------------------------------------- | ------------------------------------------------------------- |
| `anthropic`, `azure-foundry`, `aws-bedrock`       | all five                                                      |
| `azure-openai` with `reasoning` on                | `low`, `medium`, `high`; `xhigh` and `max` are sent as `high` |
| `azure-openai` without reasoning, `gemini`        | none: the choice is hidden; Gemini ignores the effort         |

The levels on Claude and its adaptive thinking need **Claude Opus 4.7 / Sonnet 5 or later**. The
default model, `claude-opus-5-5`, is one. On Foundry the model must name a deployment of such a
model, on Bedrock such a model id: an older one rejects the requests.

Claude also returns a summary of its reasoning. The assistant streams it live above the answer and
keeps it in saved conversations; an AI job logs it as progress lines, the first 1 000 characters of
each turn. What is kept has secrets masked, as the answers do. The summary changes what is shown,
not what is billed. The other providers show no reasoning.

The maximum effort of an AI (`AI_MAX_EFFORT` for the system AI; optional: `low`, `medium`, `high`,
`xhigh` or `max`) caps the effort users may choose with it. The console offers no level above it, and
a request asking for more is served at the cap, which is what gets stored and audited. Unset, every
level the provider takes is offered. On an installation open to sign-ups it bounds the cost of one
question: at `max` each model turn may produce up to 64K tokens. The usage audit lines carry the AI
too (`aiModelId`).

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
  host, services, domains, API key, MCP client, AI change with its request and files), resolved by the server with the
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
