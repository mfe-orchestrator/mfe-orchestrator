
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import useUserApi from "@/hooks/apiClients/useUserApi";
import TextField from "@/components/input/TextField.rhf";
import { FormProvider } from "react-hook-form";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import Spinner from "@/components/Spinner";

interface FormValues {
  name: string;
  surname: string;
  email: string;
  password: string;
  confirmPassword: string;
}

const ResetPasswordRequestPage = () => {
  const navigate = useNavigate();
  const { register } = useUserApi();
  const { toast } = useToast();

  const form = useForm<FormValues>({});

  const registerMutation = useMutation({
    mutationFn: register
  })

  const handleRegister = async (values: FormValues) => {
    
    registerMutation.mutate({
      name: values.name,
      surname: values.surname,
      email: values.email,
      password: values.password
    })
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-background to-muted">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <div className="h-12 w-12 rounded-md bg-orchestrator-accent flex items-center justify-center text-white text-xl font-bold">
            MF
          </div>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl text-center">Crea un account</CardTitle>
            <CardDescription className="text-center">
              Inserisci i tuoi dati per registrarti al sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormProvider {...form}>
            <form onSubmit={form.handleSubmit(handleRegister)}>
              <div className="grid gap-4">
                <TextField 
                  name="name"
                  label="Nome"
                  placeholder="Inserisci il tuo nome"
                  rules={{ required: true }}
                />

                <TextField 
                  name="surname"
                  label="Cognome"
                  placeholder="Inserisci il tuo cognome"
                  rules={{ required: true }}
                />
                
                <TextField 
                  name="email"
                  label="Email"
                  type="email"
                  placeholder="nome@esempio.com"
                  rules={{ required: true }}
                />
                
                <TextField 
                  name="password"
                  label="Password"
                  type="password"
                    placeholder="••••••••"
                  rules={{ required: true }}
                />
                
                <TextField 
                  name="confirmPassword"
                  label="Conferma Password"
                  type="password"
                    placeholder="••••••••"
                  rules={{ required: true }}
                />
                
                {registerMutation.isPending ? 
                  <Spinner />  
                : 
                  <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
                    Registrati
                  </Button>
              }
              </div>
            </form>
            </FormProvider>
          </CardContent>
          <CardFooter className="flex justify-center">
            <p className="text-sm text-muted-foreground">
              Hai già un account?{" "}
              <Link to="/" className="text-primary underline-offset-4 hover:underline">
                Accedi
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default ResetPasswordRequestPage;
