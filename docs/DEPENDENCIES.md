# Dependency analysis and peer dependency alignment

Every microfrontend of a project lives in its own repository, so nothing stops two of them
from pinning a different version of React, of the design system, or of any other shared
library. This feature walks those repositories, reports what each one declares, flags what is
behind the npm registry, and can rewrite the misaligned `peerDependencies` for you.

## What the scan does

1. Lists the microfrontends of the current project that have a code repository connected
   (`codeRepository.enabled`).
2. Reads the `package.json` at the root of each repository, on the branch chosen for that
   microfrontend, through the provider API (GitHub, GitLab or Azure DevOps — no clone involved).
3. Resolves every distinct package name against the npm registry and compares the declared
   range with the version published as `latest`.
4. Groups the declarations across microfrontends to find the ones that disagree.

The scan is read-only and is never cached in the database: it always reflects the current state
of the repositories. Registry answers are cached in memory for one hour.

### Choosing the branch

Each microfrontend is compared on its own branch, picked independently of the others. The
default is the **default branch of its repository**, so the scan works out of the box; the UI
lists the available branches per microfrontend and lets you point one at `develop`, a release
branch, or anything else before rescanning.

`GET /dependencies/targets` returns what the scan would walk — one entry per microfrontend with
its `defaultBranch` and the `branches` available — and every other endpoint accepts a `branches`
map keyed by microfrontend id. Microfrontends left out of the map fall back to their default
branch.

### Update status

The status of a dependency compares the **floor of the declared range** (`^18.2.0` → `18.2.0`)
with the registry `latest`:

| Status         | Meaning                                              |
| -------------- | ---------------------------------------------------- |
| `UP_TO_DATE`   | The floor is greater than or equal to `latest`       |
| `PATCH_BEHIND` | Same major and minor, older patch                    |
| `MINOR_BEHIND` | Same major, older minor                              |
| `MAJOR_BEHIND` | Older major                                          |
| `UNKNOWN`      | The range does not point to a registry version (`*`, `file:`, git urls, …) or the package is not published on the registry |

### Alignment issues

A package is reported as misaligned when at least two microfrontends declare it and the
declared ranges are not all identical. The **suggested range** is the highest range already in
use inside the project — never a version nobody has validated yet — with ties broken by the
most frequently declared range, so that the alignment touches as few repositories as possible.

Mismatches are computed both for `peerDependencies` and for `dependencies`. The ones on
`dependencies` are reported for visibility only: the alignment action never rewrites them.

## Applying the alignment

The alignment commits the updated `package.json` on a dedicated branch of every repository —
`chore/align-peer-dependencies` by default — created from the branch that was compared.
**That base branch is never modified**: if the target branch resolves to the branch being
compared, that repository is skipped with an error. Existing branches are reused, and the
manifest is re-read from the target branch before the change is applied, so re-running the
alignment is idempotent.

Pass the same `branches` map used for the scan, otherwise the alignment is computed — and
branched — from the default branches instead of the ones you compared.

Only the `peerDependencies` section is rewritten. The indentation and the key order of the
original file are preserved.

Every repository is processed independently: a failure on one of them (revoked token, missing
`package.json`, protected branch) is reported in the response and does not stop the others.

## API

All the endpoints below are scoped to the project carried by the `Project-Id` header.

| Method | Path                                | Description                                                       |
| ------ | ----------------------------------- | ----------------------------------------------------------------- |
| `GET`  | `/dependencies/targets`             | Microfrontends the scan would walk, with default and available branches |
| `GET`  | `/dependencies`                     | Full report on the default branches                                |
| `GET`  | `/projects/:projectId/dependencies` | Same report, with the project in the path                          |
| `POST` | `/dependencies/report`              | Full report on the branches given in the body                      |
| `POST` | `/dependencies/peer/alignment-plan` | Dry run: what would change, repository by repository               |
| `POST` | `/dependencies/peer/align`          | Applies the alignment and returns the outcome per repository       |

The body of the `POST` endpoints is optional. `/dependencies/report` accepts `branches` only,
the two alignment endpoints accept every field:

```jsonc
{
  "branches": { "<microfrontendId>": "develop" }, // branch to compare, defaults to the repository default
  "microfrontendIds": ["..."], // restrict to these microfrontends, defaults to all
  "packages": ["react"],       // restrict to these packages, defaults to every misaligned one
  "branchName": "chore/align-peer-dependencies",
  "commitMessage": "chore(deps): align peer dependencies"
}
```

## Configuration

| Variable           | Default                      | Description                                              |
| ------------------ | ---------------------------- | -------------------------------------------------------- |
| `NPM_REGISTRY_URL` | `https://registry.npmjs.org` | Registry queried for the latest published versions        |

When the registry cannot be reached the report is still produced: the update status of every
dependency falls back to `UNKNOWN`, `registryAvailable` is `false`, and the cross-microfrontend
comparison — including the peer dependency alignment — keeps working.

## Limitations

- Only the `package.json` at the **root** of the repository is analysed; monorepo workspaces
  inside a microfrontend repository are not walked.
- Ranges are compared through a minimal semver implementation: the floor of the range is used,
  complex unions (`1.x || 2.x`) are reduced to their first version token.
- Private packages that are not published on the configured registry are reported as `UNKNOWN`,
  never as outdated.
