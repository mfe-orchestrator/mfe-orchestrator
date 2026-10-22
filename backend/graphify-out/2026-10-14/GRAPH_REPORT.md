# Graph Report - backend  (2026-10-14)

## Corpus Check
- 246 files · ~190,051 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1827 nodes · 5173 edges · 91 communities (82 shown, 9 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 19 edges (avg confidence: 0.59)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `570c9cb5`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_MicrofrontendService.ts|MicrofrontendService.ts]]
- [[_COMMUNITY_MicrofrontendDependencyService.ts|MicrofrontendDependencyService.ts]]
- [[_COMMUNITY_ServeService.ts|ServeService.ts]]
- [[_COMMUNITY_MicrofrontendService|MicrofrontendService]]
- [[_COMMUNITY_UserService.ts|UserService.ts]]
- [[_COMMUNITY_toObjectId|toObjectId]]
- [[_COMMUNITY_ServeService|ServeService]]
- [[_COMMUNITY_GithubClient|GithubClient]]
- [[_COMMUNITY_CustomError|CustomError]]
- [[_COMMUNITY_FastifyInstance|FastifyInstance]]
- [[_COMMUNITY_TelemetryService.ts|TelemetryService.ts]]
- [[_COMMUNITY_dependencies|dependencies]]
- [[_COMMUNITY_GithubClient.ts|GithubClient.ts]]
- [[_COMMUNITY_CodeRepositoryService|CodeRepositoryService]]
- [[_COMMUNITY_AzureDevOpsClient.ts|AzureDevOpsClient.ts]]
- [[_COMMUNITY_CodeRepositoryService.ts|CodeRepositoryService.ts]]
- [[_COMMUNITY_DeploymentCanaryUsersService|DeploymentCanaryUsersService]]
- [[_COMMUNITY_ProjectWizardService|ProjectWizardService]]
- [[_COMMUNITY_compilerOptions|compilerOptions]]
- [[_COMMUNITY_package.json|package.json]]
- [[_COMMUNITY_GitLabClient|GitLabClient]]
- [[_COMMUNITY_devDependencies|devDependencies]]
- [[_COMMUNITY_scripts|scripts]]
- [[_COMMUNITY_BaseAuthorizedService.ts|BaseAuthorizedService.ts]]
- [[_COMMUNITY_compilerOptions|compilerOptions]]
- [[_COMMUNITY_postbuild.js|postbuild.js]]
- [[_COMMUNITY_recaptcha.ts|recaptcha.ts]]
- [[_COMMUNITY_cors.ts|cors.ts]]
- [[_COMMUNITY_ProjectNewDTO.ts|ProjectNewDTO.ts]]
- [[_COMMUNITY_CodeRepositoryService.ts|CodeRepositoryService.ts]]
- [[_COMMUNITY_is-canary.template.js|is-canary.template.js]]
- [[_COMMUNITY_user-id.template.js|user-id.template.js]]
- [[_COMMUNITY_User|User]]
- [[_COMMUNITY_BusinessException|BusinessException]]
- [[_COMMUNITY_autorization.ts|autorization.ts]]
- [[_COMMUNITY_AuthenticationMethod.ts|AuthenticationMethod.ts]]
- [[_COMMUNITY_RepositoryFileService.ts|RepositoryFileService.ts]]
- [[_COMMUNITY_ICodeRepository|ICodeRepository]]
- [[_COMMUNITY_GitlabClient.ts|GitlabClient.ts]]
- [[_COMMUNITY_StackDetectionService|StackDetectionService]]
- [[_COMMUNITY_IMarket|IMarket]]
- [[_COMMUNITY_FederationConfigService|FederationConfigService]]
- [[_COMMUNITY_EmailSenderService|EmailSenderService]]
- [[_COMMUNITY_.gitHubInjectApiKey|.gitHubInjectApiKey]]
- [[_COMMUNITY_projectWizardStateMachine.ts|projectWizardStateMachine.ts]]
- [[_COMMUNITY_Project|Project]]
- [[_COMMUNITY_CodeRepositoryModel.ts|CodeRepositoryModel.ts]]
- [[_COMMUNITY_ProjectService.ts|ProjectService.ts]]
- [[_COMMUNITY_secretCrypto.ts|secretCrypto.ts]]
- [[_COMMUNITY_StorageService.ts|StorageService.ts]]
- [[_COMMUNITY_AssistantService.ts|AssistantService.ts]]
- [[_COMMUNITY_organizationMigration.ts|organizationMigration.ts]]
- [[_COMMUNITY_CodeRepositoryService.ts|CodeRepositoryService.ts]]
- [[_COMMUNITY_StorageModel.ts|StorageModel.ts]]
- [[_COMMUNITY_FastifyInstance|FastifyInstance]]
- [[_COMMUNITY_BuildStatusService.ts|BuildStatusService.ts]]
- [[_COMMUNITY_BusinessException|BusinessException]]
- [[_COMMUNITY_EntityNotFoundError|EntityNotFoundError]]
- [[_COMMUNITY_BaseAuthorizedService.ts|BaseAuthorizedService.ts]]
- [[_COMMUNITY_DeploymentService|DeploymentService]]
- [[_COMMUNITY_assistantTools.ts|assistantTools.ts]]
- [[_COMMUNITY_createBusinessException|createBusinessException]]
- [[_COMMUNITY_organizationTools.test.ts|organizationTools.test.ts]]
- [[_COMMUNITY_AssistantController.ts|AssistantController.ts]]
- [[_COMMUNITY_GitlabClient.ts|GitlabClient.ts]]
- [[_COMMUNITY_IProject|IProject]]
- [[_COMMUNITY_build-docs-index.js|build-docs-index.js]]
- [[_COMMUNITY_BuildStatusService|BuildStatusService]]
- [[_COMMUNITY_wellKnownRoutes.ts|wellKnownRoutes.ts]]
- [[_COMMUNITY_.create|.create]]
- [[_COMMUNITY_MicrofrontendService.ts|MicrofrontendService.ts]]
- [[_COMMUNITY_toObjectId|toObjectId]]
- [[_COMMUNITY_BaseAuthorizedService.test.ts|BaseAuthorizedService.test.ts]]
- [[_COMMUNITY_encryptedFieldsPlugin.ts|encryptedFieldsPlugin.ts]]
- [[_COMMUNITY_StartupController.ts|StartupController.ts]]
- [[_COMMUNITY_BuildStatusDTO.ts|BuildStatusDTO.ts]]
- [[_COMMUNITY_IOrganization|IOrganization]]
- [[_COMMUNITY_migrations.ts|migrations.ts]]
- [[_COMMUNITY_docsSearch.ts|docsSearch.ts]]
- [[_COMMUNITY_UserOrganizationService.test.ts|UserOrganizationService.test.ts]]
- [[_COMMUNITY_GoogleStorageClient|GoogleStorageClient]]
- [[_COMMUNITY_McpController.ts|McpController.ts]]
- [[_COMMUNITY_codeRepositoryUtils.ts|codeRepositoryUtils.ts]]
- [[_COMMUNITY_AzureStorageClient|AzureStorageClient]]

