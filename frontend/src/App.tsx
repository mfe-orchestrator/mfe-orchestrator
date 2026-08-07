import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React, { Suspense } from "react"
import { HelmetProvider } from "react-helmet-async"
import { I18nextProvider } from "react-i18next"
import { BrowserRouter } from "react-router-dom"
import { TooltipProvider } from "@/components/ui/tooltip"
import Spinner from "./components/Spinner"
import { GlobalParameterProvider } from "./contexts/GlobalParameterProvider"
import i18n from "./i18n"
import Routes from "./Routes"
import InitialThemeWrapper from "./theme/InitialThemeWrapper"
import Notification from "./theme/Notification"
import SentryInit from "./theme/SentryInit"
import ThemeHandler from "./theme/ThemeHandler"

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            refetchOnWindowFocus: false
        }
    }
})

const App: React.FC = () => (
    <SentryInit>
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
    </SentryInit>
)

export default App
