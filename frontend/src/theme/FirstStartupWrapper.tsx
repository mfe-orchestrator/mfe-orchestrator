import ApiDataFetcher from "@/components/ApiDataFetcher/ApiDataFetcher";
import { useQuery } from "@tanstack/react-query";
import AuthenticationLayout from "@/authentication/components/AuthenticationLayout";
import { Form, FormProvider, useForm } from "react-hook-form";
import TextField from "@/components/input/TextField.rhf";
import { Button } from "@/components/ui/button";
import useStartupApi from "@/hooks/apiClients/useStartupApi";

const RegisterFirstUser : React.FC = () =>{
    const form = useForm()
    const onSubmit = async (data: any) => {
      try {
        
      } catch (error) {
        
      }
    }
    return <AuthenticationLayout title="Nuova installazione" description="Registra il tuo primo utente">
      <FormProvider {...form}>
        <Form onSubmit={onSubmit} {...form}>
          <div className="flex flex-col gap-4">
          <TextField name="email" label="Email" rules={{ required: true }} />
          <TextField name="password" label="Password" rules={{ required: true }} />
          <TextField name="project" label="Progetto" rules={{ required: true }} />
          <div className="flex justify-center">
            <Button type="submit">Crea</Button>
          </div>
          </div>
        </Form> 
      </FormProvider>
    </AuthenticationLayout>
}


const FirstStartupWrapper : React.FC<React.PropsWithChildren> = ({children}) =>{

    const startupApi = useStartupApi();

    const usersQuery = useQuery({
      queryKey: ["users"],
      queryFn: startupApi.existsAtLeastOneUser
    });

    return <ApiDataFetcher queries={[usersQuery]}>
        {usersQuery.data ? <>{children}</> : <RegisterFirstUser />}
    </ApiDataFetcher>
}

export default FirstStartupWrapper