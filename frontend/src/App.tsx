
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "./contexts/ThemeContext";
import { GlobalParameterProvider } from "./contexts/GlobalParameterProvider";
import Routes from "./Routes";
const queryClient = new QueryClient();



const App : React.FC=  () => (
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
);

export default App;
