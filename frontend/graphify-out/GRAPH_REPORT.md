# Graph Report - frontend  (2026-08-11)

## Corpus Check
- 183 files · ~50,077 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1747 nodes · 2801 edges · 100 communities (92 shown, 8 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.65)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `52fdf4cb`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_microfrontend|microfrontend]]
- [[_COMMUNITY_cn|cn]]
- [[_COMMUNITY_microfrontend|microfrontend]]
- [[_COMMUNITY_useProjectStore|useProjectStore]]
- [[_COMMUNITY_dependencies|dependencies]]
- [[_COMMUNITY_apiKeys|apiKeys]]
- [[_COMMUNITY_apiKeys|apiKeys]]
- [[_COMMUNITY_project_users|project_users]]
- [[_COMMUNITY_project_users|project_users]]
- [[_COMMUNITY_dialog|dialog]]
- [[_COMMUNITY_useMicrofrontendsApi.ts|useMicrofrontendsApi.ts]]
- [[_COMMUNITY_MicrofrontendDependencyList.tsx|MicrofrontendDependencyList.tsx]]
- [[_COMMUNITY_devDependencies|devDependencies]]
- [[_COMMUNITY_ThemeToggle.tsx|ThemeToggle.tsx]]
- [[_COMMUNITY_Routes.tsx|Routes.tsx]]
- [[_COMMUNITY_auth|auth]]
- [[_COMMUNITY_auth|auth]]
- [[_COMMUNITY_EnvironmentList.tsx|EnvironmentList.tsx]]
- [[_COMMUNITY_useToastNotificationStore.ts|useToastNotificationStore.ts]]
- [[_COMMUNITY_card.tsx|card.tsx]]
- [[_COMMUNITY_integration|integration]]
- [[_COMMUNITY_integration|integration]]
- [[_COMMUNITY_DangerZoneRemoveMicrofrontend.tsx|DangerZoneRemoveMicrofrontend.tsx]]
- [[_COMMUNITY_common|common]]
- [[_COMMUNITY_common|common]]
- [[_COMMUNITY_AuthenticationLayout.tsx|AuthenticationLayout.tsx]]
- [[_COMMUNITY_deployments|deployments]]
- [[_COMMUNITY_deployments|deployments]]
- [[_COMMUNITY_useApiClient.tsx|useApiClient.tsx]]
- [[_COMMUNITY_index.ts|index.ts]]
- [[_COMMUNITY_Microfrontends.tsx|Microfrontends.tsx]]
- [[_COMMUNITY_FirstStartupWrapper.tsx|FirstStartupWrapper.tsx]]
- [[_COMMUNITY_useUserApi.ts|useUserApi.ts]]
- [[_COMMUNITY_ApiStatusHandler|ApiStatusHandler]]
- [[_COMMUNITY_compilerOptions|compilerOptions]]
- [[_COMMUNITY_dashboard|dashboard]]
- [[_COMMUNITY_project|project]]
- [[_COMMUNITY_dashboard|dashboard]]
- [[_COMMUNITY_form|form]]
- [[_COMMUNITY_project|project]]
- [[_COMMUNITY_useToastNotificationStore|useToastNotificationStore]]
- [[_COMMUNITY_CreateApiKeyDialog.tsx|CreateApiKeyDialog.tsx]]
- [[_COMMUNITY_AddMicrofrontend.tsx|AddMicrofrontend.tsx]]
- [[_COMMUNITY_components.json|components.json]]
- [[_COMMUNITY_environment|environment]]
- [[_COMMUNITY_environmentVariables|environmentVariables]]
- [[_COMMUNITY_SelectField.rhf.tsx|SelectField.rhf.tsx]]
- [[_COMMUNITY_useCodeRepositoriesApi.ts|useCodeRepositoriesApi.ts]]
- [[_COMMUNITY_App.tsx|App.tsx]]
- [[_COMMUNITY_ProjectUsers.tsx|ProjectUsers.tsx]]
- [[_COMMUNITY_AddStorage.tsx|AddStorage.tsx]]
- [[_COMMUNITY_compilerOptions|compilerOptions]]
- [[_COMMUNITY_environment|environment]]
- [[_COMMUNITY_environmentVariables|environmentVariables]]
- [[_COMMUNITY_AddMicrofrontend.tsx|AddMicrofrontend.tsx]]
- [[_COMMUNITY_build|build]]
- [[_COMMUNITY_platform.json|platform.json]]
- [[_COMMUNITY_page|page]]
- [[_COMMUNITY_compilerOptions|compilerOptions]]
- [[_COMMUNITY_build|build]]
- [[_COMMUNITY_Microfrontends.tsx|Microfrontends.tsx]]
- [[_COMMUNITY_useUserApi.ts|useUserApi.ts]]
- [[_COMMUNITY_project_invitation|project_invitation]]
- [[_COMMUNITY_project_invitation|project_invitation]]
- [[_COMMUNITY_platform.json|platform.json]]
- [[_COMMUNITY_page|page]]
- [[_COMMUNITY_delete|delete]]
- [[_COMMUNITY_dialog|dialog]]
- [[_COMMUNITY_settings|settings]]
- [[_COMMUNITY_stats|stats]]
- [[_COMMUNITY_EnvironmentVariableForm.tsx|EnvironmentVariableForm.tsx]]
- [[_COMMUNITY_card|card]]
- [[_COMMUNITY_clone|clone]]
- [[_COMMUNITY_card|card]]
- [[_COMMUNITY_table|table]]
- [[_COMMUNITY_setup|setup]]
- [[_COMMUNITY_form|form]]
- [[_COMMUNITY_setup|setup]]
- [[_COMMUNITY_EnvironmentVariableForm.tsx|EnvironmentVariableForm.tsx]]
- [[_COMMUNITY_app|app]]
- [[_COMMUNITY_projectInfo|projectInfo]]
- [[_COMMUNITY_Auth0AuthWrapper.tsx|Auth0AuthWrapper.tsx]]
- [[_COMMUNITY_app|app]]
- [[_COMMUNITY_react|react]]
- [[_COMMUNITY_ApiStatusHandler.tsx|ApiStatusHandler.tsx]]
- [[_COMMUNITY_hostTypes|hostTypes]]
- [[_COMMUNITY_validation|validation]]
- [[_COMMUNITY_hostTypes|hostTypes]]
- [[_COMMUNITY_deploymentTypes|deploymentTypes]]
- [[_COMMUNITY_deploymentTypes|deploymentTypes]]
- [[_COMMUNITY_manifest.json|manifest.json]]
- [[_COMMUNITY_global.d.ts|global.d.ts]]
- [[_COMMUNITY_WizardBasicProps.ts|WizardBasicProps.ts]]
- [[_COMMUNITY_ApiResponseDTO.ts|ApiResponseDTO.ts]]
- [[_COMMUNITY_vite-env.d.ts|vite-env.d.ts]]
- [[_COMMUNITY_vite.config.ts|vite.config.ts]]

