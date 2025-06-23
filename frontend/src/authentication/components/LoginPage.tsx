
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FormProvider, useForm } from "react-hook-form";
import useUserApi from "@/hooks/apiClients/useUserApi";
import TextField from "@/components/input/TextField.rhf";
import Spinner from "@/components/Spinner";
import { useMutation } from "@tanstack/react-query";
import { useGlobalParameters } from "@/contexts/GlobalParameterProvider";
import MainLogo from "@/components/MainLogo";
import LoginWithGoogleButton from "./LoginWithGoogleButton";
import LoginWithAuth0Button from "./LoginWithAuth0Button";
import LoginWithMicrosoftButton from "./LoginWithMicrosoftButton";
import { useAuth } from "../AuthContext";
import LoginComponentProps from "./LoginComponentProps";
import { setToken } from "../tokenUtils";

interface FormValues {
  email: string;
  password: string;
}

const LoginPage : React.FC<LoginComponentProps> = ({onSuccessLogin}) => {
  const { login } = useUserApi();
  const parameters = useGlobalParameters();
  const form = useForm<FormValues>();
  const auth = useAuth()

  const loginMutation = useMutation({
    mutationFn: login
  })

  const handleLogin = async (values: FormValues) => {
    const loginData = await loginMutation.mutateAsync({
      email: values.email,
      password: values.password
    })
    auth.setUser(loginData.user)
    setToken(loginData.accessToken, "microfronted.orchestrator.hub")
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-background to-muted">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <MainLogo />
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl text-center">Accedi</CardTitle>
            <CardDescription className="text-center">
              Inserisci i tuoi dati per accedere al sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormProvider {...form}>
            <form onSubmit={form.handleSubmit(handleLogin)}>
              <div className="grid gap-4">
                <TextField
                  name="email"
                  label="Email"
                  type="email"
                  autoComplete="email"
                  placeholder="nome@esempio.com"
                  rules={{ required: true }}
                />
                <TextField
                  name="password"
                  label="Password"
                  autoComplete="current-password"
                  type="password"
                  placeholder="••••••••"
                  rules={{ required: true }}
                />
                {/* <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <Link to="/reset-password" className="text-sm text-primary underline-offset-4 hover:underline">
                      Dimenticata?
                    </Link>
                  </div>
                </div> */}
                {loginMutation.isPending ?  
                  <Spinner /> 
                : 
                  <Button type="submit" className="w-full" id="access">
                    Accedi
                  </Button>
                }
              </div>
            </form>
            </FormProvider>
            
            {Object.keys(parameters.getParameter("providers") || {}).length > 0 &&
            <>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">O continua con</span>
                </div>
              </div>
              
              <div className="flex flex-row gap-4">
                {parameters.getParameter("providers.google") &&
                  <LoginWithGoogleButton onSuccessLogin={onSuccessLogin} />
                }
                {parameters.getParameter("providers.auth0") &&
                  <LoginWithAuth0Button onSuccessLogin={onSuccessLogin} />
                }
                {parameters.getParameter("providers.azure") && (
                    <LoginWithMicrosoftButton onSuccessLogin={onSuccessLogin} />
                )}
              </div>
            </>
            }
          </CardContent>
          <CardFooter className="flex justify-center">
            <p className="text-sm text-muted-foreground">
              Non hai un account?{" "}
              <Link to="/register" className="text-primary underline-offset-4 hover:underline">
                Registrati
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default LoginPage;