## God Nodes (most connected - your core abstractions)
1. `toObjectId()` - 151 edges
2. `createBusinessException()` - 71 edges
3. `BaseAuthorizedService` - 70 edges
4. `Project` - 60 edges
5. `IMicrofrontend` - 53 edges
6. `IUser` - 47 edges
7. `CodeRepositoryService` - 47 edges
8. `Microfrontend` - 46 edges
9. `ServeService` - 43 edges
10. `UserProject` - 41 edges

## Surprising Connections (you probably didn't know these)
- `encryptedFields()` --indirect_call--> `document()`  [INFERRED]
  src/utils/encryptedFieldsPlugin.ts → src/utils/globalVariablesScript.test.ts
- `CreateBuildRequest` --references--> `CodeRepositoryType`  [EXTRACTED]
  src/client/GithubClient.ts → src/models/CodeRepositoryModel.ts
- `aiChangeController()` --references--> `FastifyInstance`  [EXTRACTED]
  src/controller/AiChangeController.ts → src/types/fastify.d.ts
- `deploymentController()` --references--> `FastifyInstance`  [EXTRACTED]
  src/controller/DeploymentCanaryUsersController.ts → src/types/fastify.d.ts
- `deploymentController()` --references--> `FastifyInstance`  [EXTRACTED]
  src/controller/DeploymentController.ts → src/types/fastify.d.ts