## God Nodes (most connected - your core abstractions)
1. `microfrontend` - 102 edges
2. `microfrontend` - 77 edges
3. `Button()` - 56 edges
4. `useToastNotificationStore` - 54 edges
5. `apiKeys` - 45 edges
6. `apiKeys` - 45 edges
7. `useProjectStore` - 43 edges
8. `project_users` - 41 edges
9. `project_users` - 40 edges
10. `auth` - 31 edges

## Surprising Connections (you probably didn't know these)
- `UserButton()` --references--> `react`  [EXTRACTED]
  src/components/ui/Sidebar/partials/UserButton.tsx → package.json
- `useIsMobile()` --references--> `react`  [EXTRACTED]
  src/hooks/use-mobile.tsx → package.json
- `useApiClient()` --indirect_call--> `doRequest()`  [INFERRED]
  src/hooks/useApiClient.tsx → src/api/apiClient.ts
- `Auth0AuthWrapper()` --calls--> `useGlobalParameters()`  [EXTRACTED]
  src/authentication/Auth0AuthWrapper.tsx → src/contexts/GlobalParameterProvider.tsx
- `SocialLoginRow()` --calls--> `useGlobalParameters()`  [EXTRACTED]
  src/authentication/components/SocialLoginRow.tsx → src/contexts/GlobalParameterProvider.tsx

