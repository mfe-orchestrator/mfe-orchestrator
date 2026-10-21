import { lazy } from "react"
import { Navigate, Route, Routes as RRDRoutes } from "react-router-dom"
import Auth0Wrapper from "./authentication/Auth0AuthWrapper"
import GoogleAuthWrapper from "./authentication/GoogleAuthWrapper"
import MicrosoftAuthWrapper from "./authentication/MicrosoftAuthWrapper"
import { ASSISTANT_PAGE_PATH } from "./components/assistant/AssistantPanel"
import RouteWithSuspense from "./components/RouteWithSuspense"
import { readOAuthResume } from "./pages/oauth/oauthResume"
import AuthWrapper from "./theme/AuthWrapper"
import FirstStartupWrapper from "./theme/FirstStartupWrapper"
import MainLayout from "./theme/layout/MainLayout"
import SelectOrganizationWrapper from "./theme/SelectOrganizationWrapper"
import SelectProjectWrapper from "./theme/SelectProjectWrapper"

// Lazy load all page components
const AssistantPage = lazy(() => import("./pages/assistant/AssistantPage"))
const Domains = lazy(() => import("./pages/domains/Domains"))
const DomainDetail = lazy(() => import("./pages/domains/DomainDetail"))
const DomainAiWorkspace = lazy(() => import("./pages/domains/DomainAiWorkspace"))
const DomainDeploymentsMatrix = lazy(() => import("./pages/domains/DomainDeploymentsMatrix"))
const Microfrontends = lazy(() => import("./pages/microfrontends/Microfrontends"))
const AddMicrofrontend = lazy(() => import("./pages/microfrontends/AddMicrofrontend"))
const MicrofrontendAiWorkspace = lazy(() => import("./pages/microfrontends/MicrofrontendAiWorkspace"))
const Services = lazy(() => import("./pages/services/Services"))
const AddService = lazy(() => import("./pages/services/AddService"))
const ServiceDetail = lazy(() => import("./pages/services/ServiceDetail"))
const VariableMaps = lazy(() => import("./pages/variable-maps/VariableMaps"))
const VariableMapForm = lazy(() => import("./pages/variable-maps/VariableMapForm"))
const Dependencies = lazy(() => import("./pages/dependencies/Dependencies"))
const Builds = lazy(() => import("./pages/builds/Builds"))
const Deployments = lazy(() => import("./pages/deployments/Deployments"))
const CanaryUsers = lazy(() => import("./pages/deployments/CanaryUsers"))
const Integration = lazy(() => import("./pages/integration/Integration"))
const Environments = lazy(() => import("./pages/environments/Environments"))
const ProjectUsers = lazy(() => import("./pages/project-users/ProjectUsers"))
const OrganizationSettings = lazy(() => import("./pages/organization/OrganizationSettings"))
const Storages = lazy(() => import("./pages/storages/Storages"))
const AddStorage = lazy(() => import("./pages/storages/AddStorage"))
const Databases = lazy(() => import("./pages/databases/Databases"))
const AddDatabase = lazy(() => import("./pages/databases/AddDatabase"))
const McpClients = lazy(() => import("./pages/mcp-clients/McpClients"))
const OAuthConsent = lazy(() => import("./pages/oauth/OAuthConsent"))
const OAuthError = lazy(() => import("./pages/oauth/OAuthError"))
const ApiKeys = lazy(() => import("./pages/api-keys/ApiKeys"))
const EnvironmentVariables = lazy(() => import("./pages/environment-variables/EnvironmentVariables"))
const CodeRepositories = lazy(() => import("./pages/code-repositories/CodeRepositories"))
const AddAzure = lazy(() => import("./pages/code-repositories/AddAzure"))
const AddGitlab = lazy(() => import("./pages/code-repositories/AddGitlab"))
const AddGithub = lazy(() => import("./pages/code-repositories/AddGitHub"))
const GitHubCallbackPage = lazy(() => import("./pages/code-repositories/GitHubCallbackPage"))
const TemplatesLibrary = lazy(() => import("./pages/templates-library/TemplatesLibrary"))
const NotFound = lazy(() => import("./pages/error/NotFound"))
const Settings = lazy(() => import("./pages/settings/Settings"))
const Profile = lazy(() => import("./pages/profile/Profile"))
const NewProjectWizard = lazy(() => import("./pages/new-project-wizard/NewProjectWizard"))