## Import Cycles
- None detected.

## Communities (91 total, 9 thin omitted)

### Community 0 - "MicrofrontendService.ts"
Cohesion: 0.11
Nodes (21): AcceptInvitationDTO, AddUserToProjectDTO, PopulatedProject, UpdateUserRoleDTO, UserProjectWithProject, AuthTokenDataDTO, organizationSchema, IUserDocument (+13 more)

### Community 1 - "MicrofrontendDependencyService.ts"
Cohesion: 0.08
Nodes (36): cache, CacheEntry, NpmAbbreviatedPackument, NpmPackageInfo, NpmRegistryClient, DEPENDENCY_SECTIONS, ManifestFile, ManifestSnapshot (+28 more)

### Community 2 - "ServeService.ts"
Cohesion: 0.07
Nodes (41): aToken(), callMcp(), ENVIRONMENT, grantState, listToolNames(), previousEnvironment, PROTOCOL_HEADERS, readJsonRpc() (+33 more)

### Community 3 - "MicrofrontendService"
Cohesion: 0.18
Nodes (16): aiChangeController(), applyBodySchema, createBodySchema, AiChangeRequest, IAiChangeRequest, ACTIVE_STATUSES, AiChangeApplyInput, AiChangeCreateInput (+8 more)

### Community 4 - "UserService.ts"
Cohesion: 0.16
Nodes (13): ALLOWED_AVATAR_MIME_TYPES, IUserAvatar, IUserAvatarDocument, userAvatarSchema, RegisterUserData, MicrofrontendUploadDTO, ResetPasswordDataDTO, ResetPasswordRequestDTO (+5 more)

### Community 5 - "toObjectId"
Cohesion: 0.21
Nodes (9): GlobalVariable, globalVariableSchema, IGlobalVariable, GlobalVariablesService, GetAllDataDTO, EnvironmentValue, GlobalVariableCreateDTO, GlobalVariableUpdateDTO (+1 more)

### Community 6 - "ServeService"
Cohesion: 0.06
Nodes (7): adm-zip, GoogleStorageClient, IEnvironment, IMicrofrontend, Microfrontend, MicrofrontendService, ServeService

### Community 8 - "CustomError"
Cohesion: 0.07
Nodes (15): CustomError, EnvironmentHeaderNotFoundError, InvalidCredentialsError, RFC-6749, ProjectHeaderNotFoundError, UserAlreadyExistsError, UserCannotAccessThisDeploymentError, UserCannotAccessThisEnvironmentError (+7 more)

### Community 9 - "FastifyInstance"
Cohesion: 0.12
Nodes (18): createSchema, microfrontendFields, microfrontendId, updateSchema, CanaryDeploymentType, CanaryType, HostedOn, ICanaryMicrofrontend (+10 more)

### Community 10 - "TelemetryService.ts"
Cohesion: 0.10
Nodes (23): telemetryController(), configSchema, Configuration, IConfiguration, logTelemetryNotice(), TelemetryService, fastify, FastifyContextConfig (+15 more)

### Community 11 - "dependencies"
Cohesion: 0.05
Nodes (39): dependencies, @anthropic-ai/sdk, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, axios, @azure/identity, @azure/storage-blob, bcryptjs (+31 more)