## Import Cycles
- 3-file cycle: `src/pages/integration/partials/index.ts -> src/pages/integration/partials/views/index.ts -> src/pages/integration/partials/views/FrontendIntegration.tsx -> src/pages/integration/partials/index.ts`
- 3-file cycle: `src/authentication/components/LoginPage.tsx -> src/authentication/components/SocialLoginRow.tsx -> src/authentication/components/LoginWithGoogleButton.tsx -> src/authentication/components/LoginPage.tsx`
- 3-file cycle: `src/authentication/components/LoginPage.tsx -> src/authentication/components/SocialLoginRow.tsx -> src/authentication/components/LoginWithAuth0Button.tsx -> src/authentication/components/LoginPage.tsx`
- 3-file cycle: `src/authentication/components/LoginPage.tsx -> src/authentication/components/SocialLoginRow.tsx -> src/authentication/components/LoginWithMicrosoftButton.tsx -> src/authentication/components/LoginPage.tsx`
- 3-file cycle: `src/hooks/apiClients/useEnvironmentsApi.ts -> src/hooks/useApiClient.tsx -> src/store/useProjectStore.ts -> src/hooks/apiClients/useEnvironmentsApi.ts`
- 3-file cycle: `src/hooks/apiClients/useProjectApi.ts -> src/hooks/useApiClient.tsx -> src/store/useProjectStore.ts -> src/hooks/apiClients/useProjectApi.ts`
- 4-file cycle: `src/hooks/apiClients/useEnvironmentsApi.ts -> src/hooks/useApiClient.tsx -> src/store/useProjectStore.ts -> src/hooks/apiClients/useProjectApi.ts -> src/hooks/apiClients/useEnvironmentsApi.ts`

## Communities (100 total, 8 thin omitted)

### Community 0 - "microfrontend"
Cohesion: 0.02
Nodes (95): microfrontend, add_new, add_new_description, add_your_first_microfrontend, azure_project, based_on_url, based_on_version, canary_percentage (+87 more)

### Community 1 - "cn"
Cohesion: 0.24
Nodes (9): Market, useMarketApi(), BlankTemplateCard(), BlankTemplateCardProps, FetchDataTemplateCard(), FetchDataTemplateCardProps, TemplateCard(), TemplateCardProps (+1 more)

### Community 2 - "microfrontend"
Cohesion: 0.03
Nodes (72): microfrontend, add_new, add_new_description, add_your_first_microfrontend, azure_project, based_on_url, based_on_version, canary_percentage (+64 more)

### Community 3 - "useProjectStore"
Cohesion: 0.13
Nodes (17): Button(), MicrofrontendsEmptyState(), MicrofrontendsEmptyStateProps, NewProjectWizard(), NewProjectWizardProps, MainData(), MainDataForm, slugify() (+9 more)

### Community 4 - "dependencies"
Cohesion: 0.06
Nodes (32): dependencies, @auth0/auth0-react, axios, @azure/msal-browser, @azure/msal-react, clsx, date-fns, @heroicons/react (+24 more)

### Community 5 - "apiKeys"
Cohesion: 0.04
Nodes (45): apiKeys, api_key_created, api_key_created_description, api_keys, api_keys_description, confirm_delete, copy_and_close, copy_to_clipboard (+37 more)

### Community 6 - "apiKeys"
Cohesion: 0.04
Nodes (45): apiKeys, api_key_created, api_key_created_description, api_keys, api_keys_description, confirm_delete, copy_and_close, copy_to_clipboard (+37 more)

### Community 7 - "project_users"
Cohesion: 0.05
Nodes (44): project_users, accepted, already_invited, already_member, cannot_invite_self, confirm_remove, confirm_remove_description, confirm_remove_title (+36 more)

### Community 8 - "project_users"
Cohesion: 0.05
Nodes (43): project_users, accepted, already_invited, already_member, cannot_invite_self, confirm_remove, confirm_remove_title, confirm_revoke (+35 more)

### Community 9 - "dialog"
Cohesion: 0.05
Nodes (41): delete, subtitle, title, button, confirmation, description, dialog, error (+33 more)

### Community 10 - "useMicrofrontendsApi.ts"
Cohesion: 0.20
Nodes (12): CanaryDeploymentType, CanaryType, DimensionsDTO, HostedOn, PositionDTO, RelationDTO, MicrofrontendCardProps, CANARY_DEPLOYMENT_TYPE_LABEL_KEYS (+4 more)

