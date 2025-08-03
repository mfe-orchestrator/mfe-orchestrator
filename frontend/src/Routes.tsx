import { Suspense, lazy } from "react";
import { Navigate, Route, Routes as RRDRoutes } from "react-router-dom";
import Auth0Wrapper from "./authentication/Auth0AuthWrapper";
import MicrosoftAuthWrapper from "./authentication/MicrosoftAuthWrapper";
import GoogleAuthWrapper from "./authentication/GoogleAuthWrapper";
import Spinner from "./components/Spinner";
import SelectProjectWrapper from "./theme/SelectProjectWrapper";
import FirstStartupWrapper from "./theme/FirstStartupWrapper";
import AuthWrapper from "./theme/AuthWrapper";
import MainLayout from "./components/layout/MainLayout";


// Lazy load all page components
const IntegrationPage = lazy(() => import("./pages/IntegrationPage"));
const AccountActivation = lazy(() => import("./pages/auth/AccountActivation"));
const RegisterPage = lazy(() => import("./pages/auth/RegisterPage"));
const DashboardPage = lazy(() => import("./pages/dashboard/DashboardPage"));
const SftpViewerPage = lazy(() => import("./pages/sftp/SftpViewerPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ResetPasswordRequestPage = lazy(() => import("./pages/auth/ResetPasswordRequestPage"));
const ResetPasswordPage = lazy(() => import("./pages/auth/ResetPasswordPage"));
const AddNewMicrofrontendPage = lazy(() => import("./pages/microfrontend/AddNewMicrofrontendPage"));

const AuthenticationWrapper : React.FC<React.PropsWithChildren> = ({children}) =>{

    return (
      <GoogleAuthWrapper>
        <MicrosoftAuthWrapper>
          <Auth0Wrapper>
            <FirstStartupWrapper>
              <AuthWrapper>
                <SelectProjectWrapper>
                  {children}
                </SelectProjectWrapper>
              </AuthWrapper>
            </FirstStartupWrapper>
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
                    path="/dashboard" 
                    element={
                      <RouteWithSuspense element={<DashboardPage />} />
                    } 
                  />
                  <Route 
                    path="/microfronted/new" 
                    element={
                      <RouteWithSuspense element={<AddNewMicrofrontendPage />} />
                    } 
                  />
                  <Route 
                    path="/microfronted/:id" 
                    element={
                      <RouteWithSuspense element={<AddNewMicrofrontendPage />} />
                    } 
                  />
                  <Route 
                    path="/sftp" 
                    element={
                      <RouteWithSuspense element={<SftpViewerPage />} />
                    } 
                  />
                  <Route 
                    path="/integration" 
                    element={
                      <RouteWithSuspense element={<IntegrationPage />} />
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
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<PrivateRoutes />} />
        </RRDRoutes>
    );
}

export default Routes;