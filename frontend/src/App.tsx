
import { Suspense } from 'react';
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { GlobalParameterProvider } from "./contexts/GlobalParameterProvider";
import Routes from "./Routes";
import { HelmetProvider } from "react-helmet-async";
import { I18nextProvider } from 'react-i18next';
import i18n from './i18n';
import Spinner from './components/Spinner';
import Notification from './theme/Notification';
import ThemeHandler from './theme/ThemeHandler';
import InitialThemeWrapper from './theme/InitialThemeWrapper';

const queryClient = new QueryClient();

const App: React.FC = () => (
  <Suspense fallback={<Spinner />}>
    <I18nextProvider i18n={i18n}>
      <InitialThemeWrapper>
        <HelmetProvider>
          <ThemeHandler />
          <QueryClientProvider client={queryClient}>
            <BrowserRouter>
              <GlobalParameterProvider>
                <TooltipProvider>
                  <Notification />
                  <Routes />
                </TooltipProvider>
              </GlobalParameterProvider>
            </BrowserRouter>
          </QueryClientProvider>
        </HelmetProvider>
      </InitialThemeWrapper>
    </I18nextProvider>

  </Suspense>
);

export default App;
