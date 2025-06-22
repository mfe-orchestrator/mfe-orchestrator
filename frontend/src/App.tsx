
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./authentication/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import Auth0Wrapper from "./authentication/Auth0AuthWrapper";

import RegisterPage from "./pages/auth/RegisterPage";
import DashboardPage from "./pages/dashboard/DashboardPage";
import SftpViewerPage from "./pages/sftp/SftpViewerPage";
import NotFound from "./pages/NotFound";
import PrivateRoute from "./components/auth/PrivateRoute";
import { GlobalParameterProvider } from "./contexts/GlobalParameterProvider";
import MicrosoftAuthWrapper from "./authentication/MicrosoftAuthWrapper";
import GoogleAuthWrapper from "./authentication/GoogleAuthWrapper";

const queryClient = new QueryClient();

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

const App : React.FC=  () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
    <GlobalParameterProvider>
    <ThemeProvider defaultTheme="light">
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <AuthenticationWrapper>      
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/dashboard" element={
                  <PrivateRoute>
                    <DashboardPage />
                  </PrivateRoute>
                } />
                <Route path="/sftp" element={
                  <PrivateRoute>
                    <SftpViewerPage />
                  </PrivateRoute>
                } />
                <Route path="*" element={<NotFound />} />
              </Routes>
              </AuthenticationWrapper>
            </TooltipProvider>
      </ThemeProvider>
    </GlobalParameterProvider>
    </BrowserRouter>
    </QueryClientProvider>
);

export default App;