### Community 12 - "GithubClient.ts"
Cohesion: 0.11
Nodes (22): CreateBuildRequest, CreateRepositoryRequest, GithubAccessTokenResponse, GithubAccessTokenRquest, GithubBaseDTO, GithubBranch, GithubContentsResponse, GithubCreateBranchDTO (+14 more)

### Community 13 - "CodeRepositoryService"
Cohesion: 0.15
Nodes (16): ICodeRepositoryMicrofrontend, IHostMicrofrontend, CodeRepositoryImportService, FailedRepositoryResult, ImportableRepository, ImportedRepositoryResult, ImportRepositoriesResult, SkippedRepositoryResult (+8 more)

### Community 14 - "AzureDevOpsClient.ts"
Cohesion: 0.10
Nodes (19): AzureAccessTokenRequest, AzureAccessTokenResponse, AzureDevOpsBranch, AzureDevOpsBranchDTO, AzureDevOpsBuildsResponse, AzureDevOpsItem, AzureDevOpsPipeline, AzureDevOpsProject (+11 more)

### Community 15 - "CodeRepositoryService.ts"
Cohesion: 0.09
Nodes (22): S3BucketClient, S3ClientConfig, fastify, federationName(), buildMicrofrontendAdaptedToServe(), CodeIntegrationRequestDTO, escapeRegExp(), GetMicrofrontendAdaptedDataDTO (+14 more)

### Community 16 - "DeploymentCanaryUsersService"
Cohesion: 0.15
Nodes (8): deploymentController(), DeploymentToCanaryUsers, DeploymentCanaryUsersService, A_DEPLOYMENT_ID, A_SESSION, anExistingRow(), tick(), DeploymentCanaryUsersDTO

### Community 18 - "ProjectWizardService"
Cohesion: 0.33
Nodes (4): IWizardProjectState, WizardProjectState, WizardProjectStateSchema, ProjectWizardService

### Community 19 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, module, moduleResolution, outDir, resolveJsonModule (+5 more)

### Community 20 - "package.json"
Cohesion: 0.22
Nodes (9): author, description, keywords, license, main, name, packageManager, version (+1 more)

### Community 21 - "GitLabClient"
Cohesion: 0.12
Nodes (14): IOAuthAuthorizationCode, OAuthAuthorizationCode, oauthAuthorizationCodeSchema, RFC-6749, IOAuthAuthorizationRequest, oauthAuthorizationRequestSchema, RFC-6749, anAuthorizationQuery() (+6 more)

### Community 22 - "devDependencies"
Cohesion: 0.15
Nodes (19): IOAuthGrant, OAuthGrant, OAuthGrantRevocationReason, oauthGrantSchema, asString(), OAuthAuthorizationService, addProjectToGrant(), AuthenticatedGrant (+11 more)

### Community 23 - "scripts"
Cohesion: 0.15
Nodes (21): defineTool(), DESTRUCTIVE, DESTRUCTIVE_EXTERNAL, McpSharedProject, McpToolAnnotations, NO_INPUT, objectId(), READ_ONLY (+13 more)

### Community 25 - "compilerOptions"
Cohesion: 0.33
Nodes (5): compilerOptions, noEmit, exclude, extends, include

### Community 26 - "postbuild.js"
Cohesion: 0.40
Nodes (4): copyDirectory(), fs, path, postBuild()

### Community 28 - "cors.ts"
Cohesion: 0.13
Nodes (23): RFC-7518, RFC-8414, RFC-8615, mcpClientController(), build(), initSentry(), start(), buildAuthorizationServerMetadata() (+15 more)

### Community 31 - "CodeRepositoryService.ts"
Cohesion: 0.12
Nodes (25): IMicrofrontendStack, FederationConfigRequest, FRAMEWORK_PROFILES, FrameworkProfile, IntegrationInstructions, REQUIRED_DEV_DEPENDENCIES, COMMIT_MESSAGES, FederationFileChangeDTO (+17 more)