### Community 11 - "MicrofrontendDependencyList.tsx"
Cohesion: 0.09
Nodes (32): AlignmentApplyRequest, AlignmentApplyResult, AlignmentApplyResultItem, AlignmentPlan, CodeRepositoryProvider, Dependency, DependencyAlignmentIssue, DependencyKind (+24 more)

### Community 12 - "devDependencies"
Cohesion: 0.11
Nodes (18): devDependencies, autoprefixer, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, postcss (+10 more)

### Community 13 - "ThemeToggle.tsx"
Cohesion: 0.25
Nodes (13): LoginPage(), CalendarField(), CalendarFieldProps, LanguageSelector(), LanguageSelectorProps, ThemeToggle(), ThemeToggleProps, useUserApi() (+5 more)

### Community 14 - "Routes.tsx"
Cohesion: 0.06
Nodes (26): AccountActivation, AddAzure, AddGithub, AddGitlab, AddMicrofrontend, AddStorage, ApiKeys, CanaryUsers (+18 more)

### Community 15 - "auth"
Cohesion: 0.06
Nodes (34): description, success, title, auth, account_activation, already_have_account, confirm_password, create_account (+26 more)

### Community 16 - "auth"
Cohesion: 0.06
Nodes (34): description, success, title, auth, account_activation, already_have_account, confirm_password, create_account (+26 more)

### Community 17 - "EnvironmentList.tsx"
Cohesion: 0.12
Nodes (20): EnvironmentSelectorProps, CreateEnvironmentDTO, EnvironmentDTO, useEnvironmentsApi(), moveItem(), useDragAndDropOrder(), UseDragAndDropOrderProps, EnvironmentDialog() (+12 more)

### Community 18 - "useToastNotificationStore.ts"
Cohesion: 0.21
Nodes (16): ProjectPickerListProps, SwitchProjectButton(), AddUserToProjectDTO, Project, ProjectSummaryDTO, useProjectApi(), Settings(), useProjectStore (+8 more)

### Community 19 - "card.tsx"
Cohesion: 0.33
Nodes (6): ProjectPickerList(), SinglePageLayout(), MicrofrontendSelector(), AddNewMicrofrontendCard(), AddNewMicrofrontendCardProps, cn()

### Community 20 - "integration"
Cohesion: 0.07
Nodes (28): description, step2, title, description, javascript_description, javascript_direct_api_access, javascript_direct_api_access_description, javascript_example (+20 more)

### Community 21 - "integration"
Cohesion: 0.07
Nodes (28): description, step2, title, description, javascript_description, javascript_direct_api_access, javascript_direct_api_access_description, javascript_example (+20 more)

### Community 22 - "DangerZoneRemoveMicrofrontend.tsx"
Cohesion: 0.13
Nodes (9): cn(), DangerZone(), DangerZoneProps, InfoItemProps, ProjectInfoSection(), ProjectInfoSectionProps, ProjectStatsSection(), ProjectStatsSectionProps (+1 more)

### Community 23 - "common"
Cohesion: 0.07
Nodes (27): common, actions, active, add, back, cancel, close, configuration (+19 more)

### Community 24 - "common"
Cohesion: 0.07
Nodes (27): common, actions, active, add, back, cancel, close, configuration (+19 more)

### Community 25 - "AuthenticationLayout.tsx"
Cohesion: 0.13
Nodes (21): AuthenticationLayout(), ApiStatusHandler(), GlobalParameterContext, IGlobalParametersContext, useGlobalParameters(), CodeRepositoryType, AccountActivation(), FormValues (+13 more)

### Community 26 - "deployments"
Cohesion: 0.08
Nodes (25): redeploy, view_canary_users, columns, coming_soon, coming_soon_description, no_users, subtitle, title (+17 more)

### Community 27 - "deployments"
Cohesion: 0.08
Nodes (25): redeploy, view_canary_users, columns, coming_soon, coming_soon_description, no_users, subtitle, title (+17 more)

### Community 28 - "useApiClient.tsx"
Cohesion: 0.13
Nodes (20): AuthenticationType, createUrl(), doRequest(), getUTMFields(), IClientRequestData, IClientRequestMetadata, IUTMFields, out (+12 more)

### Community 29 - "index.ts"
Cohesion: 0.18
Nodes (14): FormValues, LoginComponentProps, LoginWithAuth0Button(), LoginWithGoogleButton(), LoginWithMicrosoftButton(), SocialLoginRow(), SocialLoginRowProps, getAccessToken() (+6 more)

