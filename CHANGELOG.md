# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Monorepo Architecture**: Migrated to pnpm workspace with centralized dependency management
- **Turbo Build System**: Added Turborepo for optimized build and task orchestration
- **Biome Integration**: Replaced ESLint + Prettier with Biome for unified linting and formatting
- **Lefthook Git Hooks**: Migrated from Husky to Lefthook for improved git hook management
- **Commitlint Integration**: Added automated conventional commit validation
- **VSCode Configuration**: Added shared VSCode settings and extensions for team consistency
- **Centralized Configuration**: Unified Biome configuration for consistent code style across packages

### Changed

- **Package Management**: Migrated from individual package management to centralized pnpm workspace
- **Build System**: Replaced individual build scripts with Turbo-powered monorepo builds
- **Code Quality**: Unified linting and formatting across backend and frontend with Biome
- **Git Hooks**: Improved pre-commit hooks with optimized file processing and parallel execution
- **Development Workflow**: Streamlined development setup with workspace-level commands

### Fixed

- **Version Mismatches**: Resolved Fastify and Mongoose interface compatibility issues
- **Dependency Conflicts**: Eliminated duplicate dependencies across packages
- **Code Style Inconsistencies**: Standardized formatting and linting rules project-wide
- **Git Hook Performance**: Optimized hook execution with glob patterns and parallel processing

### Removed

- **Husky**: Replaced with Lefthook for better performance and configuration
- **ESLint + Prettier**: Replaced with Biome for unified tooling
- **Individual pnpm-lock files**: Consolidated to workspace-level dependency management
- **Duplicate configurations**: Removed redundant config files across packages

### Technical Improvements

- **Monorepo Structure**: Organized as pnpm workspace with `backend/` and `frontend/` packages
- **Turbo Configuration**: Added optimized build pipeline with proper task dependencies
- **Biome Setup**: Configured with TypeScript-aware rules and package-specific overrides
- **Lefthook Hooks**: Set up with conditional execution based on file changes
- **Commitlint Rules**: Enforced conventional commits with custom type validation

---

## [1.0.0] - TBD

### Added

- Microfrontend orchestration hub with JSON-based configuration
- Multi-environment support (DEV, UAT, PROD, etc.)
- Project management with user roles and permissions
- Environment-specific microfrontend configurations
- Deployment management system
- Code repository integration (GitHub, GitLab, Azure DevOps)
- Storage integration (S3, Azure Storage, Google Cloud Storage)
- API key authentication
- User authentication (Local, Auth0, Azure AD, Google OAuth)
- Global environment variables management
- Canary deployment support
- Market/templates library
- Comprehensive error handling
- API documentation with Swagger

### Documentation

- README with environment variables
- Cursor rules for development workflow
- Commit conventions documentation
- Security documentation

---

## Versioning

We use [SemVer](http://semver.org/) for versioning. Given a version number MAJOR.MINOR.PATCH, we increment the:

- **MAJOR** version when we make incompatible API changes
- **MINOR** version when we add functionality in a backwards-compatible manner
- **PATCH** version when we make backwards-compatible bug fixes

### Commit Type to Version Mapping

- **`feat`** commits → **MINOR** version bump
- **`fix`** commits → **PATCH** version bump
- **BREAKING CHANGE** → **MAJOR** version bump

## Legend

- **Added** - New features
- **Changed** - Changes in existing functionality
- **Deprecated** - Soon-to-be removed features
- **Removed** - Removed features
- **Fixed** - Bug fixes
- **Security** - Security improvements

## How to Update This Changelog

This changelog is maintained manually but can be generated automatically using tools that parse Conventional Commits. When making changes:

1. Add your changes under the appropriate section
2. Follow the format: **"- Brief description of change (#PR number)"**
3. Group changes by type (Added, Changed, Fixed, etc.)
4. Place the most recent changes at the top of each section
5. Link to related issues or pull requests when applicable

### Example

```markdown
## [1.1.0] - 2024-01-15

### Added

- Dark mode support for the UI (#123)
- Export project configuration as JSON (#124)

### Changed

- Improved deployment performance (#125)

### Fixed

- Resolved authentication token expiration issue (#126)
```

## Automated Changelog Generation

This project can use tools like:

- [standard-version](https://github.com/conventional-changelog/standard-version)
- [semantic-release](https://github.com/semantic-release/semantic-release)
- [release-please](https://github.com/googleapis/release-please)

These tools automatically:

1. Parse Conventional Commits
2. Generate changelog entries
3. Bump version numbers
4. Create git tags
5. Generate release notes

## Release Workflow

1. Merge feature branches into main
2. Generate changelog from commits
3. Bump version according to Conventional Commits
4. Tag release
5. Publish release notes

---

**Note**: This is a living document. As we release new versions, this changelog will be updated to reflect all changes.