### Community 35 - "is-canary.template.js"
Cohesion: 0.12
Nodes (22): IOAuthClient, OAuthClient, oauthClientSchema, RFC-7591, ClientRegistrationResponse, OAuthClientService, optionalHttpsUrl(), optionalString() (+14 more)

### Community 36 - "user-id.template.js"
Cohesion: 0.20
Nodes (9): projectUserController(), createBusinessException(), loadSharedProjects(), Organization, IUserOrganization, UserOrganization, UserOrganizationService, recordLogin() (+1 more)

### Community 37 - "User"
Cohesion: 0.22
Nodes (3): UserController(), UserAvatar, UserService

### Community 38 - "BusinessException"
Cohesion: 0.12
Nodes (6): CodeRepository, ICodeRepository, CodeRepositoryService, deployKeyExpiry(), retypedSecret(), CreateAzureDevOpsRepositoryDTO

### Community 39 - "autorization.ts"
Cohesion: 0.17
Nodes (17): RFC-9068, RFC-9700, IOAuthRefreshToken, OAuthRefreshToken, oauthRefreshTokenSchema, getSecret(), consumeRefreshToken(), deleteRefreshTokensOfGrant() (+9 more)

### Community 40 - "AuthenticationMethod.ts"
Cohesion: 0.11
Nodes (14): GoogleTokenResponse, configurationController(), oauthController(), RFC-6749, serveController(), StartupController(), StartupUserRegistrationDTO, createOrganization (+6 more)

### Community 41 - "RepositoryFileService.ts"
Cohesion: 0.53
Nodes (4): globalVariablesScriptTag(), globalVariablesScriptUrl(), injectGlobalVariablesScript(), document()

### Community 43 - "GitlabClient.ts"
Cohesion: 0.24
Nodes (10): createMcpServer(), describeToolError(), MCP_TOOLS, McpServerHooks, registeredInputSchema(), selectProject(), toolNamed(), toToolResult() (+2 more)

### Community 44 - "StackDetectionService"
Cohesion: 0.14
Nodes (12): mapWithConcurrency(), RepositoryFile, WriteFileParams, COMPILER_MARKERS, CONFIG_CANDIDATES, FEDERATION_PLUGIN_BY_COMPILER, FRAMEWORK_MARKERS, MicrofrontendStackDetectionDTO (+4 more)

### Community 45 - "IMarket"
Cohesion: 0.15
Nodes (3): ORGANIZATION_ADMIN_ROLES, BaseAuthorizedService, AccessProbe

### Community 48 - ".gitHubInjectApiKey"
Cohesion: 0.35
Nodes (3): FederationRemote, FederationIntegrationService, RepositoryTarget

### Community 49 - "projectWizardStateMachine.ts"
Cohesion: 0.10
Nodes (9): BranchNotFoundError, FileChangeAction, GitAuthor, GitCredentials, GitWorkingCopy, ORCHESTRATOR_COMMITTER, textDecoder, WorkingCopyChange (+1 more)

### Community 50 - "Project"
Cohesion: 0.33
Nodes (3): IUserProject, UserProject, UserProjectService

### Community 51 - "CodeRepositoryModel.ts"
Cohesion: 0.11
Nodes (17): azureDataSchema, CODE_REPOSITORY_SECRET_PATHS, CodeRepositoryProvider, codeRepositorySchema, githubDataSchema, gitlabDataSchema, IAzureData, IGithubData (+9 more)

### Community 52 - "ProjectService.ts"
Cohesion: 0.15
Nodes (11): organizationController(), IOrganization, IOrganizationWithRole, OrganizationCreateInput, OrganizationService, OrganizationSummaryDTO, OrganizationUpdateInput, aUser() (+3 more)

### Community 53 - "secretCrypto.ts"
Cohesion: 0.14
Nodes (25): NODE_ENVS, RFC-7591, asList(), contextOf(), encryptedFields(), EncryptedFieldsOptions, isTraversable(), DEPLOYMENT (+17 more)

