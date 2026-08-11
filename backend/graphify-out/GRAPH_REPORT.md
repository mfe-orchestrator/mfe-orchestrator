# Graph Report - backend  (2026-08-11)

## Corpus Check
- 130 files · ~42,413 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 896 nodes · 2344 edges · 37 communities (32 shown, 5 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 8 edges (avg confidence: 0.54)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1c31f5d5`
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
- [[_COMMUNITY_AzureDevOpsClient|AzureDevOpsClient]]
- [[_COMMUNITY_ProjectWizardService|ProjectWizardService]]
- [[_COMMUNITY_compilerOptions|compilerOptions]]
- [[_COMMUNITY_package.json|package.json]]
- [[_COMMUNITY_CodeRepository|CodeRepository]]
- [[_COMMUNITY_devDependencies|devDependencies]]
- [[_COMMUNITY_scripts|scripts]]
- [[_COMMUNITY_CodeRepositoryModel.ts|CodeRepositoryModel.ts]]
- [[_COMMUNITY_compilerOptions|compilerOptions]]
- [[_COMMUNITY_postbuild.js|postbuild.js]]
- [[_COMMUNITY_recaptcha.ts|recaptcha.ts]]
- [[_COMMUNITY_ProjectNewDTO.ts|ProjectNewDTO.ts]]

## God Nodes (most connected - your core abstractions)
1. `toObjectId()` - 85 edges
2. `CodeRepositoryService` - 42 edges
3. `BaseAuthorizedService` - 39 edges
4. `ServeService` - 39 edges
5. `MicrofrontendService` - 32 edges
6. `Environment` - 31 edges
7. `IMicrofrontend` - 31 edges
8. `MicrofrontendDependencyService` - 29 edges
9. `GithubClient` - 28 edges
10. `createBusinessException()` - 28 edges

## Surprising Connections (you probably didn't know these)
- `CreateBuildRequest` --references--> `CodeRepositoryType`  [EXTRACTED]
  src/client/GithubClient.ts → src/models/CodeRepositoryModel.ts
- `authorizationController()` --references--> `FastifyInstance`  [EXTRACTED]
  src/controller/AuthorizationController.ts → src/types/fastify.d.ts
- `configurationController()` --references--> `FastifyInstance`  [EXTRACTED]
  src/controller/ConfigurationController.ts → src/types/fastify.d.ts
- `deploymentController()` --references--> `FastifyInstance`  [EXTRACTED]
  src/controller/DeploymentCanaryUsersController.ts → src/types/fastify.d.ts
- `echoController()` --references--> `FastifyInstance`  [EXTRACTED]
  src/controller/EchoController.ts → src/types/fastify.d.ts

## Import Cycles
- None detected.

## Communities (37 total, 5 thin omitted)

### Community 0 - "MicrofrontendService.ts"
Cohesion: 0.06
Nodes (44): AcceptInvitationDTO, AddUserToProjectDTO, PopulatedProject, projectUserController(), UpdateUserRoleDTO, UserProjectWithProject, AuthTokenDataDTO, createBusinessException() (+36 more)

### Community 1 - "MicrofrontendDependencyService.ts"
Cohesion: 0.06
Nodes (45): cache, CacheEntry, NpmAbbreviatedPackument, NpmPackageInfo, NpmRegistryClient, CodeRepositoryProvider, CodeRepositoryCreateInput, CodeRepositoryUpdateInput (+37 more)

### Community 2 - "ServeService.ts"
Cohesion: 0.05
Nodes (42): AuthConfig, AzureStorageClient, AzureStorageConfig, AuthConfig, GoogleStorageConfig, S3ClientConfig, CanaryDeploymentType, CanaryType (+34 more)

### Community 3 - "MicrofrontendService"
Cohesion: 0.07
Nodes (14): adm-zip, GoogleStorageClient, S3BucketClient, marketController(), IMarket, Market, marketSchema, IMicrofrontend (+6 more)

### Community 4 - "UserService.ts"
Cohesion: 0.06
Nodes (29): authorizationController(), GoogleTokenResponse, configurationController(), serveController(), StartupController(), StartupUserRegistrationDTO, UserController(), AuthenticationError (+21 more)

### Community 5 - "toObjectId"
Cohesion: 0.11
Nodes (17): deploymentSchema, Environment, environmentSchema, IEnvironment, GlobalVariable, globalVariableSchema, IGlobalVariable, BaseAuthorizedService (+9 more)

### Community 6 - "ServeService"
Cohesion: 0.09
Nodes (5): Deployment, IDeployment, DeploymentService, hashToBucket(), ServeService

### Community 7 - "GithubClient"
Cohesion: 0.05
Nodes (9): GithubClient, AddGroupSecretRequest, CheckGroupSecretExistsRequest, CommitAction, CommitFilesRequest, CreateRepositoryRequest, GitLabClient, GitLabGroup (+1 more)

### Community 8 - "CustomError"
Cohesion: 0.06
Nodes (13): BusinessException, CustomError, EnvironmentHeaderNotFoundError, InvalidCredentialsError, ProjectHeaderNotFoundError, UserAlreadyExistsError, UserCannotAccessThisDeploymentError, UserNotFoundError (+5 more)

### Community 9 - "FastifyInstance"
Cohesion: 0.11
Nodes (23): apiKeyController(), codeRepositoryController(), deploymentController(), environmentController(), globalVariablesController(), integrationController(), microfrontendController(), microfrontendDependencyController() (+15 more)

### Community 10 - "TelemetryService.ts"
Cohesion: 0.10
Nodes (24): telemetryController(), configSchema, Configuration, IConfiguration, NODE_ENVS, logTelemetryNotice(), TelemetryService, fastify (+16 more)

### Community 11 - "dependencies"
Cohesion: 0.06
Nodes (34): dependencies, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, axios, @azure/identity, @azure/storage-blob, bcryptjs, dotenv (+26 more)

### Community 12 - "GithubClient.ts"
Cohesion: 0.12
Nodes (20): CreateBuildRequest, CreateRepositoryRequest, GithubAccessTokenResponse, GithubAccessTokenRquest, GithubBaseDTO, GithubContentsResponse, GithubCreateBranchDTO, GithubFileContent (+12 more)

### Community 14 - "AzureDevOpsClient.ts"
Cohesion: 0.10
Nodes (18): AzureAccessTokenRequest, AzureAccessTokenResponse, AzureDevOpsBranch, AzureDevOpsBranchDTO, AzureDevOpsItem, AzureDevOpsPipeline, AzureDevOpsProject, AzureDevOpsProjectsResponse (+10 more)

### Community 15 - "CodeRepositoryService.ts"
Cohesion: 0.19
Nodes (7): GithubBranch, CodeRepositoryType, UnifiedBranch, CreateAzureDevOpsRepositoryDTO, CreateGitlabRepositoryDto, UpdateGithubDTO, runInTransaction()

### Community 16 - "DeploymentCanaryUsersService"
Cohesion: 0.17
Nodes (6): deploymentController(), DeploymentToCanaryUsers, deploymentToCanaryUsersSchema, IDeploymentToCanaryUsers, DeploymentCanaryUsersService, DeploymentCanaryUsersDTO

### Community 18 - "ProjectWizardService"
Cohesion: 0.33
Nodes (4): IWizardProjectState, WizardProjectState, WizardProjectStateSchema, ProjectWizardService

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

### Community 24 - "CodeRepositoryModel.ts"
Cohesion: 0.25
Nodes (7): azureDataSchema, codeRepositorySchema, githubDataSchema, gitlabDataSchema, IAzureData, IGithubData, IGitlabData

### Community 25 - "compilerOptions"
Cohesion: 0.25
Nodes (7): compilerOptions, esModuleInterop, isolatedModules, module, types, extends, include

### Community 26 - "postbuild.js"
Cohesion: 0.40
Nodes (4): copyDirectory(), fs, path, postBuild()

## Knowledge Gaps
- **182 isolated node(s):** `description`, `main`, `start`, `st`, `dev` (+177 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `toObjectId()` connect `toObjectId` to `MicrofrontendService.ts`, `MicrofrontendDependencyService.ts`, `ServeService.ts`, `MicrofrontendService`, `UserService.ts`, `ServeService`, `FastifyInstance`, `CodeRepositoryService`, `CodeRepositoryService.ts`, `DeploymentCanaryUsersService`, `ProjectWizardService`, `CodeRepository`?**
  _High betweenness centrality (0.137) - this node is a cross-community bridge._
- **Why does `BaseAuthorizedService` connect `toObjectId` to `MicrofrontendService.ts`, `MicrofrontendDependencyService.ts`, `ServeService.ts`, `MicrofrontendService`, `ServeService`, `FastifyInstance`, `CodeRepositoryService`, `CodeRepositoryService.ts`, `DeploymentCanaryUsersService`, `ProjectWizardService`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `MicrofrontendService`, `package.json`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **What connects `description`, `main`, `start` to the rest of the system?**
  _182 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `MicrofrontendService.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05584192439862543 - nodes in this community are weakly interconnected._
- **Should `MicrofrontendDependencyService.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06263173742848539 - nodes in this community are weakly interconnected._
- **Should `ServeService.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05407925407925408 - nodes in this community are weakly interconnected._