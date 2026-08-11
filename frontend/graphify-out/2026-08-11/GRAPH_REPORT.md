# Graph Report - frontend  (2026-08-07)

## Corpus Check
- 230 files · ~56,870 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1934 nodes · 3558 edges · 102 communities (95 shown, 7 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.65)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `4b91000e`
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
- [[_COMMUNITY_useServeApi.ts|useServeApi.ts]]
- [[_COMMUNITY_build|build]]
- [[_COMMUNITY_platform.json|platform.json]]
- [[_COMMUNITY_page|page]]
- [[_COMMUNITY_compilerOptions|compilerOptions]]
- [[_COMMUNITY_build|build]]
- [[_COMMUNITY_form.tsx|form.tsx]]
- [[_COMMUNITY_Dependencies.tsx|Dependencies.tsx]]
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
- [[_COMMUNITY_TextField.rhf.tsx|TextField.rhf.tsx]]
- [[_COMMUNITY_app|app]]
- [[_COMMUNITY_projectInfo|projectInfo]]
- [[_COMMUNITY_theme|theme]]
- [[_COMMUNITY_app|app]]
- [[_COMMUNITY_react|react]]
- [[_COMMUNITY_form|form]]
- [[_COMMUNITY_hostTypes|hostTypes]]
- [[_COMMUNITY_form|form]]
- [[_COMMUNITY_validation|validation]]
- [[_COMMUNITY_hostTypes|hostTypes]]
- [[_COMMUNITY_ApiStatusHandler.tsx|ApiStatusHandler.tsx]]
- [[_COMMUNITY_deploymentTypes|deploymentTypes]]
- [[_COMMUNITY_deploymentTypes|deploymentTypes]]
- [[_COMMUNITY_manifest.json|manifest.json]]
- [[_COMMUNITY_global.d.ts|global.d.ts]]
- [[_COMMUNITY_WizardBasicProps.ts|WizardBasicProps.ts]]
- [[_COMMUNITY_ApiResponseDTO.ts|ApiResponseDTO.ts]]
- [[_COMMUNITY_vite-env.d.ts|vite-env.d.ts]]
- [[_COMMUNITY_vite.config.ts|vite.config.ts]]

## God Nodes (most connected - your core abstractions)
1. `microfrontend` - 101 edges
2. `microfrontend` - 82 edges
3. `cn()` - 64 edges
4. `Button` - 59 edges
5. `useToastNotificationStore` - 52 edges
6. `apiKeys` - 45 edges
7. `apiKeys` - 45 edges
8. `useProjectStore` - 43 edges
9. `project_users` - 41 edges
10. `project_users` - 40 edges

## Surprising Connections (you probably didn't know these)
- `DeleteConfirmationDialog()` --references--> `react`  [EXTRACTED]
  src/components/ui/DeleteConfirmationDialog.tsx → package.json
- `useFormField()` --references--> `react`  [EXTRACTED]
  src/components/ui/form.tsx → package.json
- `UserButton()` --references--> `react`  [EXTRACTED]
  src/components/ui/Sidebar/partials/UserButton.tsx → package.json
- `useIsMobile()` --references--> `react`  [EXTRACTED]
  src/hooks/use-mobile.tsx → package.json
- `EnvironmentSelectorProps` --references--> `EnvironmentDTO`  [EXTRACTED]
  src/components/molecules/EnvironmentSelector.tsx → src/hooks/apiClients/useEnvironmentsApi.ts