### Community 54 - "StorageService.ts"
Cohesion: 0.17
Nodes (10): IStorage, IStorageAuth, Storage, STORAGE_SECRET_KEYS, storageSchema, StorageType, StorageService, stored (+2 more)

### Community 55 - "AssistantService.ts"
Cohesion: 0.12
Nodes (16): AssistantService, AssistantStopReason, AssistantStreamHandlers, describeContext(), PROJECT_DRAFT_SCHEMA, sanitizeDraft(), create, getEnvironments (+8 more)

### Community 56 - "organizationMigration.ts"
Cohesion: 0.12
Nodes (11): Id, Membership, migrateProjectsToOrganizations(), ORGANIZATION_ROLE_BY_PROJECT_ROLE, organizationNameFor(), pickOwner(), FakeMembership, FakeProject (+3 more)

### Community 57 - "CodeRepositoryService.ts"
Cohesion: 0.47
Nodes (4): CodeRepositoryType, UnifiedBranch, CreateGitlabRepositoryDto, UpdateGithubDTO

### Community 58 - "StorageModel.ts"
Cohesion: 0.13
Nodes (12): allowedHostsFor(), cloneUrlFor(), evictUnusedWorkspaces(), exists(), gitCredentialsFor(), LAST_USED_MARKER, onProviderHost(), refusedRepositories (+4 more)

### Community 59 - "FastifyInstance"
Cohesion: 0.11
Nodes (28): apiKeyController(), assistantController(), chatBodySchema, draftBodySchema, chat, draftProject, ensureCanChat, question (+20 more)

### Community 60 - "BuildStatusService.ts"
Cohesion: 0.23
Nodes (12): BuiltFrontend, builtFrontendSchema, IBuiltFrontend, normalizeAzureStatus(), normalizeGithubStatus(), normalizeGitlabStatus(), shortenRef(), snapshotCache (+4 more)

### Community 61 - "BusinessException"
Cohesion: 0.12
Nodes (7): AssistantDisabledError, BusinessException, ErrorDetails, AxiosError, CustomError, { logWarn }, NOON

### Community 62 - "EntityNotFoundError"
Cohesion: 0.15
Nodes (6): AuthConfig, GoogleStorageConfig, EntityNotFoundError, EnvironmentNotFoundError, OrganizationNotFoundError, ProjectNotFoundError

### Community 63 - "BaseAuthorizedService.ts"
Cohesion: 0.22
Nodes (10): Deployment, deploymentSchema, deploymentToCanaryUsersSchema, IDeploymentToCanaryUsers, Environment, environmentSchema, ProjectContextDTO, ProjectCreateInput (+2 more)

### Community 64 - "DeploymentService"
Cohesion: 0.12
Nodes (10): deploymentController(), IDeployment, STORAGE_SECRET_PATHS, DeploymentService, DeploymentDTO, encryptStoredSecrets(), LEGACY_CANARY_TYPES, migrateLegacyCanaryTypes() (+2 more)

### Community 65 - "assistantTools.ts"
Cohesion: 0.08
Nodes (21): IMarket, Market, marketSchema, AssistantTool, AssistantToolContext, assistantToolDefinitions, noInput, redactSecrets() (+13 more)

### Community 66 - "createBusinessException"
Cohesion: 0.20
Nodes (9): IProject, Project, projectSchema, ProjectService, ProjectSummaryDTO, forgetMicrofrontends(), ownerOf(), prepareProjectCleanup() (+1 more)

### Community 67 - "organizationTools.test.ts"
Cohesion: 0.12
Nodes (13): UserCannotAccessThisOrganizationError, McpCredential, McpSession, McpToolContext, organizationTools, addProjectToGrant, createProject, findOrganizations (+5 more)

### Community 68 - "AssistantController.ts"
Cohesion: 0.22
Nodes (15): RFC-8252, consentWarnings(), hostnameOf(), parseRedirectUris(), describeRedirectHost(), FORBIDDEN_SCHEMES, isCustomScheme(), isLoopbackRedirect() (+7 more)

