# Editing a microfrontend with AI

From **Edit with AI**, the screen a microfrontend opens on, a user describes a change ("add a 404 page"). An
AI agent works on a local clone of the microfrontend's repository and proposes the change as a diff.
Nothing reaches the repository until the user approves it: then the console commits the approved
files on a new branch, pushes it and opens a pull request (a merge request on GitLab).

Each request is a conversation. Once the proposal is ready the user can keep chatting with the agent to
refine it ("also translate the page"). Each message is a follow-up: the agent starts from the files of
the previous proposal, is told what was asked before, and its new proposal replaces the previous one.
Only the latest proposal can be applied. A failed follow-up leaves the previous proposal open to apply
or to refine again. Once a proposal is applied or discarded, the conversation is closed and a new change
starts from the base branch. The pull request is named after the first message and its description quotes
every message of the conversation. Once a proposal is applied, the whole conversation is kept, not removed
with the proposals.

It is available when an [AI provider](AI-PROVIDERS.md) is configured and the microfrontend has a
code repository connected (GitHub, GitLab or Azure DevOps).

## How it works

1. The request is stored and a background job starts; the console follows it by polling.
2. The job takes a lock on the microfrontend's working copy (Redis, or in-process without Redis), so
   two requests on the same repository queue instead of sharing a checkout.
3. The working copy is cloned if missing, otherwise fetched and reset to `origin/<base branch>`:
   every run starts from exactly what the remote has.
4. The agent explores and edits the files. It receives the [project and microfrontend context](MCP.md#project-context)
   and the detected stack.
5. The changed files (original and proposed content) are stored as a proposal, the working copy is
   reset and the lock released. Proposals nobody acts upon are removed after 7 days.
6. On approval the copy is reset to the latest base again and every file is checked to still be what
   the agent saw. A file changed on the base branch in the meantime stops the apply with a conflict,
   so nothing is silently overwritten. Then the approved files are committed on
   `ai/<microfrontend>-<timestamp>` (author: the approving user, committer: MFE Orchestrator), pushed,
   and a pull request is opened. If the provider refuses the pull request (for example a token
   without that permission), the branch stays pushed and the console says so.

Clone, fetch, commit and push use [isomorphic-git](https://isomorphic-git.org): no `git` binary is
needed in the image, and no repository hook is ever run.

## Changing a whole domain

**Edit with AI** on a functional domain starts one agent on every microfrontend and service of the
domain that has a code repository (at most 10), with the project and domain context. It sees them all
at once, so one change can span an API and the screens that call it, and it still proposes one diff
per repository: applying them opens one pull request per repository. Members without a repository are
left out and listed under the request.

When the domain has nothing for the agent to work on yet, **Generate** first offers to create it:

- **No microfrontend and no service:** one model call proposes the components the request needs
  (usually a frontend and a backend, at most 3 of each), each with a name, a slug, a template and a
  repository name ending in `-fe` or `-be`. The user reviews and edits the proposal; on confirmation
  the console creates each one in the domain with a new repository scaffolded from its template, then
  starts the job on them.
- **Members, none with a repository:** the console asks to create one per member (named
  `<slug>-fe` or `<slug>-be`, scaffolded from the member's template or the default of its kind), then
  starts the job.

Both need a code repository connection on the project. Creating a repository for an existing member
is also available as `POST /microfrontends/:id/repository` and `POST /services/:id/repository`;
viewers cannot use it.

## Where the repositories are cloned

```
$REPOSITORIES_FOLDER/<organization-slug>-<id>/<project-slug>-<id>/<microfrontend-slug>/
```

| Variable                        | Default                                              | What it does                                         |
| ------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| `REPOSITORIES_FOLDER`           | `/repositories`, `/data/repositories` in all-in-one | Root of the clones.                                  |
| `REPOSITORIES_MAX_SIZE_MB`      | `500`                                                | A clone bigger than this is refused and deleted.     |
| `REPOSITORIES_EVICT_AFTER_DAYS` | `14`                                                 | Clones not used for this long are deleted.           |

The folder is a **cache**: deleting it only costs a new clone. Clones are also removed when their
microfrontend or project is deleted. On Kubernetes the chart mounts an `emptyDir` there
(`repositories.sizeLimit`, 10Gi by default); set `repositories.existingClaim` to keep the clones across
restarts. Each replica can have its own folder: there is no state to share.

Credentials are never written to disk: the clone URL has no token in it and the provider token is
handed to each network call.

## What the agent can and cannot do

- It can list, search, read, write and delete files **inside the working copy only**. Every path is
  resolved after following symlinks: `..`, absolute paths, `.git` and symlinks pointing out of the
  repository are refused.
- It cannot read files that usually hold credentials (`.env*`, `.npmrc`, `*.pem`, `*.key`, ...).
- It cannot change CI configuration (`.github/workflows`, `.gitlab-ci.yml`, `azure-pipelines*.yml`) or
  lockfiles: a pushed branch runs CI with the repository secrets.
- It cannot run anything: no install, build or test. The repository's CI checks the pull request.
- At most 20 files and 500 KB written per request, 40 model rounds.
- It never pushes. Only the user's approval writes to the remote, and only on a new branch.

## Who can use it

Any member of the project can see the requests. Viewers can neither ask for a change nor apply or
discard one; organization administrators can. Requests count against `ASSISTANT_RATE_LIMIT_MAX`,
per user, like the assistant. The token usage of each request is stored and shown in the console.