## Import Cycles
- 3-file cycle: `src/pages/integration/partials/index.ts -> src/pages/integration/partials/views/index.ts -> src/pages/integration/partials/views/FrontendIntegration.tsx -> src/pages/integration/partials/index.ts`
- 3-file cycle: `src/authentication/components/LoginPage.tsx -> src/authentication/components/SocialLoginRow.tsx -> src/authentication/components/LoginWithAuth0Button.tsx -> src/authentication/components/LoginPage.tsx`
- 3-file cycle: `src/authentication/components/LoginPage.tsx -> src/authentication/components/SocialLoginRow.tsx -> src/authentication/components/LoginWithGoogleButton.tsx -> src/authentication/components/LoginPage.tsx`
- 3-file cycle: `src/authentication/components/LoginPage.tsx -> src/authentication/components/SocialLoginRow.tsx -> src/authentication/components/LoginWithMicrosoftButton.tsx -> src/authentication/components/LoginPage.tsx`
- 3-file cycle: `src/hooks/apiClients/useEnvironmentsApi.ts -> src/hooks/useApiClient.tsx -> src/store/useProjectStore.ts -> src/hooks/apiClients/useEnvironmentsApi.ts`
- 3-file cycle: `src/hooks/apiClients/useProjectApi.ts -> src/hooks/useApiClient.tsx -> src/store/useProjectStore.ts -> src/hooks/apiClients/useProjectApi.ts`
- 4-file cycle: `src/hooks/apiClients/useEnvironmentsApi.ts -> src/hooks/useApiClient.tsx -> src/store/useProjectStore.ts -> src/hooks/apiClients/useProjectApi.ts -> src/hooks/apiClients/useEnvironmentsApi.ts`

## Communities (102 total, 7 thin omitted)

### Community 0 - "microfrontend"
Cohesion: 0.02
Nodes (94): microfrontend, add_new, add_new_description, add_your_first_microfrontend, azure_project, based_on_url, based_on_version, canary_percentage (+86 more)

### Community 1 - "cn"
Cohesion: 0.05
Nodes (45): IBadgeProps, BadgeVariants, ButtonVariants, IButtonProps, CalendarField(), CalendarFieldProps, EnvironmentSelectorProps, ProjectPickerList() (+37 more)

### Community 2 - "microfrontend"
Cohesion: 0.03
Nodes (77): microfrontend, add_new, add_new_description, add_your_first_microfrontend, azure_project, based_on_url, based_on_version, canary_percentage (+69 more)

### Community 3 - "useProjectStore"
Cohesion: 0.06
Nodes (44): ProjectPickerListProps, SwitchProjectButton(), TooltipContent, AddUserToProjectDTO, Project, ProjectSummaryDTO, RoleInProject, useProjectApi() (+36 more)

### Community 4 - "dependencies"
Cohesion: 0.03
Nodes (59): dependencies, @auth0/auth0-react, axios, @azure/msal-browser, @azure/msal-react, class-variance-authority, clsx, cmdk (+51 more)

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
Cohesion: 0.09
Nodes (30): CardFooter, CanaryDeploymentType, CanaryType, DimensionsDTO, HostedOn, Microfrontend, PositionDTO, RelationDTO (+22 more)

### Community 11 - "MicrofrontendDependencyList.tsx"
Cohesion: 0.09
Nodes (28): Badge(), AccordionContent, AccordionItem, AccordionTrigger, AlignmentApplyRequest, AlignmentApplyResult, AlignmentApplyResultItem, AlignmentPlan (+20 more)

### Community 12 - "devDependencies"
Cohesion: 0.06
Nodes (34): devDependencies, autoprefixer, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, postcss (+26 more)

### Community 13 - "ThemeToggle.tsx"
Cohesion: 0.13
Nodes (25): DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuShortcut(), DropdownMenuSubContent (+17 more)

### Community 14 - "Routes.tsx"
Cohesion: 0.06
Nodes (29): Sidebar, AccountActivation, AddAzure, AddGithub, AddGitlab, AddMicrofrontend, AddStorage, ApiKeys (+21 more)

### Community 15 - "auth"
Cohesion: 0.06
Nodes (34): description, success, title, auth, account_activation, already_have_account, confirm_password, create_account (+26 more)

### Community 16 - "auth"
Cohesion: 0.06
Nodes (34): description, success, title, auth, account_activation, already_have_account, confirm_password, create_account (+26 more)

### Community 17 - "EnvironmentList.tsx"
Cohesion: 0.11
Nodes (21): CreateEnvironmentDTO, EnvironmentDTO, useEnvironmentsApi(), moveItem(), useDragAndDropOrder(), UseDragAndDropOrderProps, EnvironmentDialog(), EnvironmentList() (+13 more)

