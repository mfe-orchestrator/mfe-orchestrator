
import { Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "./contexts/ThemeContext";
import { GlobalParameterProvider } from "./contexts/GlobalParameterProvider";
import Routes from "./Routes";
import { HelmetProvider } from "react-helmet-async";
import { I18nextProvider } from 'react-i18next';
import i18n from './i18n';
import Spinner from './components/Spinner';

const queryClient = new QueryClient();

const App: React.FC = () => (
  <Suspense fallback={<Spinner />}>
    <I18nextProvider i18n={i18n}>
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <GlobalParameterProvider>
              <ThemeProvider defaultTheme="light">
                <TooltipProvider>
                  <Toaster />
                  <Sonner />
                  <Routes />
                </TooltipProvider>
              </ThemeProvider>
            </GlobalParameterProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </HelmetProvider>
    </I18nextProvider>
  </Suspense>
);

export default App;
