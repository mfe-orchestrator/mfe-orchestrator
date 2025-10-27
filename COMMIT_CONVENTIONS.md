# Commit Conventions

This project follows the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification for commit messages.

## Why Conventional Commits?

- 📝 Automatically generate CHANGELOGs
- 🔄 Automatically determine semantic version bumps
- 💬 Communicate changes clearly to team members and stakeholders
- 🚀 Trigger build and publish processes
- 👥 Make it easier for contributors to understand the commit history

## Commit Message Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

## Commit Types

### Required Types

- **`feat`**: A new feature (correlates with MINOR in SemVer)
  ```
  feat: add dark mode toggle
  feat(frontend): implement project selection dropdown
  ```

- **`fix`**: A bug fix (correlates with PATCH in SemVer)
  ```
  fix: resolve authentication token expiration
  fix(backend): handle missing environment variables gracefully
  ```

### Additional Types

- **`build`**: Changes to the build system or dependencies
  ```
  build: update dependencies to latest versions
  build(deps): bump axios from 1.5.0 to 1.6.0
  ```

- **`chore`**: Routine tasks, maintenance work
  ```
  chore: update CI/CD configuration
  chore(deps): update development dependencies
  ```

- **`ci`**: Changes to CI configuration files and scripts
  ```
  ci: add automated deployment pipeline
  ci: configure SonarQube for code quality checks
  ```

- **`docs`**: Documentation only changes
  ```
  docs: update API documentation
  docs(readme): add environment variables section
  ```

- **`refactor`**: Code changes that neither fix bugs nor add features
  ```
  refactor: simplify authentication service
  refactor(service): improve error handling structure
  ```

- **`perf`**: Performance improvements
  ```
  perf: optimize database queries
  perf(backend): add Redis caching layer
  ```

- **`style`**: Code style changes (formatting, missing semicolons, etc.)
  ```
  style: apply Prettier formatting
  style(frontend): fix ESLint warnings
  ```

- **`test`**: Adding or updating tests
  ```
  test: add unit tests for user service
  test(controller): add integration tests for API endpoints
  ```

## Scopes (Optional)

Use scopes to specify the area of the codebase affected:

### General Scopes
- `backend` - Backend codebase
- `frontend` - Frontend codebase

### Module Scopes
- `api` - API endpoints
- `auth` - Authentication module
- `ui` - UI components
- `i18n` - Internationalization

### Backend Layer Scopes
- `controller` - Backend controllers
- `service` - Backend services
- `model` - Database models
- `plugin` - Fastify plugins
- `utils` - Utility functions

### Frontend Layer Scopes
- `component` - React components
- `page` - React pages
- `hook` - Custom hooks
- `store` - State management (Zustand)
- `api` - API clients

## Breaking Changes

Breaking changes must be clearly marked:

### Option 1: Use `!` in the type/scope prefix
```
feat!: change authentication API structure

feat(api)!: remove deprecated endpoints

chore!: drop support for Node 16
```

### Option 2: Use `BREAKING CHANGE:` footer
```
feat: update API response format

BREAKING CHANGE: API now returns data in nested object structure instead of flat
```

### Option 3: Both (for emphasis)
```
chore!: drop support for Node 16

BREAKING CHANGE: use JavaScript features not available in Node 16
```

## Examples

### Basic Feature
```
feat: add deployment dashboard page
```

### Feature with Scope
```
feat(api): add GET /microfrontends endpoint
```

### Bug Fix
```
fix(auth): handle expired tokens correctly
```

### Breaking Change
```
feat!: change authentication API structure

BREAKING CHANGE: Authentication now requires API key instead of JWT token
```

### Refactor
```
refactor(service): simplify authorization checks

- Consolidate duplicate authorization logic
- Improve error messages
- Add proper logging
```

### Multi-paragraph Commit
```
fix(deployment): prevent racing conditions

Introduce a request id and a reference to latest deployment request.
Dismiss incoming responses other than from latest request.

Remove timeouts which were used to mitigate the racing issue.

Reviewed-by: John Doe
Closes: #123
```

### Documentation
```
docs: update README with environment variables

Add all required environment variables with descriptions
and default values for local development.
```

### Performance Improvement
```
perf(backend): optimize database queries

Replace N+1 queries with aggregation pipeline
Add database indexes for frequently queried fields
```

## Best Practices

### ✅ Do:
- Use imperative mood in descriptions: "add", "fix", "update" (not "added", "fixed", "updated")
- Keep descriptions concise but descriptive
- Use body for detailed explanation when needed
- Reference issues in footers: `Closes: #123` or `Refs: #456`
- Use consistent scopes for related commits
- Make one logical change per commit
- Split large changes into multiple commits

### ❌ Don't:
- Write vague descriptions: "fix stuff", "updates"
- Include multiple unrelated changes in one commit
- Write commit messages in past tense
- Use abbreviations without context
- Include implementation details in the description (use body instead)

## Multiple Types in One Commit

If your commit involves multiple types (e.g., adding a feature and updating tests):

1. **Prefer splitting into separate commits**
   ```
   feat: add user registration endpoint
   test: add integration tests for user registration
   ```

2. **If splitting is impractical, use the most significant type**
   ```
   feat: implement user authentication system

   - Add user registration endpoint
   - Implement login flow
   - Add password reset functionality
   - Update API documentation
   ```

## Revert Commits

For reverting changes, use the `revert` type:

```
revert: revert user registration feature

Refs: abc123d, def456g

This reverts commit abc123d which introduced a security vulnerability
```

## Git Workflow Integration

### Branch Naming
Use feature branches following this pattern:
```
feature/add-user-authentication
fix/resolve-token-expiration
refactor/simplify-service-layer
```

### Pull Requests
- Squash commits into logical groups
- Update PR title to follow Conventional Commits format
- Include detailed description in PR body

### Commit Message Template

Here's a template you can use:

```
<type>(<scope>): <subject>

<body>

<footer>
```

## Tools & Automation

This project uses Conventional Commits to:
- Generate CHANGELOGs automatically
- Determine semantic versioning
- Categorize changes for releases
- Automate release notes

## Resources

- [Conventional Commits Specification](https://www.conventionalcommits.org/en/v1.0.0/)
- [Semantic Versioning](https://semver.org/)
- [Angular Commit Message Guidelines](https://github.com/angular/angular/blob/main/CONTRIBUTING.md#-commit-message-guidelines)

## Quick Reference Card

```
feat:          New feature
fix:           Bug fix
docs:          Documentation
style:         Formatting, missing semicolons
refactor:      Code refactoring
perf:          Performance improvement
test:          Adding tests
chore:         Maintenance
build:         Build system or dependency changes
ci:            CI configuration changes
```

**Breaking changes**: Add `!` after type/scope or use `BREAKING CHANGE:` footer