### Community 18 - "useToastNotificationStore.ts"
Cohesion: 0.13
Nodes (18): ColorPickerCustomProps, DialogContent, DialogDescription, DialogFooter(), DialogHeader(), DialogOverlay, DialogTitle, GlobalVariableCreateDTO (+10 more)

### Community 19 - "card.tsx"
Cohesion: 0.23
Nodes (16): SinglePageHeaderProps, Card, CardContent, DeleteConfirmationDialog(), DeleteConfirmationDialogProps, Table, TableBody, TableCaption (+8 more)

### Community 20 - "integration"
Cohesion: 0.07
Nodes (28): description, step2, title, description, javascript_description, javascript_direct_api_access, javascript_direct_api_access_description, javascript_example (+20 more)

### Community 21 - "integration"
Cohesion: 0.07
Nodes (28): description, step2, title, description, javascript_description, javascript_direct_api_access, javascript_direct_api_access_description, javascript_example (+20 more)

### Community 22 - "DangerZoneRemoveMicrofrontend.tsx"
Cohesion: 0.15
Nodes (15): Alert, AlertDescription, AlertTitle, alertVariants, CardDescription, CardHeader, CardTitle, CodeRepositoryType (+7 more)

### Community 23 - "common"
Cohesion: 0.07
Nodes (27): common, actions, active, add, back, cancel, close, configuration (+19 more)

### Community 24 - "common"
Cohesion: 0.07
Nodes (27): common, actions, active, add, back, cancel, close, configuration (+19 more)

### Community 25 - "AuthenticationLayout.tsx"
Cohesion: 0.11
Nodes (16): AuthenticationLayout(), AuthenticationLayoutProps, sizeClasses, MainLogo(), MainLogoProps, sizeClasses, Spinner(), SpinnerProps (+8 more)

### Community 26 - "deployments"
Cohesion: 0.08
Nodes (25): redeploy, view_canary_users, columns, coming_soon, coming_soon_description, no_users, subtitle, title (+17 more)

### Community 27 - "deployments"
Cohesion: 0.08
Nodes (25): redeploy, view_canary_users, columns, coming_soon, coming_soon_description, no_users, subtitle, title (+17 more)

### Community 28 - "useApiClient.tsx"
Cohesion: 0.12
Nodes (21): createUrl(), doRequest(), getUTMFields(), IClientRequestData, IClientRequestMetadata, IUTMFields, out, removeUTMFields() (+13 more)

### Community 29 - "index.ts"
Cohesion: 0.18
Nodes (14): FormValues, LoginComponentProps, LoginPage(), LoginWithAuth0Button(), LoginWithGoogleButton(), LoginWithMicrosoftButton(), SocialLoginRowProps, getAccessToken() (+6 more)

### Community 30 - "Microfrontends.tsx"
Cohesion: 0.14
Nodes (13): TabsContent, TabsList, tabsListVariants, TabsTrigger, Tabs, TabsContext, TabsProps, InjectRemotesInHostParams (+5 more)

### Community 31 - "FirstStartupWrapper.tsx"
Cohesion: 0.15
Nodes (18): Auth0AuthWrapper(), Auth0AuthWrapperProps, SocialLoginRow(), GoogleAuthWrapper(), MicrosoftAuthWrapper(), MicrosoftAuthWrapperProps, GlobalParameterContext, IGlobalParametersContext (+10 more)

### Community 32 - "useUserApi.ts"
Cohesion: 0.14
Nodes (17): AuthenticationType, AcceptInvitationDTO, AcceptInvitationResponse, InvitationInfo, useInvitationApi(), AuthResponse, ResetPasswordDataDTO, ResetPasswordRequestDTO (+9 more)

### Community 33 - "ApiStatusHandler"
Cohesion: 0.19
Nodes (12): ApiStatusHandler(), CanaryUser, useCanaryUsersApi(), CanaryUser, useDeploymentsApi(), CanaryUsers(), Deployments(), Integration() (+4 more)

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
Cohesion: 0.16
Nodes (18): useCodeRepositoriesApi(), useGlobalVariablesApi(), useMicrofrontendsApi(), AddAzureRepositoryPage(), AddGitHubRepositoryPage(), AddGitlabRepositoryPage(), EnvironmentVariablesPageInner(), EnvironmentVariableDialog() (+10 more)