### Community 30 - "Microfrontends.tsx"
Cohesion: 0.31
Nodes (4): InjectRemotesInHostParams, useIntegrationApi(), EnvironmentVariablesIntegration(), FrontendIntegration()

### Community 31 - "FirstStartupWrapper.tsx"
Cohesion: 0.24
Nodes (7): GoogleAuthWrapper(), MicrosoftAuthWrapper(), MicrosoftAuthWrapperProps, AuthProvidersConfig, AzureProviderConfig, GlobalConfigDTO, GoogleProviderConfig

### Community 32 - "useUserApi.ts"
Cohesion: 0.29
Nodes (9): PENDING_INVITATIONS_QUERY_KEY, PendingInvitationsList(), PendingInvitationsListProps, usePendingInvitationsQuery(), AcceptInvitationDTO, AcceptInvitationResponse, InvitationInfo, PendingInvitation (+1 more)

### Community 33 - "ApiStatusHandler"
Cohesion: 0.19
Nodes (12): CanaryUser, useCanaryUsersApi(), CanaryUser, useDeploymentsApi(), useApiClient(), CanaryUsers(), Deployments(), DeploymentList() (+4 more)

### Community 34 - "compilerOptions"
Cohesion: 0.10
Nodes (20): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+12 more)

### Community 35 - "dashboard"
Cohesion: 0.11
Nodes (19): clearSearch, description, filteredCount_one, filteredCount_other, filterStatus, noResultsDescription, noResultsTitle, resetFilters (+11 more)

### Community 36 - "project"
Cohesion: 0.11
Nodes (19): project, create, create_new, create_new_project, description, description_placeholder, name, name_placeholder (+11 more)

### Community 37 - "dashboard"
Cohesion: 0.11
Nodes (19): clearSearch, description, filteredCount_one, filteredCount_other, filterStatus, noResultsDescription, noResultsTitle, resetFilters (+11 more)

### Community 38 - "form"
Cohesion: 0.11
Nodes (19): form, color, color_placeholder, color_required, description, description_placeholder, domains, domains_placeholder (+11 more)

### Community 39 - "project"
Cohesion: 0.11
Nodes (19): project, create, create_new, create_new_project, description, description_placeholder, name, name_placeholder (+11 more)

### Community 40 - "useToastNotificationStore"
Cohesion: 0.50
Nodes (3): Sidebar, MainLayout(), MainLayoutProps

### Community 41 - "CreateApiKeyDialog.tsx"
Cohesion: 0.16
Nodes (12): ApiKey, CreateApiKeyDTO, CreateApiKeyResponseDTO, useApiKeysApi(), ApiKeys(), CreateApiKeyDialog(), CreateApiKeyDialogProps, ApiKeyFormData (+4 more)

### Community 42 - "AddMicrofrontend.tsx"
Cohesion: 0.22
Nodes (10): CloneRepositoryPopover(), CloneUrlRowProps, CopiedTarget, IdeCloneButtonProps, asNonEmptyString(), buildGitCloneCommand(), buildIntelliJCloneUrl(), buildVsCodeCloneUrl() (+2 more)

### Community 43 - "components.json"
Cohesion: 0.25
Nodes (7): engines, node, name, packageManager, private, type, version

### Community 44 - "environment"
Cohesion: 0.11
Nodes (19): environment, color, color_tooltip, configure, create_success, created_success_message, custom_environments, delete_title (+11 more)

### Community 45 - "environmentVariables"
Cohesion: 0.10
Nodes (21): environmentVariables, actions, addVariable, confirmDeleteDescription, confirmDeleteTitle, created_success, deleteConfirmation, deleted_success (+13 more)

### Community 46 - "SelectField.rhf.tsx"
Cohesion: 0.25
Nodes (8): scripts, build, build:dev, dev, format, lint, preview, typecheck

### Community 47 - "useCodeRepositoriesApi.ts"
Cohesion: 0.09
Nodes (25): SinglePageHeaderProps, AddRepositoryAzureDTO, AddRepositoryGithubDTO, AddRepositoryGitlabDTO, AzureDevOpsProject, AzureDevOpsProjectsResponse, CodeRepositoryProvider, GithubOrganization (+17 more)

