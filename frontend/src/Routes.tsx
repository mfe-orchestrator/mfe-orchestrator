import { Suspense, lazy } from "react";
import { Navigate, Route, Routes as RRDRoutes } from "react-router-dom";
import { AuthProvider } from "./authentication/AuthContext";

import Auth0Wrapper from "./authentication/Auth0AuthWrapper";

import MicrosoftAuthWrapper from "./authentication/MicrosoftAuthWrapper";
import GoogleAuthWrapper from "./authentication/GoogleAuthWrapper";
import Spinner from "./components/Spinner";

// Lazy load all page components
const RegisterPage = lazy(() => import("./pages/auth/RegisterPage"));
const DashboardPage = lazy(() => import("./pages/dashboard/DashboardPage"));
const SftpViewerPage = lazy(() => import("./pages/sftp/SftpViewerPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ResetPasswordRequestPage = lazy(() => import("./pages/auth/ResetPasswordRequestPage"));
const ResetPasswordPage = lazy(() => import("./pages/auth/ResetPasswordPage"));

const AuthenticationWrapper : React.FC<React.PropsWithChildren> = ({children}) =>{

    return (
      <GoogleAuthWrapper>
        <MicrosoftAuthWrapper>
          <Auth0Wrapper>
            <AuthProvider>
              {children}
            </AuthProvider>
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
            <RRDRoutes>
                <Route 
                  path="/dashboard" 
                  element={
                    <RouteWithSuspense element={<DashboardPage />} />
                  } 
                />
                <Route 
                  path="/sftp" 
                  element={
                    <RouteWithSuspense element={<SftpViewerPage />} />
                  } 
                />
                <Route 
                  path="*" 
                  element={
                    <RouteWithSuspense element={<NotFound />} />
                  } 
                />
            </RRDRoutes>
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
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<PrivateRoutes />} />
        </RRDRoutes>
    );
}

export default Routes;