### Community 41 - "CreateApiKeyDialog.tsx"
Cohesion: 0.14
Nodes (12): ApiKey, CreateApiKeyDTO, CreateApiKeyResponseDTO, useApiKeysApi(), ApiKeys(), CreateApiKeyDialog(), CreateApiKeyDialogProps, ApiKeyFormData (+4 more)

### Community 42 - "AddMicrofrontend.tsx"
Cohesion: 0.16
Nodes (14): ICodeRepository, Repository, Storage, AddNewMicrofrontendFormProps, AddNewMicrofrontendPageProps, formSchema, FormValues, CodeRepositorySection() (+6 more)

### Community 43 - "components.json"
Cohesion: 0.12
Nodes (16): aliases, components, hooks, lib, ui, utils, rsc, $schema (+8 more)

### Community 44 - "environment"
Cohesion: 0.12
Nodes (17): environment, color, color_tooltip, configure, create_success, created_success_message, custom_environments, delete_title (+9 more)

### Community 45 - "environmentVariables"
Cohesion: 0.12
Nodes (17): environmentVariables, actions, addVariable, confirmDeleteDescription, confirmDeleteTitle, created_success, deleteConfirmation, deleted_success (+9 more)

### Community 46 - "SelectField.rhf.tsx"
Cohesion: 0.15
Nodes (7): SelectFieldProps, SwitchCustomProps, TextareaChipsFieldProps, TextFieldProps, Label, labelVariants, Switch

### Community 47 - "useCodeRepositoriesApi.ts"
Cohesion: 0.13
Nodes (15): AddRepositoryAzureDTO, AddRepositoryGithubDTO, AddRepositoryGitlabDTO, AzureDevOpsProject, AzureDevOpsProjectsResponse, CodeRepositoryProvider, GithubOrganization, GithubUser (+7 more)

### Community 48 - "App.tsx"
Cohesion: 0.18
Nodes (9): App(), queryClient, InitialThemeWrapper(), Notification(), SentryInit(), themeEnumToClassName, ThemeHandler(), getLanguageFromLocalStorage() (+1 more)

### Community 49 - "ProjectUsers.tsx"
Cohesion: 0.24
Nodes (11): Avatar, AvatarFallback, AvatarImage, ProjectUser, useProjectUserApi(), gravatarHash(), UserPicture(), getUserFullName() (+3 more)

### Community 50 - "AddStorage.tsx"
Cohesion: 0.17
Nodes (13): AzureAuthConfig, AzureStorageConfig, CreateStorageDTO, GoogleAuthConfig, GoogleStorageConfig, IStorageAuth, S3ClientConfig, StorageType (+5 more)

### Community 51 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, isolatedModules, lib, module, moduleDetection, moduleResolution, noEmit (+7 more)

### Community 52 - "environment"
Cohesion: 0.13
Nodes (15): environment, add_environment, color, color_tooltip, configure, create_success, created_success_message, custom_environments (+7 more)

### Community 53 - "environmentVariables"
Cohesion: 0.13
Nodes (15): environmentVariables, actions, addVariable, created_success, deleteConfirmation, deleted_success, deleteVariable, editVariable (+7 more)

### Community 54 - "useServeApi.ts"
Cohesion: 0.19
Nodes (11): DeploymentDTO, EnvironmentValue, GlobalVariable, GlobalVariableUpdateDTO, ICodeIntegrationDTO, ICodeIntegrationRequestDTO, IServe, IServeMicrofrontend (+3 more)

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

### Community 60 - "form.tsx"
Cohesion: 0.18
Nodes (9): FormControl, FormDescription, FormFieldContext, FormFieldContextValue, FormItem, FormItemContext, FormItemContextValue, FormLabel (+1 more)

