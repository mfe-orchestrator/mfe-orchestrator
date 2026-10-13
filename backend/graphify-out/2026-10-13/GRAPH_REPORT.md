# Graph Report - backend  (2026-08-11)

## Corpus Check
- 138 files · ~49,059 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 997 nodes · 2667 edges · 50 communities (41 shown, 9 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 8 edges (avg confidence: 0.54)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ca6db330`
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
- [[_COMMUNITY_ProjectNewDTO.ts|ProjectNewDTO.ts]]
- [[_COMMUNITY_CodeRepositoryService.ts|CodeRepositoryService.ts]]
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

## God Nodes (most connected - your core abstractions)
1. `toObjectId()` - 93 edges
2. `BaseAuthorizedService` - 45 edges
3. `CodeRepositoryService` - 44 edges
4. `ServeService` - 42 edges
5. `IMicrofrontend` - 40 edges
6. `Environment` - 31 edges
7. `Microfrontend` - 31 edges
8. `MicrofrontendService` - 31 edges
9. `ICodeRepository` - 30 edges
10. `createBusinessException()` - 29 edges

## Surprising Connections (you probably didn't know these)
- `deploymentController()` --references--> `FastifyInstance`  [EXTRACTED]
  src/controller/DeploymentCanaryUsersController.ts → src/types/fastify.d.ts
- `echoController()` --references--> `FastifyInstance`  [EXTRACTED]
  src/controller/EchoController.ts → src/types/fastify.d.ts
- `marketController()` --references--> `FastifyInstance`  [EXTRACTED]
  src/controller/MarketController.ts → src/types/fastify.d.ts
- `projectController()` --references--> `FastifyInstance`  [EXTRACTED]
  src/controller/ProjectController.ts → src/types/fastify.d.ts
- `projectStateWizardController()` --references--> `FastifyInstance`  [EXTRACTED]
  src/controller/ProjectStateWizardController.ts → src/types/fastify.d.ts

## Import Cycles
- None detected.

## Communities (50 total, 9 thin omitted)

### Community 0 - "MicrofrontendService.ts"
Cohesion: 0.09
Nodes (34): AcceptInvitationDTO, AddUserToProjectDTO, PopulatedProject, projectUserController(), UpdateUserRoleDTO, UserProjectWithProject, createBusinessException(), build() (+26 more)

### Community 1 - "MicrofrontendDependencyService.ts"
Cohesion: 0.07
Nodes (43): cache, CacheEntry, NpmAbbreviatedPackument, NpmPackageInfo, NpmRegistryClient, CodeRepositoryProvider, CodeRepositoryCreateInput, CodeRepositoryUpdateInput (+35 more)

### Community 2 - "ServeService.ts"
Cohesion: 0.06
Nodes (36): AuthConfig, AzureStorageClient, AzureStorageConfig, CreateBuildRequest, AddGroupSecretRequest, CheckGroupSecretExistsRequest, CommitAction, CommitFilesRequest (+28 more)

### Community 3 - "MicrofrontendService"
Cohesion: 0.09
Nodes (7): adm-zip, GoogleStorageClient, S3BucketClient, IMicrofrontend, Microfrontend, CodeManagementService, MicrofrontendService

### Community 4 - "UserService.ts"
Cohesion: 0.23
Nodes (8): UserStatus, MicrofrontendUploadDTO, ResetPasswordDataDTO, ResetPasswordRequestDTO, UserAccoutActivationDTO, UserInvitationDTO, UserLoginDTO, UserRegistrationDTO

### Community 5 - "toObjectId"
Cohesion: 0.12
Nodes (15): projectController(), Environment, environmentSchema, IEnvironment, GlobalVariable, globalVariableSchema, IGlobalVariable, EnvironmentService (+7 more)

### Community 6 - "ServeService"
Cohesion: 0.08
Nodes (6): Deployment, deploymentSchema, IDeployment, DeploymentService, hashToBucket(), ServeService

### Community 8 - "CustomError"
Cohesion: 0.13
Nodes (6): CustomError, EnvironmentHeaderNotFoundError, InvalidCredentialsError, UserAlreadyExistsError, UserNotFoundError, ValidationError

### Community 9 - "FastifyInstance"
Cohesion: 0.17
Nodes (14): CanaryDeploymentType, CanaryType, ICanaryMicrofrontend, ICodeRepositoryMicrofrontend, IPosition, microfrontendCanaryTypeSchema, microfrontendCodeRepositorySchema, microfrontendHostTypeSchema (+6 more)

### Community 10 - "TelemetryService.ts"
Cohesion: 0.10
Nodes (24): telemetryController(), configSchema, Configuration, IConfiguration, NODE_ENVS, logTelemetryNotice(), TelemetryService, fastify (+16 more)

### Community 11 - "dependencies"
Cohesion: 0.06
Nodes (34): dependencies, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, axios, @azure/identity, @azure/storage-blob, bcryptjs, dotenv (+26 more)

### Community 12 - "GithubClient.ts"
Cohesion: 0.12
Nodes (20): CreateRepositoryRequest, GithubAccessTokenResponse, GithubAccessTokenRquest, GithubBaseDTO, GithubBranch, GithubContentsResponse, GithubCreateBranchDTO, GithubFileContent (+12 more)

### Community 13 - "CodeRepositoryService"
Cohesion: 0.10
Nodes (23): azureDataSchema, codeRepositorySchema, githubDataSchema, gitlabDataSchema, IAzureData, IGithubData, IGitlabData, HostedOn (+15 more)

### Community 14 - "AzureDevOpsClient.ts"
Cohesion: 0.06
Nodes (26): AzureAccessTokenRequest, AzureAccessTokenResponse, AzureDevOpsBranch, AzureDevOpsBranchDTO, AzureDevOpsItem, AzureDevOpsPipeline, AzureDevOpsProject, AzureDevOpsProjectsResponse (+18 more)

### Community 15 - "CodeRepositoryService.ts"
Cohesion: 0.15
Nodes (16): federationName(), buildMicrofrontendAdaptedToServe(), CodeIntegrationRequestDTO, GetAllDataDTO, getBackendUrl(), GetMicrofrontendAdaptedDataDTO, getMicrofrontendUrlCanary(), getMicrofrontendUrlStatic() (+8 more)

### Community 16 - "DeploymentCanaryUsersService"
Cohesion: 0.18
Nodes (6): deploymentController(), DeploymentToCanaryUsers, deploymentToCanaryUsersSchema, IDeploymentToCanaryUsers, DeploymentCanaryUsersService, DeploymentCanaryUsersDTO

### Community 18 - "ProjectWizardService"
Cohesion: 0.25
Nodes (6): projectStateWizardController(), IWizardProjectState, WizardProjectState, WizardProjectStateSchema, ProjectCreateInput, ProjectWizardService

### Community 19 - "compilerOptions"
Cohesion: 0.15
Nodes (12): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, module, moduleResolution, outDir, resolveJsonModule (+4 more)

### Community 20 - "package.json"
Cohesion: 0.22
Nodes (9): author, description, keywords, license, main, name, packageManager, version (+1 more)

### Community 22 - "devDependencies"
Cohesion: 0.25
Nodes (8): devDependencies, tsx, @types/adm-zip, @types/fs-extra, @types/jsonwebtoken, @types/node, @types/nodemailer, @types/pug

### Community 23 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, build, dev, format, lint, st, start, typecheck

### Community 25 - "compilerOptions"
Cohesion: 0.25
Nodes (7): compilerOptions, esModuleInterop, isolatedModules, module, types, extends, include

### Community 26 - "postbuild.js"
Cohesion: 0.40
Nodes (4): copyDirectory(), fs, path, postBuild()

### Community 31 - "CodeRepositoryService.ts"
Cohesion: 0.27
Nodes (12): IMicrofrontendStack, FederationConfigRequest, FRAMEWORK_PROFILES, FrameworkProfile, IntegrationInstructions, REQUIRED_DEV_DEPENDENCIES, MicrofrontendIntegrationPlanDTO, CodeIntegrationResponseDTO (+4 more)

### Community 37 - "User"
Cohesion: 0.34
Nodes (4): StartupController(), UserController(), User, UserService

### Community 38 - "BusinessException"
Cohesion: 0.15
Nodes (4): CodeRepository, CodeRepositoryService, CreateAzureDevOpsRepositoryDTO, CreateGitlabRepositoryDto

### Community 39 - "autorization.ts"
Cohesion: 0.23
Nodes (9): AuthenticationError, getSecret(), AuthUserDTO, checkApiKey(), getDataFromAuth0(), getDataFromGoogle(), getDataFromLocal(), getDataFromMsal() (+1 more)

### Community 40 - "AuthenticationMethod.ts"
Cohesion: 0.09
Nodes (22): apiKeyController(), authorizationController(), GoogleTokenResponse, codeRepositoryController(), configurationController(), deploymentController(), environmentController(), globalVariablesController() (+14 more)

### Community 41 - "RepositoryFileService.ts"
Cohesion: 0.15
Nodes (14): FederationRemote, FederationFileChangeDTO, FederationIntegrationApplyRequestDTO, FederationIntegrationApplyResultDTO, FederationIntegrationPlanDTO, FederationIntegrationService, FederationIntegrationStatus, MicrofrontendIntegrationResultDTO (+6 more)

### Community 43 - "GitlabClient.ts"
Cohesion: 0.20
Nodes (6): AuthTokenDataDTO, UserCannotAccessThisDeploymentError, UserCannotAccessThisEnvironmentError, UserCannotAccessThisProjectError, IUser, userSchema

### Community 44 - "StackDetectionService"
Cohesion: 0.31
Nodes (3): COMPILER_MARKERS, FRAMEWORK_MARKERS, StackDetectionService

### Community 45 - "IMarket"
Cohesion: 0.19
Nodes (6): marketController(), IMarket, Market, marketSchema, BaseAuthorizedService, MarketService

### Community 48 - ".gitHubInjectApiKey"
Cohesion: 0.21
Nodes (9): CONFIG_CANDIDATES, FEDERATION_PLUGIN_BY_COMPILER, MicrofrontendStackDetectionDTO, PackageManifest, COMPILER_BY_NAME, FRAMEWORK_BY_NAME, parseCompiler(), parseFramework() (+1 more)

## Knowledge Gaps
- **198 isolated node(s):** `description`, `main`, `start`, `st`, `dev` (+193 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `toObjectId()` connect `MicrofrontendService.ts` to `ServeService.ts`, `MicrofrontendService`, `UserService.ts`, `toObjectId`, `BusinessException`, `ServeService`, `User`, `RepositoryFileService.ts`, `GitlabClient.ts`, `CodeRepositoryService`, `IMarket`, `AzureDevOpsClient.ts`, `DeploymentCanaryUsersService`, `projectWizardStateMachine.ts`, `ProjectWizardService`, `CodeRepositoryService.ts`, `GitLabClient`?**
  _High betweenness centrality (0.133) - this node is a cross-community bridge._
- **Why does `BaseAuthorizedService` connect `IMarket` to `MicrofrontendService.ts`, `MicrofrontendDependencyService.ts`, `ServeService.ts`, `MicrofrontendService`, `toObjectId`, `BusinessException`, `ServeService`, `RepositoryFileService.ts`, `GitlabClient.ts`, `StackDetectionService`, `CodeRepositoryService`, `AzureDevOpsClient.ts`, `DeploymentCanaryUsersService`, `.gitHubInjectApiKey`, `ProjectWizardService`, `GitLabClient`?**
  _High betweenness centrality (0.093) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `MicrofrontendService`, `package.json`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._
- **What connects `description`, `main`, `start` to the rest of the system?**
  _198 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `MicrofrontendService.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08680555555555555 - nodes in this community are weakly interconnected._
- **Should `MicrofrontendDependencyService.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06841046277665996 - nodes in this community are weakly interconnected._
- **Should `ServeService.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05981012658227848 - nodes in this community are weakly interconnected._