const AccountActivation = lazy(() => import("./pages/auth/AccountActivation"))
const ProjectInvitation = lazy(() => import("./pages/auth/ProjectInvitation"))
const OrganizationInvitation = lazy(() => import("./pages/auth/OrganizationInvitation"))
const SignUp = lazy(() => import("./pages/auth/SignUp"))
const ResetPasswordRequest = lazy(() => import("./pages/auth/ResetPasswordRequest"))
const ResetPassword = lazy(() => import("./pages/auth/ResetPassword"))

const LoginOnlyWrapper: React.FC<React.PropsWithChildren> = ({ children }) => {
    return (
        <GoogleAuthWrapper>
            <MicrosoftAuthWrapper>
                <Auth0Wrapper>
                    <AuthWrapper>{children}</AuthWrapper>
                </Auth0Wrapper>
            </MicrosoftAuthWrapper>
        </GoogleAuthWrapper>
    )
}

const AuthenticationWrapper: React.FC<React.PropsWithChildren> = ({ children }) => {
    return (
        <LoginOnlyWrapper>
            {/* The organization is settled first: it is what scopes the project list underneath. */}
            <SelectOrganizationWrapper>
                <SelectProjectWrapper>{children}</SelectProjectWrapper>
            </SelectOrganizationWrapper>
        </LoginOnlyWrapper>
    )
}

/**
 * The consent screen picks its own project, so it must not wait for the console's organization/project selection.
 *
 * Mounted under "/oauth/*": these paths are matched against what is left after that prefix, so
 * they must stay relative. "/oauth/consent" here would match nothing and leave a blank page.
 */
const OAuthRoutes: React.FC = () => {
    return (
        <LoginOnlyWrapper>
            <RRDRoutes>
                <Route path="consent" element={<RouteWithSuspense element={<OAuthConsent />} />} />
                <Route path="error" element={<RouteWithSuspense element={<OAuthError />} />} />
            </RRDRoutes>
        </LoginOnlyWrapper>
    )
}

/**
 * The console opens on the AI agent; without an AI provider its page sends on to /microfrontends.
 * Safety net: a login that lands on "/" instead of the consent page resumes the pending consent.
 */
const RootRedirect: React.FC = () => <Navigate to={readOAuthResume() ?? ASSISTANT_PAGE_PATH} replace />

const PrivateRoutes: React.FC = () => {
    return (
        <AuthenticationWrapper>
            <RRDRoutes>
                <Route path="/project-wizard/:projectId?/*" element={<RouteWithSuspense element={<NewProjectWizard mountPoint="/project-wizard" />} />} />
                <Route path="*" element={<RouteWithSuspense element={<PrivateProjectRoutes />} />} />
            </RRDRoutes>
        </AuthenticationWrapper>
    )
}