### Community 48 - "App.tsx"
Cohesion: 0.17
Nodes (10): App(), queryClient, GlobalParameterProvider(), InitialThemeWrapper(), Notification(), SentryInit(), themeEnumToClassName, ThemeHandler() (+2 more)

### Community 49 - "ProjectUsers.tsx"
Cohesion: 0.21
Nodes (13): RoleInProject, ProjectUser, useProjectUserApi(), Row, AddUserButton(), AddUserButtonProps, InviteUserFormValues, gravatarHash() (+5 more)

### Community 50 - "AddStorage.tsx"
Cohesion: 0.12
Nodes (16): TextareaFieldProps, AzureAuthConfig, AzureStorageConfig, CreateStorageDTO, GoogleAuthConfig, GoogleStorageConfig, IStorageAuth, S3ClientConfig (+8 more)

### Community 51 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, isolatedModules, lib, module, moduleDetection, moduleResolution, noEmit (+7 more)

### Community 52 - "environment"
Cohesion: 0.13
Nodes (15): environment, add_environment, color, color_tooltip, configure, create_success, created_success_message, custom_environments (+7 more)

### Community 53 - "environmentVariables"
Cohesion: 0.11
Nodes (19): environmentVariables, actions, addVariable, created_success, deleteConfirmation, deleted_success, deleteVariable, editVariable (+11 more)

### Community 54 - "AddMicrofrontend.tsx"
Cohesion: 0.13
Nodes (17): TextFieldProps, ICodeRepository, Repository, Storage, AddNewMicrofrontendForm(), AddNewMicrofrontendFormProps, AddNewMicrofrontendPageProps, formSchema (+9 more)

### Community 55 - "build"
Cohesion: 0.17
Nodes (12): branch, building, buildSuccess, custom_version, defaultBranch, loadingBranches, selectBranch, startBuild (+4 more)

### Community 56 - "platform.json"
Cohesion: 0.17
Nodes (11): language, change, english, italian, theme, dark, light, system (+3 more)

### Community 57 - "page"
Cohesion: 0.17
Nodes (12): page, color, create_button, create_success, description, new_environment, reorder, title (+4 more)

### Community 58 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, allowJs, noImplicitAny, noUnusedLocals, noUnusedParameters, paths, skipLibCheck, strictNullChecks (+3 more)

### Community 59 - "build"
Cohesion: 0.18
Nodes (11): branch, building, buildSuccess, defaultBranch, loadingBranches, selectBranch, startBuild, title (+3 more)

### Community 60 - "Microfrontends.tsx"
Cohesion: 0.20
Nodes (11): useMicrofrontendsApi(), Microfrontends(), View, VIEWS, BuildDialog(), BuildDialogProps, FormData, FormDataSchema (+3 more)

### Community 61 - "useUserApi.ts"
Cohesion: 0.24
Nodes (10): AuthResponse, ResetPasswordDataDTO, ResetPasswordRequestDTO, User, UserInvitationDTO, UserLoginDTO, UserRegistrationDTO, ThemeEnum (+2 more)

### Community 62 - "project_invitation"
Cohesion: 0.13
Nodes (15): project_invitation, accept, accept_short, accepted, decline, declined, description, error_description (+7 more)

### Community 63 - "project_invitation"
Cohesion: 0.13
Nodes (15): project_invitation, accept, accept_short, accepted, decline, declined, description, error_description (+7 more)

### Community 64 - "platform.json"
Cohesion: 0.22
Nodes (8): color_picker, select_color, language, change, english, italian, validation, required

### Community 65 - "page"
Cohesion: 0.21
Nodes (9): AuthenticationLayoutProps, sizeClasses, MainLogo(), MainLogoProps, sizeClasses, useStartupApi(), FirstStartupWrapper(), RegisterFirstUser() (+1 more)

### Community 66 - "delete"
Cohesion: 0.06
Nodes (38): delete, subtitle, title, button, description, dialog, success, title (+30 more)

### Community 67 - "dialog"
Cohesion: 0.21
Nodes (9): DeploymentDTO, GlobalVariable, ICodeIntegrationDTO, ICodeIntegrationRequestDTO, IServe, IServeMicrofrontend, useServeApi(), CodeIntegration() (+1 more)

