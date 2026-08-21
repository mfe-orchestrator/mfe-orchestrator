import { lazy } from "react"
import { Navigate, Route, Routes as RRDRoutes } from "react-router-dom"
import Auth0Wrapper from "./authentication/Auth0AuthWrapper"
import GoogleAuthWrapper from "./authentication/GoogleAuthWrapper"
import MicrosoftAuthWrapper from "./authentication/MicrosoftAuthWrapper"
import RouteWithSuspense from "./components/RouteWithSuspense"
import AuthWrapper from "./theme/AuthWrapper"
import FirstStartupWrapper from "./theme/FirstStartupWrapper"
import MainLayout from "./theme/layout/MainLayout"
import SelectOrganizationWrapper from "./theme/SelectOrganizationWrapper"
import SelectProjectWrapper from "./theme/SelectProjectWrapper"

// Lazy load all page components
const Microfrontends = lazy(() => import("./pages/microfrontends/Microfrontends"))
const AddMicrofrontend = lazy(() => import("./pages/microfrontends/AddMicrofrontend"))
const Dependencies = lazy(() => import("./pages/dependencies/Dependencies"))
const Builds = lazy(() => import("./pages/builds/Builds"))
const Deployments = lazy(() => import("./pages/deployments/Deployments"))
const CanaryUsers = lazy(() => import("./pages/deployments/CanaryUsers"))
const Integration = lazy(() => import("./pages/integration/Integration"))
const Environments = lazy(() => import("./pages/environments/Environments"))
const ProjectUsers = lazy(() => import("./pages/project-users/ProjectUsers"))
const OrganizationUsers = lazy(() => import("./pages/organization-users/OrganizationUsers"))
const Storages = lazy(() => import("./pages/storages/Storages"))
const AddStorage = lazy(() => import("./pages/storages/AddStorage"))
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

const AuthenticationWrapper: React.FC<React.PropsWithChildren> = ({ children }) => {
    return (
        <GoogleAuthWrapper>
            <MicrosoftAuthWrapper>
                <Auth0Wrapper>
                    <AuthWrapper>
                        {/* The organization is settled first: it is what scopes the project list underneath. */}
                        <SelectOrganizationWrapper>
                            <SelectProjectWrapper>{children}</SelectProjectWrapper>
                        </SelectOrganizationWrapper>
                    </AuthWrapper>
                </Auth0Wrapper>
            </MicrosoftAuthWrapper>
        </GoogleAuthWrapper>
    )
}

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
                <Route path="/microfrontends" element={<RouteWithSuspense element={<Microfrontends />} />} />
                <Route path="/microfrontend/new" element={<RouteWithSuspense element={<AddMicrofrontend />} />} />
                <Route path="/microfrontend/:id" element={<RouteWithSuspense element={<AddMicrofrontend />} />} />
                <Route path="/dependencies" element={<RouteWithSuspense element={<Dependencies />} />} />
                <Route path="/builds" element={<RouteWithSuspense element={<Builds />} />} />
                <Route path="/deployments">
                    <Route index element={<RouteWithSuspense element={<Deployments />} />} />
                    <Route path=":deploymentId/canary-users" element={<RouteWithSuspense element={<CanaryUsers />} />} />
                </Route>
                <Route path="/integration" element={<RouteWithSuspense element={<Integration />} />} />
                <Route path="/project-users" element={<RouteWithSuspense element={<ProjectUsers />} />} />
                <Route path="/organization" element={<RouteWithSuspense element={<OrganizationUsers />} />} />
                {/* La pagina stava qui: i link e i preferiti che puntano al vecchio percorso restano validi. */}
                <Route path="/organization-users" element={<Navigate to="/organization" replace />} />
                <Route path="/storages" element={<RouteWithSuspense element={<Storages />} />} />
                <Route path="/storages/new" element={<RouteWithSuspense element={<AddStorage />} />} />
                <Route path="/storages/:id" element={<RouteWithSuspense element={<AddStorage />} />} />
                <Route path="/api-keys" element={<RouteWithSuspense element={<ApiKeys />} />} />
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
                <Route path="/" element={<Navigate to="/microfrontends" replace />} />
                <Route path="*" element={<PrivateRoutes />} />
            </RRDRoutes>
        </FirstStartupWrapper>
    )
}

export default Routes