const PrivateProjectRoutes: React.FC = () => {
    return (
        <MainLayout>
            <RRDRoutes>
                <Route path="/assistant" element={<RouteWithSuspense element={<AssistantPage />} />} />
                <Route path="/domains" element={<RouteWithSuspense element={<Domains />} />} />
                <Route path="/domains/deployments" element={<RouteWithSuspense element={<DomainDeploymentsMatrix />} />} />
                <Route path="/domain/:id" element={<RouteWithSuspense element={<DomainAiWorkspace />} />} />
                <Route path="/domain/:id/ai" element={<RouteWithSuspense element={<DomainAiWorkspace />} />} />
                <Route path="/domain/:id/structure" element={<RouteWithSuspense element={<DomainDetail />} />} />
                <Route path="/microfrontends" element={<RouteWithSuspense element={<Microfrontends />} />} />
                <Route path="/microfrontend/new" element={<RouteWithSuspense element={<AddMicrofrontend />} />} />
                <Route path="/microfrontend/:id" element={<RouteWithSuspense element={<MicrofrontendAiWorkspace />} />} />
                <Route path="/microfrontend/:id/settings" element={<RouteWithSuspense element={<AddMicrofrontend />} />} />
                <Route path="/services" element={<RouteWithSuspense element={<Services />} />} />
                <Route path="/service/new" element={<RouteWithSuspense element={<AddService />} />} />
                <Route path="/service/:id" element={<RouteWithSuspense element={<ServiceDetail view="ai" />} />} />
                <Route path="/service/:id/ai" element={<RouteWithSuspense element={<ServiceDetail view="ai" />} />} />
                <Route path="/service/:id/overview" element={<RouteWithSuspense element={<ServiceDetail />} />} />
                <Route path="/service/:id/settings" element={<RouteWithSuspense element={<AddService />} />} />
                <Route path="/config-maps" element={<RouteWithSuspense element={<VariableMaps kind="configMap" />} />} />
                <Route path="/config-map/:id" element={<RouteWithSuspense element={<VariableMapForm kind="configMap" />} />} />
                <Route path="/secrets" element={<RouteWithSuspense element={<VariableMaps kind="secret" />} />} />
                <Route path="/secret/:id" element={<RouteWithSuspense element={<VariableMapForm kind="secret" />} />} />
                <Route path="/dependencies" element={<RouteWithSuspense element={<Dependencies />} />} />
                <Route path="/builds" element={<RouteWithSuspense element={<Builds />} />} />
                <Route path="/deployments">
                    <Route index element={<RouteWithSuspense element={<Deployments />} />} />
                    <Route path=":deploymentId/canary-users" element={<RouteWithSuspense element={<CanaryUsers />} />} />
                </Route>
                <Route path="/integration" element={<RouteWithSuspense element={<Integration />} />} />
                <Route path="/project-users" element={<RouteWithSuspense element={<ProjectUsers />} />} />
                <Route path="/organization" element={<RouteWithSuspense element={<OrganizationSettings />} />} />
                {/* La pagina stava qui: i link e i preferiti che puntano al vecchio percorso restano validi. */}
                <Route path="/organization-users" element={<Navigate to="/organization?tab=members" replace />} />
                <Route path="/storages" element={<RouteWithSuspense element={<Storages />} />} />
                <Route path="/storages/new" element={<RouteWithSuspense element={<AddStorage />} />} />
                <Route path="/storages/:id" element={<RouteWithSuspense element={<AddStorage />} />} />
                <Route path="/databases" element={<RouteWithSuspense element={<Databases />} />} />
                <Route path="/databases/new" element={<RouteWithSuspense element={<AddDatabase />} />} />
                <Route path="/databases/:id" element={<RouteWithSuspense element={<AddDatabase />} />} />
                <Route path="/api-keys" element={<RouteWithSuspense element={<ApiKeys />} />} />
                <Route path="/mcp-clients" element={<RouteWithSuspense element={<McpClients />} />} />
                <Route path="/settings" element={<RouteWithSuspense element={<Settings />} />} />
                <Route path="/profile" element={<RouteWithSuspense element={<Profile />} />} />
                <Route path="/environments" element={<RouteWithSuspense element={<Environments />} />} />
                <Route path="/environment-variables" element={<RouteWithSuspense element={<EnvironmentVariables />} />} />
                <Route path="/code-repositories" element={<RouteWithSuspense element={<CodeRepositories />} />} />
                <Route path="/code-repositories/callback/github" element={<RouteWithSuspense element={<GitHubCallbackPage />} />} />
                <Route path="/code-repositories/azure" element={<RouteWithSuspense element={<AddAzure />} />} />
                <Route path="/code-repositories/azure/:id" element={<RouteWithSuspense element={<AddAzure />} />} />
                <Route path="/code-repositories/gitlab" element={<RouteWithSuspense element={<AddGitlab />} />} />
                <Route path="/code-repositories/gitlab/:id" element={<RouteWithSuspense element={<AddGitlab />} />} />
                <Route path="/code-repositories/github/:id" element={<RouteWithSuspense element={<AddGithub />} />} />
                <Route path="/templates-library" element={<RouteWithSuspense element={<TemplatesLibrary />} />} />
                <Route path="*" element={<RouteWithSuspense element={<NotFound />} />} />
            </RRDRoutes>
        </MainLayout>
    )
}

const Routes: React.FC = () => {
    return (
        <FirstStartupWrapper>
            <RRDRoutes>
                <Route path="/register" element={<RouteWithSuspense element={<SignUp />} />} />
                <Route path="/reset-password-request" element={<RouteWithSuspense element={<ResetPasswordRequest />} />} />
                <Route path="/reset-password/:token" element={<RouteWithSuspense element={<ResetPassword />} />} />
                <Route path="/account-activation/:token" element={<RouteWithSuspense element={<AccountActivation />} />} />
                <Route path="/project-invitation/:token" element={<RouteWithSuspense element={<ProjectInvitation />} />} />
                <Route path="/organization-invitation/:token" element={<RouteWithSuspense element={<OrganizationInvitation />} />} />
                <Route path="/oauth/*" element={<OAuthRoutes />} />
                <Route path="/" element={<RootRedirect />} />
                <Route path="*" element={<PrivateRoutes />} />
            </RRDRoutes>
        </FirstStartupWrapper>
    )
}

export default Routes