### Community 68 - "settings"
Cohesion: 0.21
Nodes (9): Microfrontend, MicrofrontendSelectorProps, CloneRepositoryPopoverProps, IDangerZoneRemoveMicrofrontendProps, MicrofrontendCard(), MicrofrontendFlowProps, THEME_TO_COLOR_MODE, MicrofrontendsGrid() (+1 more)

### Community 69 - "stats"
Cohesion: 0.24
Nodes (7): ColorPickerProps, EnvironmentSet(), EnvironmentSetProps, DEFAULT_COLORS, EnvironmentPreset, EnvironmentPresetGroup, presetEnvironmentGroups

### Community 70 - "EnvironmentVariableForm.tsx"
Cohesion: 0.23
Nodes (9): DeleteConfirmationDialog(), DeleteConfirmationDialogProps, EnvironmentValue, GlobalVariableCreateDTO, GlobalVariableUpdateDTO, useGlobalVariablesApi(), EnvironmentVariablesPageInner(), EnvironmentVariableDialog() (+1 more)

### Community 71 - "card"
Cohesion: 0.29
Nodes (7): build, canary, repository, storage, users, version, card

### Community 72 - "clone"
Cohesion: 0.25
Nodes (8): button, description, https, intellij, ssh, title, vscode, clone

### Community 73 - "card"
Cohesion: 0.29
Nodes (7): build, canary, repository, storage, users, version, card

### Community 74 - "table"
Cohesion: 0.29
Nodes (7): table, actions, description, is_production, name, no_environments, slug

### Community 75 - "setup"
Cohesion: 0.33
Nodes (6): setup, description, project_name, project_name_min_length, project_name_placeholder, title

### Community 76 - "form"
Cohesion: 0.33
Nodes (6): cancel, create, create_title, edit_title, update, form

### Community 77 - "setup"
Cohesion: 0.33
Nodes (6): setup, description, project_name, project_name_min_length, project_name_placeholder, title

### Community 78 - "EnvironmentVariableForm.tsx"
Cohesion: 0.29
Nodes (5): EnvironmentValue, environmentValueSchema, EnvironmentVariableFormProps, formSchema, FormValues

### Community 79 - "app"
Cohesion: 0.40
Nodes (5): app, error, name, generic, not_found

### Community 80 - "projectInfo"
Cohesion: 0.40
Nodes (5): theme, dark, light, system, toggle_theme

### Community 81 - "Auth0AuthWrapper.tsx"
Cohesion: 0.50
Nodes (3): Auth0AuthWrapper(), Auth0AuthWrapperProps, Auth0ProviderConfig

### Community 82 - "app"
Cohesion: 0.40
Nodes (5): app, error, name, generic, not_found

### Community 85 - "hostTypes"
Cohesion: 0.50
Nodes (4): customSource, customUrl, mfeOrchestratorHub, hostTypes

### Community 87 - "validation"
Cohesion: 0.50
Nodes (4): validation, name_required, slug_invalid, slug_required

### Community 88 - "hostTypes"
Cohesion: 0.50
Nodes (4): customSource, customUrl, mfeOrchestratorHub, hostTypes

### Community 90 - "deploymentTypes"
Cohesion: 0.67
Nodes (3): basedOnUrl, basedOnVersion, deploymentTypes

### Community 91 - "deploymentTypes"
Cohesion: 0.67
Nodes (3): basedOnUrl, basedOnVersion, deploymentTypes

## Knowledge Gaps
- **1167 isolated node(s):** `name`, `private`, `version`, `type`, `packageManager` (+1162 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `microfrontend` connect `microfrontend` to `platform.json`, `delete`, `dashboard`, `card`, `clone`, `hostTypes`, `build`, `deploymentTypes`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `react`, `components.json`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Why does `UserButton()` connect `index.ts` to `react`, `ThemeToggle.tsx`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _1167 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `microfrontend` be split into smaller, more focused modules?**
  _Cohesion score 0.021052631578947368 - nodes in this community are weakly interconnected._
- **Should `microfrontend` be split into smaller, more focused modules?**
  _Cohesion score 0.027777777777777776 - nodes in this community are weakly interconnected._
- **Should `useProjectStore` be split into smaller, more focused modules?**
  _Cohesion score 0.13118279569892474 - nodes in this community are weakly interconnected._