### Community 69 - "GitlabClient.ts"
Cohesion: 0.12
Nodes (11): AzureDevOpsBuild, GithubWorkflowRun, AddGroupSecretRequest, CheckGroupSecretExistsRequest, CommitAction, CommitFilesRequest, CreateRepositoryRequest, GitLabBranch (+3 more)

### Community 71 - "build-docs-index.js"
Cohesion: 0.23
Nodes (10): anchorOf(), cleanBody(), DOCS_DIR, fs, index, OUTPUT, path, splitFrontmatter() (+2 more)

### Community 72 - "BuildStatusService"
Cohesion: 0.13
Nodes (11): getByProjectId, snapshot, BuildStatusService, CachedSnapshot, BuildJobLogDTO, BuildRunDTO, BuildStatus, BuildStatusEnvironmentDTO (+3 more)

### Community 73 - "wellKnownRoutes.ts"
Cohesion: 0.12
Nodes (14): AiChangeFileAction, aiChangeRequestSchema, AiChangeStatus, eventSchema, fileSchema, IAiChangeEvent, IAiChangeFile, IAiChangeUsage (+6 more)

### Community 74 - ".create"
Cohesion: 0.26
Nodes (8): OAuthAuthorizationRequest, computeS256Challenge(), generateOpaqueToken(), hashOpaqueToken(), isValidCodeChallenge(), RFC-7636, RFC-7636, verifyPkce()

### Community 75 - "MicrofrontendService.ts"
Cohesion: 0.19
Nodes (10): AI_CHANGE_LIMITS, AiChangeAgentHooks, AiChangeAgentInput, AiChangeAgentResult, describeInput(), describeToolCall(), readString(), runAiChangeAgent() (+2 more)

### Community 76 - "toObjectId"
Cohesion: 0.16
Nodes (6): deploymentId, environmentFields, environmentId, EnvironmentService, EnvironmentDTO, EnvironmentOrderDTO

### Community 77 - "BaseAuthorizedService.test.ts"
Cohesion: 0.24
Nodes (5): anOrganization(), aUser(), FakeOrganizationMembership, FakeProjectMembership, newId()

### Community 78 - "encryptedFieldsPlugin.ts"
Cohesion: 0.15
Nodes (11): RFC-7009, RFC-9207, OAuthError, OAuthClientRegistrationType, buildRedirect(), ConsentRequestDTO, ConsentWarning, TokenResponse (+3 more)

### Community 79 - "StartupController.ts"
Cohesion: 0.31
Nodes (11): isInsideGitDir(), isProtectedPath(), microfrontendWorkspacePath(), normalizeRelativePath(), organizationWorkspacePath(), projectWorkspacePath(), PROTECTED_FILE, resolveInsideWorkingCopy() (+3 more)

### Community 80 - "BuildStatusDTO.ts"
Cohesion: 0.35
Nodes (4): AiChangeToolbox, looksBinary(), underPrefix(), isSecretPath()

### Community 81 - "IOrganization"
Cohesion: 0.18
Nodes (11): scripts, build, dev, docs:index, format, lint, st, start (+3 more)

### Community 82 - "migrations.ts"
Cohesion: 0.22
Nodes (9): devDependencies, tsx, @types/adm-zip, @types/fs-extra, @types/jsonwebtoken, @types/node, @types/nodemailer, @types/pug (+1 more)

### Community 83 - "docsSearch.ts"
Cohesion: 0.46
Nodes (7): localLocks, redisAvailable(), release(), RepositoryLockTimeoutError, sleep(), tryAcquire(), withRepositoryLock()

### Community 84 - "UserOrganizationService.test.ts"
Cohesion: 0.16
Nodes (15): AcceptInvitationDTO, AddUserToOrganizationDTO, organizationUserController(), UpdateUserRoleDTO, RoleInOrganization, userOrganizationSchema, IAcceptInvitationData, IOrganizationInvitationInfo (+7 more)

