# Dependency analysis and peer dependency alignment

Every microfrontend of a project lives in its own repository, so nothing stops two of them
from pinning a different version of React, of the design system, or of any other shared
library. This feature walks those repositories, reports what each one declares, flags what is
behind the npm registry, and can rewrite the misaligned `peerDependencies` for you.

## What the scan does

1. Lists the microfrontends of the current project that have a code repository connected
   (`codeRepository.enabled`).
2. Reads the `package.json` at the root of each repository, on its **default branch**, through
   the provider API (GitHub, GitLab or Azure DevOps — no clone involved).
3. Resolves every distinct package name against the npm registry and compares the declared
   range with the version published as `latest`.
4. Groups the declarations across microfrontends to find the ones that disagree.

The scan is read-only and is never cached in the database: it always reflects the current state
of the repositories. Registry answers are cached in memory for one hour.

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
`chore/align-peer-dependencies` by default. **The default branch is never modified**: if the
target branch resolves to the repository default branch, that repository is skipped with an
error. Existing branches are reused, and the manifest is re-read from the target branch before
the change is applied, so re-running the alignment is idempotent.

Only the `peerDependencies` section is rewritten. The indentation and the key order of the
original file are preserved.

Every repository is processed independently: a failure on one of them (revoked token, missing
`package.json`, protected branch) is reported in the response and does not stop the others.

## API

All the endpoints below are scoped to the project carried by the `Project-Id` header.

| Method | Path                                     | Description                                                     |
| ------ | ---------------------------------------- | --------------------------------------------------------------- |
| `GET`  | `/dependencies`                          | Full report: dependencies per microfrontend and alignment issues |
| `GET`  | `/projects/:projectId/dependencies`      | Same report, with the project in the path                        |
| `POST` | `/dependencies/peer/alignment-plan`      | Dry run: what would change, repository by repository             |
| `POST` | `/dependencies/peer/align`               | Applies the alignment and returns the outcome per repository     |

The body of the two `POST` endpoints is optional and accepts:

```jsonc
{
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
