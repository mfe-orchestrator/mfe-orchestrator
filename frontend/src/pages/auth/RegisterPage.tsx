
import { useState } from "react";
import { useTranslation } from 'react-i18next';
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

const RegisterPage = () => {
  const { t } = useTranslation();
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
            <CardTitle className="text-2xl text-center">
              {t('auth.create_account')}
            </CardTitle>
            <CardDescription className="text-center">
              {t('auth.register_description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormProvider {...form}>
            <form onSubmit={form.handleSubmit(handleRegister)}>
              <div className="grid gap-4">
                <TextField 
                  name="name"
                  label={t('auth.name')}
                  placeholder={t('auth.name_placeholder')}
                  rules={{ required: t('common.required_field') as string }}
                />

                <TextField 
                  name="surname"
                  label={t('auth.surname')}
                  placeholder={t('auth.surname_placeholder')}
                  rules={{ required: t('common.required_field') as string }}
                />
                
                <TextField 
                  name="email"
                  label={t('auth.email')}
                  type="email"
                  placeholder={t('auth.email_placeholder')}
                  rules={{ 
                    required: t('common.required_field') as string,
                    pattern: {
                      value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                      message: t('auth.invalid_email') as string
                    }
                  }}
                />
                
                <TextField 
                  name="password"
                  label={t('auth.password')}
                  type="password"
                  placeholder="••••••••"
                  rules={{ 
                    required: t('common.required_field') as string,
                    minLength: {
                      value: 8,
                      message: t('auth.password_min_length') as string
                    }
                  }}
                />
                
                <TextField 
                  name="confirmPassword"
                  label={t('auth.confirm_password')}
                  type="password"
                  placeholder="••••••••"
                  rules={{ 
                    required: t('common.required_field') as string,
                    validate: (value: string) => 
                      value === form.getValues('password') || 
                      (t('auth.passwords_dont_match') as string)
                  }}
                />
                
                {registerMutation.isPending ? (
                  <Spinner />
                ) : (
                  <Button type="submit" className="w-full">
                    {t('auth.create_account')}
                  </Button>
                )}
              </div>
            </form>
            </FormProvider>
          </CardContent>
          <CardFooter className="flex justify-center">
              <p className="text-sm text-muted-foreground">
                {t('auth.already_have_account')}{" "}
                <Link to="/login" className="text-primary underline-offset-4 hover:underline">
                  {t('auth.login')}
                </Link>
              </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default RegisterPage;