### Community 61 - "Dependencies.tsx"
Cohesion: 0.27
Nodes (9): useDependenciesApi(), Dependencies(), SummaryCardProps, toDefaultBranches(), AlignPeerDependenciesDialog(), DependencyAlignmentTable(), isOutdated(), KIND_ORDER (+1 more)

### Community 62 - "project_invitation"
Cohesion: 0.20
Nodes (10): project_invitation, accept, accepted, description, error_description, error_title, go_to_login, not_found_description (+2 more)

### Community 63 - "project_invitation"
Cohesion: 0.20
Nodes (10): project_invitation, accept, accepted, description, error_description, error_title, go_to_login, not_found_description (+2 more)

### Community 64 - "platform.json"
Cohesion: 0.22
Nodes (8): color_picker, select_color, language, change, english, italian, validation, required

### Community 65 - "page"
Cohesion: 0.22
Nodes (9): confirmation, title, page, actions, color, delete, description, new_environment (+1 more)

### Community 66 - "delete"
Cohesion: 0.32
Nodes (8): delete, subtitle, title, button, description, success, dangerZone, dangerZone

### Community 67 - "dialog"
Cohesion: 0.25
Nodes (8): dialog, confirmation, confirmationText, confirmButton, deleting, description, title, warning

### Community 68 - "settings"
Cohesion: 0.25
Nodes (8): projectDeleted, projectNameUpdated, projectNameUpdateFailed, settings, account, notifications, subtitle, title

### Community 69 - "stats"
Cohesion: 0.25
Nodes (8): stats, apiKeys, codeRepositories, environments, storages, teamMembers, title, viewAll

### Community 70 - "EnvironmentVariableForm.tsx"
Cohesion: 0.25
Nodes (5): EnvironmentValue, environmentValueSchema, EnvironmentVariableFormProps, formSchema, FormValues

### Community 71 - "card"
Cohesion: 0.29
Nodes (7): build, canary, repository, storage, users, version, card

### Community 72 - "clone"
Cohesion: 0.29
Nodes (7): button, description, https, ssh, title, vscode, clone

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

### Community 78 - "TextField.rhf.tsx"
Cohesion: 0.47
Nodes (3): TextFieldProps, Input, InputProps

### Community 79 - "app"
Cohesion: 0.40
Nodes (5): app, error, name, generic, not_found

### Community 80 - "projectInfo"
Cohesion: 0.40
Nodes (5): id, name, slug, title, projectInfo

### Community 81 - "theme"
Cohesion: 0.40
Nodes (5): theme, dark, light, system, toggle_theme

### Community 82 - "app"
Cohesion: 0.40
Nodes (5): app, error, name, generic, not_found

### Community 83 - "react"
Cohesion: 0.50
Nodes (3): react, useFormField(), useIsMobile()

### Community 84 - "form"
Cohesion: 0.50
Nodes (4): form, environment_values, key, value_placeholder

### Community 85 - "hostTypes"
Cohesion: 0.50
Nodes (4): customSource, customUrl, mfeOrchestratorHub, hostTypes

### Community 86 - "form"
Cohesion: 0.50
Nodes (4): form, environment_values, key, value_placeholder

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
- **1238 isolated node(s):** `$schema`, `style`, `rsc`, `tsx`, `config` (+1233 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `react`, `devDependencies`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Why does `react` connect `react` to `card.tsx`, `dependencies`, `ThemeToggle.tsx`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Why does `microfrontend` connect `microfrontend` to `platform.json`, `delete`, `dashboard`, `card`, `clone`, `hostTypes`, `build`, `deploymentTypes`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **What connects `$schema`, `style`, `rsc` to the rest of the system?**
  _1238 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `microfrontend` be split into smaller, more focused modules?**
  _Cohesion score 0.02127659574468085 - nodes in this community are weakly interconnected._
- **Should `cn` be split into smaller, more focused modules?**
  _Cohesion score 0.053554040895813046 - nodes in this community are weakly interconnected._
- **Should `microfrontend` be split into smaller, more focused modules?**
  _Cohesion score 0.025974025974025976 - nodes in this community are weakly interconnected._