### Community 85 - "GoogleStorageClient"
Cohesion: 0.38
Nodes (6): aUser(), FakeProject, matches(), newId(), sameId(), WithAuthorizationGate

### Community 86 - "McpController.ts"
Cohesion: 0.20
Nodes (16): RFC-6750, mcpController(), RFC-9728, authenticateAccessToken(), authenticateApiKey(), authenticateMcpRequest(), buildWwwAuthenticate(), looksLikeJwt() (+8 more)

### Community 90 - "AzureStorageClient"
Cohesion: 0.25
Nodes (3): AuthConfig, AzureStorageClient, AzureStorageConfig

## Knowledge Gaps
- **389 isolated node(s):** `description`, `main`, `start`, `st`, `dev` (+384 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `toObjectId()` connect `user-id.template.js` to `MicrofrontendService.ts`, `ServeService.ts`, `MicrofrontendService`, `UserService.ts`, `toObjectId`, `ServeService`, `CodeRepositoryService`, `CodeRepositoryService.ts`, `DeploymentCanaryUsersService`, `ProjectWizardService`, `devDependencies`, `scripts`, `CodeRepositoryService.ts`, `is-canary.template.js`, `User`, `BusinessException`, `autorization.ts`, `StackDetectionService`, `IMarket`, `.gitHubInjectApiKey`, `Project`, `ProjectService.ts`, `StorageService.ts`, `CodeRepositoryService.ts`, `BuildStatusService.ts`, `EntityNotFoundError`, `BaseAuthorizedService.ts`, `DeploymentService`, `createBusinessException`, `IProject`, `BuildStatusService`, `toObjectId`, `encryptedFieldsPlugin.ts`, `UserOrganizationService.test.ts`?**
  _High betweenness centrality (0.106) - this node is a cross-community bridge._
- **Why does `BaseAuthorizedService` connect `IMarket` to `MicrofrontendService.ts`, `MicrofrontendDependencyService.ts`, `ServeService.ts`, `MicrofrontendService`, `toObjectId`, `ServeService`, `CodeRepositoryService`, `DeploymentCanaryUsersService`, `ProjectWizardService`, `devDependencies`, `CodeRepositoryService.ts`, `user-id.template.js`, `BusinessException`, `StackDetectionService`, `.gitHubInjectApiKey`, `Project`, `ProjectService.ts`, `StorageService.ts`, `AssistantService.ts`, `CodeRepositoryService.ts`, `StorageModel.ts`, `BuildStatusService.ts`, `EntityNotFoundError`, `BaseAuthorizedService.ts`, `DeploymentService`, `assistantTools.ts`, `createBusinessException`, `IProject`, `BuildStatusService`, `toObjectId`, `BaseAuthorizedService.test.ts`, `UserOrganizationService.test.ts`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **Why does `createBusinessException()` connect `user-id.template.js` to `MicrofrontendService.ts`, `MicrofrontendDependencyService.ts`, `MicrofrontendService`, `UserService.ts`, `CodeRepositoryService`, `scripts`, `User`, `BusinessException`, `AuthenticationMethod.ts`, `GitlabClient.ts`, `StackDetectionService`, `Project`, `ProjectService.ts`, `CodeRepositoryService.ts`, `StorageModel.ts`, `FastifyInstance`, `BusinessException`, `EntityNotFoundError`, `BaseAuthorizedService.ts`, `createBusinessException`, `IProject`, `.create`, `encryptedFieldsPlugin.ts`, `StartupController.ts`, `UserOrganizationService.test.ts`?**
  _High betweenness centrality (0.064) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `toObjectId()` (e.g. with `.getRepositoriesById()` and `.bulkDelete()`) actually correct?**
  _`toObjectId()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `description`, `main`, `start` to the rest of the system?**
  _389 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `MicrofrontendService.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10984848484848485 - nodes in this community are weakly interconnected._
- **Should `MicrofrontendDependencyService.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07589285714285714 - nodes in this community are weakly interconnected._