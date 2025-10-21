import { Suspense, lazy } from "react";
import { Navigate, Route, Routes as RRDRoutes } from "react-router-dom";
import Auth0Wrapper from "./authentication/Auth0AuthWrapper";
import MicrosoftAuthWrapper from "./authentication/MicrosoftAuthWrapper";
import GoogleAuthWrapper from "./authentication/GoogleAuthWrapper";
import Spinner from "./components/Spinner";
import SelectProjectWrapper from "./theme/SelectProjectWrapper";
import FirstStartupWrapper from "./theme/FirstStartupWrapper";
import AuthWrapper from "./theme/AuthWrapper";
import MainLayout from "./theme/layout/MainLayout";


// Lazy load all page components
const IntegrationPage = lazy(() => import("./pages/integration/IntegrationPage"))
const ProjectUsersListPage = lazy(() => import("./pages/project-users/ProjectUsersListPage"));
const StoragesPage = lazy(() => import("./pages/storages/StoragesPage"));
const AccountActivation = lazy(() => import("./pages/auth/AccountActivation"));
const RegisterPage = lazy(() => import("./pages/auth/RegisterPage"));
const DashboardPage = lazy(() => import("./pages/microfrontend/MicrofrontendDashboard"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ResetPasswordRequestPage = lazy(() => import("./pages/auth/ResetPasswordRequestPage"));
const ResetPasswordPage = lazy(() => import("./pages/auth/ResetPasswordPage"));
const AddNewMicrofrontendPage = lazy(() => import("./pages/microfrontend/AddNewMicrofrontendPage"));
const DeploymentsPage = lazy(() => import("./pages/deployments/DeploymentDashboard"));
const CanaryUsersPage = lazy(() => import("./pages/deployments/CanaryUsers"));
const ApiKeysPage = lazy(() => import("./pages/api-keys/ApiKeysPage"));
const NewOrEditStoragePage = lazy(() => import("./pages/storages/NewOrEditStoragePage"));
const SettingsPage = lazy(() => import("./pages/settings/SettingsPage"));
const EnvironmentsPage = lazy(() => import("./pages/EnvironmentsPage"));
const EnvironmentVariablesPage = lazy(() => import("./pages/environment-variables/EnvironmentVariablesPage"));
const CodeRepositoryPage = lazy(() => import("./pages/code-repositories/CodeRepositoryPage"));
const GitHubCallbackPage = lazy(() => import("./pages/code-repositories/GitHubCallbackPage"));
const AddAzure = lazy(() => import("./pages/code-repositories/AddAzureRepositoryPage"));
const AddGitlab = lazy(() => import("./pages/code-repositories/AddGitlabRepositoryPage"));
const AddGithub = lazy(() => import("./pages/code-repositories/AddGitHubRepositoryPage"));
const MarketPage = lazy(() => import("./pages/market/MarketPage"));

const AuthenticationWrapper: React.FC<React.PropsWithChildren> = ({ children }) => {

  return (
    <GoogleAuthWrapper>
      <MicrosoftAuthWrapper>
        <Auth0Wrapper>
          <AuthWrapper>
            <SelectProjectWrapper> 
              {children}
            </SelectProjectWrapper>
          </AuthWrapper>
        </Auth0Wrapper>
      </MicrosoftAuthWrapper>
    </GoogleAuthWrapper>
  );
}


const RouteWithSuspense = ({ element: Element }: { element: React.ReactNode }) => (
  <Suspense fallback={<Spinner />}>
    {Element}
  </Suspense>
);

const PrivateRoutes: React.FC = () => {
  return (
    <AuthenticationWrapper>
      <MainLayout>
        <RRDRoutes>
          <Route
            path="/microfrontends"
            element={
              <RouteWithSuspense element={<DashboardPage />} />
            }
          />
          <Route
            path="/microfrontend/new"
            element={
              <RouteWithSuspense element={<AddNewMicrofrontendPage />} />
            }
          />
          <Route
            path="/microfrontend/:id"
            element={
              <RouteWithSuspense element={<AddNewMicrofrontendPage />} />
            }
          />
          <Route path="/deployments">
            <Route
              index
              element={
                <RouteWithSuspense element={<DeploymentsPage />} />
              }
            />
            <Route
              path=":deploymentId/canary-users"
              element={
                <RouteWithSuspense element={<CanaryUsersPage />} />
              }
            />
          </Route>
          <Route
            path="/integration"
            element={
              <RouteWithSuspense element={<IntegrationPage />} />
            }
          />
          <Route
            path="/project-users"
            element={
              <RouteWithSuspense element={<ProjectUsersListPage />} />
            }
          />
          <Route
            path="/storages"
            element={
              <RouteWithSuspense element={<StoragesPage />} />
            }
          />
          <Route
            path="/storages/new"
            element={
              <RouteWithSuspense element={<NewOrEditStoragePage />} />
            }
          />
          <Route
            path="/storages/:id"
            element={
              <RouteWithSuspense element={<NewOrEditStoragePage />} />
            }
          />
          <Route
            path="/api-keys"
            element={
              <RouteWithSuspense element={<ApiKeysPage />} />
            }
          />
          <Route
            path="/settings"
            element={
              <RouteWithSuspense element={<SettingsPage />} />
            }
          />
          <Route
            path="/environments"
            element={
              <RouteWithSuspense element={<EnvironmentsPage />} />
            }
          />
          <Route
            path="/environment-variables"
            element={
              <RouteWithSuspense element={<EnvironmentVariablesPage />} />
            }
          />
          <Route
            path="/code-repositories"
            element={
              <RouteWithSuspense element={<CodeRepositoryPage />} />
            }
          />
          <Route
            path="/code-repositories/callback/github"
            element={
              <RouteWithSuspense element={<GitHubCallbackPage />} />
            }
          />
          <Route
            path="/code-repositories/azure"
            element={
              <RouteWithSuspense element={<AddAzure />} />
            }
          />
          <Route
            path="/code-repositories/azure/:id"
            element={
              <RouteWithSuspense element={<AddAzure />} />
            }
          />
          <Route
            path="/code-repositories/gitlab"
            element={
              <RouteWithSuspense element={<AddGitlab />} />
            }
          />
          <Route
            path="/code-repositories/gitlab/:id"
            element={
              <RouteWithSuspense element={<AddGitlab />} />
            }
          />
          <Route
            path="/code-repositories/github/:id"
            element={
              <RouteWithSuspense element={<AddGithub />} />
            }
          />
          <Route
            path="/templates-library"
            element={
              <RouteWithSuspense element={<MarketPage />} />
            }
          />
          <Route
            path="*"
            element={
              <RouteWithSuspense element={<NotFound />} />
            }
          />
        </RRDRoutes>
      </MainLayout>
    </AuthenticationWrapper>
  );
}

const Routes: React.FC = () => {
  return (
    <FirstStartupWrapper>
      <RRDRoutes>
        <Route
          path="/register"
          element={
            <RouteWithSuspense element={<RegisterPage />} />
          }
        />
        <Route
          path="/reset-password-request"
          element={
            <RouteWithSuspense element={<ResetPasswordRequestPage />} />
          }
        />
        <Route
          path="/reset-password/:token"
          element={
            <RouteWithSuspense element={<ResetPasswordPage />} />
          }
        />
        <Route
          path="/account-activation/:token"
          element={
            <RouteWithSuspense element={<AccountActivation />} />
          }
        />
        <Route path="/" element={<Navigate to="/microfrontends" replace />} />
        <Route path="*" element={<PrivateRoutes />} />
      </RRDRoutes>
    </FirstStartupWrapper>
  );
}

export default Routes;