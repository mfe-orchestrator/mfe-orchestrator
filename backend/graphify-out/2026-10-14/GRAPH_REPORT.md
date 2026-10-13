# Graph Report - backend  (2026-10-13)

## Corpus Check
- 231 files · ~177,077 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1676 nodes · 4724 edges · 94 communities (77 shown, 17 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 19 edges (avg confidence: 0.61)
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
- [[_COMMUNITY_EnvironmentController.ts|EnvironmentController.ts]]
- [[_COMMUNITY_AssistantService.test.ts|AssistantService.test.ts]]
- [[_COMMUNITY_AzureStorageClient|AzureStorageClient]]
- [[_COMMUNITY_AccessProbe|AccessProbe]]

## God Nodes (most connected - your core abstractions)
1. `toObjectId()` - 146 edges
2. `BaseAuthorizedService` - 65 edges
3. `createBusinessException()` - 59 edges
4. `Project` - 51 edges
5. `CodeRepositoryService` - 47 edges
6. `IMicrofrontend` - 46 edges
7. `IUser` - 46 edges
8. `ServeService` - 43 edges
9. `Microfrontend` - 38 edges
10. `UserProject` - 38 edges

## Surprising Connections (you probably didn't know these)
- `encryptedFields()` --indirect_call--> `document()`  [INFERRED]
  src/utils/encryptedFieldsPlugin.ts → src/utils/globalVariablesScript.test.ts
- `CreateBuildRequest` --references--> `CodeRepositoryType`  [EXTRACTED]
  src/client/GithubClient.ts → src/models/CodeRepositoryModel.ts
- `authorizationController()` --references--> `FastifyInstance`  [EXTRACTED]
  src/controller/AuthorizationController.ts → src/types/fastify.d.ts
- `deploymentController()` --references--> `FastifyInstance`  [EXTRACTED]
  src/controller/DeploymentCanaryUsersController.ts → src/types/fastify.d.ts
- `deploymentController()` --references--> `FastifyInstance`  [EXTRACTED]
  src/controller/DeploymentController.ts → src/types/fastify.d.ts

## Import Cycles
- None detected.

## Communities (94 total, 17 thin omitted)

### Community 0 - "MicrofrontendService.ts"
Cohesion: 0.09
Nodes (29): AcceptInvitationDTO, AddUserToProjectDTO, PopulatedProject, UpdateUserRoleDTO, UserProjectWithProject, AuthTokenDataDTO, fastify, CREATION_REFUSALS (+21 more)

### Community 1 - "MicrofrontendDependencyService.ts"
Cohesion: 0.08
Nodes (35): cache, CacheEntry, NpmAbbreviatedPackument, NpmPackageInfo, NpmRegistryClient, DEPENDENCY_SECTIONS, ManifestFile, MicrofrontendDependencyService (+27 more)

### Community 2 - "ServeService.ts"
Cohesion: 0.06
Nodes (50): RFC-6750, aToken(), callMcp(), ENVIRONMENT, grantState, listToolNames(), previousEnvironment, PROTOCOL_HEADERS (+42 more)

### Community 3 - "MicrofrontendService"
Cohesion: 0.25
Nodes (4): adm-zip, IMicrofrontend, Microfrontend, MicrofrontendService

### Community 4 - "UserService.ts"
Cohesion: 0.16
Nodes (13): ALLOWED_AVATAR_MIME_TYPES, IUserAvatar, IUserAvatarDocument, userAvatarSchema, RegisterUserData, MicrofrontendUploadDTO, ResetPasswordDataDTO, ResetPasswordRequestDTO (+5 more)

### Community 5 - "toObjectId"
Cohesion: 0.25
Nodes (7): GlobalVariable, IGlobalVariable, GlobalVariablesService, EnvironmentValue, GlobalVariableCreateDTO, GlobalVariableUpdateDTO, GlobalVariableDTO

### Community 8 - "CustomError"
Cohesion: 0.09
Nodes (9): CustomError, EnvironmentHeaderNotFoundError, InvalidCredentialsError, OAuthError, RFC-6749, UserAlreadyExistsError, UserCannotAccessThisDeploymentError, UserNotFoundError (+1 more)

### Community 9 - "FastifyInstance"
Cohesion: 0.14
Nodes (15): CanaryDeploymentType, CanaryType, ICanaryMicrofrontend, IPosition, microfrontendCanaryTypeSchema, microfrontendCodeRepositorySchema, microfrontendHostTypeSchema, microfrontendPositionSchema (+7 more)

### Community 10 - "TelemetryService.ts"
Cohesion: 0.13
Nodes (20): telemetryController(), logTelemetryNotice(), TelemetryService, fastify, FastifyContextConfig, FastifyMultipartRequest, FastifyReplyWithConfig, FastifyRequest (+12 more)

### Community 11 - "dependencies"
Cohesion: 0.05
Nodes (39): dependencies, @anthropic-ai/sdk, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, axios, @azure/identity, @azure/storage-blob, bcryptjs (+31 more)

### Community 12 - "GithubClient.ts"
Cohesion: 0.12
Nodes (21): CreateBuildRequest, CreateRepositoryRequest, GithubAccessTokenResponse, GithubAccessTokenRquest, GithubBaseDTO, GithubContentsResponse, GithubCreateBranchDTO, GithubFileContent (+13 more)

### Community 13 - "CodeRepositoryService"
Cohesion: 0.18
Nodes (11): HostedOn, ICodeRepositoryMicrofrontend, IHostMicrofrontend, CodeRepositoryImportService, FailedRepositoryResult, ImportableRepository, ImportedRepositoryResult, ImportRepositoriesResult (+3 more)

### Community 14 - "AzureDevOpsClient.ts"
Cohesion: 0.11
Nodes (17): AzureAccessTokenRequest, AzureAccessTokenResponse, AzureDevOpsBranchDTO, AzureDevOpsBuildsResponse, AzureDevOpsItem, AzureDevOpsPipeline, AzureDevOpsProject, AzureDevOpsProjectsResponse (+9 more)

### Community 15 - "CodeRepositoryService.ts"
Cohesion: 0.12
Nodes (20): federationName(), buildMicrofrontendAdaptedToServe(), CodeIntegrationRequestDTO, escapeRegExp(), GetAllDataDTO, GetMicrofrontendAdaptedDataDTO, getMicrofrontendUrlCanary(), getMicrofrontendUrlStatic() (+12 more)

### Community 16 - "DeploymentCanaryUsersService"
Cohesion: 0.13
Nodes (11): deploymentController(), DeploymentToCanaryUsers, deploymentToCanaryUsersSchema, IDeploymentToCanaryUsers, DeploymentCanaryUsersService, A_DEPLOYMENT_ID, A_SESSION, anExistingRow() (+3 more)

### Community 18 - "ProjectWizardService"
Cohesion: 0.24
Nodes (5): IWizardProjectState, WizardProjectState, WizardProjectStateSchema, ProjectWizardService, NewProjectWizardContext

### Community 19 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, module, moduleResolution, outDir, resolveJsonModule (+5 more)

### Community 20 - "package.json"
Cohesion: 0.07
Nodes (29): author, description, devDependencies, tsx, @types/adm-zip, @types/fs-extra, @types/jsonwebtoken, @types/node (+21 more)

### Community 21 - "GitLabClient"
Cohesion: 0.09
Nodes (27): IOAuthAuthorizationCode, OAuthAuthorizationCode, oauthAuthorizationCodeSchema, RFC-6749, IOAuthAuthorizationRequest, OAuthAuthorizationRequest, oauthAuthorizationRequestSchema, RFC-6749 (+19 more)

### Community 22 - "devDependencies"
Cohesion: 0.10
Nodes (33): RFC-7009, RFC-9207, OAuthClient, OAuthClientRegistrationType, oauthClientSchema, RFC-7591, IOAuthGrant, OAuthGrant (+25 more)

### Community 23 - "scripts"
Cohesion: 0.09
Nodes (31): defineTool(), DESTRUCTIVE, DESTRUCTIVE_EXTERNAL, McpSharedProject, McpToolAnnotations, McpToolDefinition, NO_INPUT, objectId() (+23 more)

### Community 25 - "compilerOptions"
Cohesion: 0.33
Nodes (5): compilerOptions, noEmit, exclude, extends, include

### Community 26 - "postbuild.js"
Cohesion: 0.40
Nodes (4): copyDirectory(), fs, path, postBuild()

### Community 28 - "cors.ts"
Cohesion: 0.21
Nodes (13): RFC-7518, mcpClientController(), MCP_CORS_OPTIONS, assertMcpConfigurationIsUsable(), getOAuthConfig(), parseBooleanFlag(), parseTrustProxy(), PLACEHOLDER_SECRETS (+5 more)

### Community 31 - "CodeRepositoryService.ts"
Cohesion: 0.26
Nodes (13): IMicrofrontendStack, FederationConfigRequest, FederationRemote, FRAMEWORK_PROFILES, FrameworkProfile, IntegrationInstructions, REQUIRED_DEV_DEPENDENCIES, MicrofrontendIntegrationPlanDTO (+5 more)

### Community 35 - "is-canary.template.js"
Cohesion: 0.11
Nodes (30): RFC-8252, IOAuthClient, ClientRegistrationResponse, OAuthClientService, optionalHttpsUrl(), optionalString(), parseClientName(), parseRedirectUris() (+22 more)

### Community 36 - "user-id.template.js"
Cohesion: 0.12
Nodes (17): AcceptInvitationDTO, AddUserToOrganizationDTO, UpdateUserRoleDTO, loadSharedProjects(), Organization, IUserOrganization, RoleInOrganization, UserOrganization (+9 more)

### Community 37 - "User"
Cohesion: 0.22
Nodes (3): UserController(), UserAvatar, UserService

### Community 38 - "BusinessException"
Cohesion: 0.15
Nodes (3): CodeRepository, CodeRepositoryService, retypedSecret()

### Community 39 - "autorization.ts"
Cohesion: 0.16
Nodes (18): RFC-9068, RFC-9700, authenticateAccessToken(), IOAuthRefreshToken, OAuthRefreshToken, oauthRefreshTokenSchema, getSecret(), consumeRefreshToken() (+10 more)

### Community 40 - "AuthenticationMethod.ts"
Cohesion: 0.16
Nodes (9): authorizationController(), GoogleTokenResponse, configurationController(), oauthController(), RFC-6749, serveController(), isRedirectToVersion(), AuthenticationMethod (+1 more)

### Community 41 - "RepositoryFileService.ts"
Cohesion: 0.16
Nodes (14): COMMIT_MESSAGES, FederationFileChangeDTO, FederationIntegrationApplyResultDTO, FederationIntegrationPlanDTO, FederationIntegrationStatus, HTML_CANDIDATES, MicrofrontendIntegrationResultDTO, globalVariablesScriptTag() (+6 more)

### Community 43 - "GitlabClient.ts"
Cohesion: 0.15
Nodes (15): UserCannotAccessThisEnvironmentError, UserCannotAccessThisProjectError, createMcpServer(), describeToolError(), MCP_TOOLS, McpProjectSelectionError, McpServerHooks, PROJECT_ID_INPUT (+7 more)

### Community 44 - "StackDetectionService"
Cohesion: 0.16
Nodes (11): ManifestSnapshot, RepositoryTarget, COMPILER_MARKERS, CONFIG_CANDIDATES, FEDERATION_PLUGIN_BY_COMPILER, FRAMEWORK_MARKERS, MicrofrontendStackDetectionDTO, PackageManifest (+3 more)

### Community 48 - ".gitHubInjectApiKey"
Cohesion: 0.29
Nodes (4): FederationIntegrationService, mapWithConcurrency(), toErrorMessage(), supportsModuleFederation()

### Community 50 - "Project"
Cohesion: 0.18
Nodes (11): projectUserController(), Project, IUserProject, UserProject, aUser(), FakeProject, matches(), newId() (+3 more)

### Community 51 - "CodeRepositoryModel.ts"
Cohesion: 0.12
Nodes (17): azureDataSchema, CODE_REPOSITORY_SECRET_PATHS, CodeRepositoryProvider, codeRepositorySchema, githubDataSchema, gitlabDataSchema, IAzureData, IGithubData (+9 more)

### Community 52 - "ProjectService.ts"
Cohesion: 0.16
Nodes (11): organizationController(), ErrorDetails, Storage, OrganizationCreateInput, OrganizationUpdateInput, ProjectContextDTO, ProjectCreateInput, ProjectUpdateInput (+3 more)

### Community 53 - "secretCrypto.ts"
Cohesion: 0.19
Nodes (16): NODE_ENVS, RFC-7591, DEPLOYMENT, STORAGE, assertSecretEncryptionKeyIsUsable(), decryptSecret(), encryptSecret(), getKey() (+8 more)

### Community 54 - "StorageService.ts"
Cohesion: 0.24
Nodes (5): IStorage, StorageService, stored, withUnchangedSecrets(), StorageDTO

### Community 55 - "AssistantService.ts"
Cohesion: 0.16
Nodes (14): AssistantService, AssistantStopReason, AssistantStreamHandlers, describeContext(), getClient(), PROJECT_DRAFT_SCHEMA, sanitizeDraft(), toSlug() (+6 more)

### Community 56 - "organizationMigration.ts"
Cohesion: 0.12
Nodes (11): Id, Membership, migrateProjectsToOrganizations(), ORGANIZATION_ROLE_BY_PROJECT_ROLE, organizationNameFor(), pickOwner(), FakeMembership, FakeProject (+3 more)

### Community 57 - "CodeRepositoryService.ts"
Cohesion: 0.18
Nodes (9): AzureDevOpsBranch, RepositoryData, GithubBranch, GitLabBranch, CodeRepositoryType, UnifiedBranch, CreateAzureDevOpsRepositoryDTO, CreateGitlabRepositoryDto (+1 more)

### Community 58 - "StorageModel.ts"
Cohesion: 0.13
Nodes (10): AuthConfig, AzureStorageConfig, AuthConfig, GoogleStorageConfig, S3BucketClient, S3ClientConfig, IStorageAuth, STORAGE_SECRET_KEYS (+2 more)

### Community 59 - "FastifyInstance"
Cohesion: 0.18
Nodes (16): apiKeyController(), codeRepositoryController(), globalVariablesController(), integrationController(), marketController(), microfrontendController(), microfrontendDependencyController(), organizationUserController() (+8 more)

### Community 60 - "BuildStatusService.ts"
Cohesion: 0.21
Nodes (12): AzureDevOpsBuild, GithubWorkflowRun, normalizeAzureStatus(), normalizeGithubStatus(), normalizeGitlabStatus(), shortenRef(), snapshotCache, toAzureRun() (+4 more)

### Community 61 - "BusinessException"
Cohesion: 0.13
Nodes (8): chat, draftProject, ensureCanChat, question, AssistantDisabledError, BusinessException, AxiosError, CustomError

### Community 62 - "EntityNotFoundError"
Cohesion: 0.18
Nodes (4): EntityNotFoundError, EnvironmentNotFoundError, OrganizationNotFoundError, ProjectNotFoundError

### Community 63 - "BaseAuthorizedService.ts"
Cohesion: 0.25
Nodes (8): configSchema, Configuration, IConfiguration, Deployment, deploymentSchema, Environment, environmentSchema, globalVariableSchema

### Community 64 - "DeploymentService"
Cohesion: 0.18
Nodes (4): deploymentController(), IDeployment, DeploymentService, DeploymentDTO

### Community 65 - "assistantTools.ts"
Cohesion: 0.15
Nodes (11): AssistantTool, AssistantToolContext, noInput, redactSecrets(), runAssistantTool(), SECRET_PATTERNS, context, getByEnvironmentId (+3 more)

### Community 67 - "organizationTools.test.ts"
Cohesion: 0.13
Nodes (10): UserCannotAccessThisOrganizationError, McpCredential, organizationTools, addProjectToGrant, createProject, findOrganizations, findProjects, OAUTH (+2 more)

### Community 68 - "AssistantController.ts"
Cohesion: 0.27
Nodes (8): assistantController(), chatBodySchema, draftBodySchema, buildController(), sleep(), ProjectHeaderNotFoundError, openEventStream(), sendEvent()

### Community 69 - "GitlabClient.ts"
Cohesion: 0.15
Nodes (9): AddGroupSecretRequest, CheckGroupSecretExistsRequest, CommitAction, CommitFilesRequest, CreateRepositoryRequest, GitLabGroup, GitLabPipeline, GitLabProject (+1 more)

### Community 71 - "build-docs-index.js"
Cohesion: 0.23
Nodes (10): anchorOf(), cleanBody(), DOCS_DIR, fs, index, OUTPUT, path, splitFrontmatter() (+2 more)

### Community 72 - "BuildStatusService"
Cohesion: 0.24
Nodes (6): BuiltFrontend, builtFrontendSchema, IBuiltFrontend, BuildStatusService, CachedSnapshot, ProjectBuildStatusDTO

### Community 73 - "wellKnownRoutes.ts"
Cohesion: 0.24
Nodes (10): RFC-8414, RFC-8615, build(), initSentry(), start(), buildAuthorizationServerMetadata(), buildProtectedResourceMetadata(), RFC-9728 (+2 more)

### Community 75 - "MicrofrontendService.ts"
Cohesion: 0.42
Nodes (4): IMarket, Market, marketSchema, MarketService

### Community 77 - "BaseAuthorizedService.test.ts"
Cohesion: 0.24
Nodes (5): anOrganization(), aUser(), FakeOrganizationMembership, FakeProjectMembership, newId()

### Community 78 - "encryptedFieldsPlugin.ts"
Cohesion: 0.42
Nodes (9): asList(), contextOf(), encryptedFields(), EncryptedFieldsOptions, isTraversable(), Transform, transformDocument(), transformPath() (+1 more)

### Community 79 - "StartupController.ts"
Cohesion: 0.25
Nodes (6): StartupController(), StartupUserRegistrationDTO, createOrganization, createProject, existsAtLeastOneUser, register

### Community 80 - "BuildStatusDTO.ts"
Cohesion: 0.29
Nodes (6): getByProjectId, snapshot, BuildStatus, BuildStatusEnvironmentDTO, BuildUnavailableReason, MicrofrontendBuildStatusDTO

### Community 82 - "migrations.ts"
Cohesion: 0.36
Nodes (6): STORAGE_SECRET_PATHS, encryptStoredSecrets(), LEGACY_CANARY_TYPES, migrateLegacyCanaryTypes(), NOT_ENCRYPTED, runMigrations()

### Community 83 - "docsSearch.ts"
Cohesion: 0.32
Nodes (6): DocsSection, documentFrequency, indexed, IndexedSection, searchDocs(), tokenize()

### Community 84 - "UserOrganizationService.test.ts"
Cohesion: 0.32
Nodes (5): aMembership(), aUser(), FakeMembership, newId(), ORGANIZATION_ID

### Community 86 - "McpController.ts"
Cohesion: 0.43
Nodes (6): mcpController(), RFC-9728, buildWwwAuthenticate(), McpAuthenticationResult, credentialBucket(), credentialLogFields()

### Community 87 - "codeRepositoryUtils.ts"
Cohesion: 0.57
Nodes (6): asId(), asNonEmptyString(), asNumber(), buildUniqueSlug(), normalizeRepository(), slugifyRepositoryName()

### Community 88 - "EnvironmentController.ts"
Cohesion: 0.47
Nodes (3): environmentController(), EnvironmentDTO, EnvironmentOrderDTO

### Community 89 - "AssistantService.test.ts"
Cohesion: 0.33
Nodes (4): create, getEnvironments, stream, user

## Knowledge Gaps
- **360 isolated node(s):** `description`, `main`, `start`, `st`, `dev` (+355 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `toObjectId()` connect `toObjectId` to `MicrofrontendService.ts`, `ServeService.ts`, `MicrofrontendService`, `UserService.ts`, `toObjectId`, `ServeService`, `GithubClient`, `CodeRepositoryService`, `CodeRepositoryService.ts`, `DeploymentCanaryUsersService`, `ProjectWizardService`, `GitLabClient`, `devDependencies`, `user-id.template.js`, `User`, `BusinessException`, `autorization.ts`, `RepositoryFileService.ts`, `IMarket`, `.gitHubInjectApiKey`, `projectWizardStateMachine.ts`, `Project`, `ProjectService.ts`, `StorageService.ts`, `CodeRepositoryService.ts`, `BuildStatusService.ts`, `BaseAuthorizedService.ts`, `DeploymentService`, `createBusinessException`, `GitlabClient.ts`, `BuildStatusService`, `.create`, `MicrofrontendService.ts`, `IOrganization`, `EnvironmentController.ts`?**
  _High betweenness centrality (0.116) - this node is a cross-community bridge._
- **Why does `BaseAuthorizedService` connect `IMarket` to `MicrofrontendService.ts`, `MicrofrontendDependencyService.ts`, `ServeService.ts`, `MicrofrontendService`, `toObjectId`, `GithubClient`, `CodeRepositoryService`, `DeploymentCanaryUsersService`, `ProjectWizardService`, `devDependencies`, `user-id.template.js`, `BusinessException`, `RepositoryFileService.ts`, `StackDetectionService`, `.gitHubInjectApiKey`, `Project`, `ProjectService.ts`, `StorageService.ts`, `AssistantService.ts`, `CodeRepositoryService.ts`, `BuildStatusService.ts`, `BaseAuthorizedService.ts`, `DeploymentService`, `createBusinessException`, `BuildStatusService`, `MicrofrontendService.ts`, `toObjectId`, `BaseAuthorizedService.test.ts`, `IOrganization`, `AssistantService.test.ts`, `AccessProbe`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Why does `createBusinessException()` connect `createBusinessException` to `MicrofrontendService.ts`, `MicrofrontendDependencyService.ts`, `UserService.ts`, `GithubClient`, `CodeRepositoryService`, `GitLabClient`, `devDependencies`, `user-id.template.js`, `User`, `BusinessException`, `GitlabClient.ts`, `projectWizardStateMachine.ts`, `Project`, `ProjectService.ts`, `CodeRepositoryService.ts`, `EntityNotFoundError`, `AssistantController.ts`, `toObjectId`, `StartupController.ts`, `IOrganization`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `toObjectId()` (e.g. with `.getRepositoriesById()` and `.bulkDelete()`) actually correct?**
  _`toObjectId()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `description`, `main`, `start` to the rest of the system?**
  _360 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `MicrofrontendService.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08865248226950355 - nodes in this community are weakly interconnected._
- **Should `MicrofrontendDependencyService.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07932310946589106 - nodes in this community are weakly interconnected._