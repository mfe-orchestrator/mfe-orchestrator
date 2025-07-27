import useProjectStore from "@/store/projectStore";
import { useQuery } from "@tanstack/react-query";
import useProjectApi from "@/hooks/apiClients/useProjectApi";
import ApiDataFetcher from "@/components/ApiDataFetcher/ApiDataFetcher";
import AuthenticationLayout from "@/authentication/components/AuthenticationLayout";
import { Form, FormProvider, useForm } from "react-hook-form";
import TextField from "@/components/input/TextField.rhf";
import { Button } from "@/components/ui/button";

const CreateFirstProjectForm  = () =>{
  const projectApi = useProjectApi();
  const form = useForm()

  const onSubmit = async (data: any) => {
    try {
      await projectApi.createProject(data);
    } catch (error) {
      console.error("Error creating project:", error);
    }
  };

  return (
    <AuthenticationLayout title="Nessun progetto trovato" description="Crea un nuovo progetto adesso" footer={
      <p className="text-sm text-muted-foreground  text-center">
      Oppure chiedi al tuo amministratore di assegnarti ad un progetto
      </p>
    }>
      <FormProvider {...form}>
        <Form onSubmit={onSubmit} {...form}>
          <div className="flex flex-col gap-4">
          <TextField name="name" label="Nome" rules={{ required: true }} />
          <div className="flex justify-center">
            <Button type="submit">Crea</Button>
          </div>
          </div>
        </Form> 
      </FormProvider>
    </AuthenticationLayout>
  )
}

const SelectProjectForm : React.FC = () =>{

    const form = useForm()

    const onSubmit = async (data: any) => {
      try {
        
      } catch (error) {
        
      }
    }

    return (
      <AuthenticationLayout title="Seleziona un progetto">
        <FormProvider {...form}>
        <Form onSubmit={onSubmit} {...form}>
            <div className="flex flex-col gap-4">
            <select>
                <option value="">Seleziona un progetto</option>
            </select>
            <div className="flex justify-end">
            <Button type="submit">Crea</Button>
            </div>
            </div>
        </Form> 
        </FormProvider>
      </AuthenticationLayout>
    )
}

const SelectProjectWrapperInner : React.FC<React.PropsWithChildren> = ({children}) =>{

    const projectStore = useProjectStore();

    if(projectStore.project){
      return <>{children}</>
    }

    if(!projectStore.projects || projectStore.projects.length === 0){
      return <CreateFirstProjectForm />
    }


    return <SelectProjectForm />
}

const SelectProjectWrapper : React.FC<React.PropsWithChildren> = (props) =>{

    const projectApi = useProjectApi();
    const projectStore = useProjectStore();

    const projectsQuery = useQuery({
      queryKey: ["projects-mine"],
      queryFn: async () => {
        try {
            const projects = await projectApi.getMineProjects();
            projectStore.setProjects(projects);
            if(projects.length === 1){
              projectStore.setProject(projects[0]);
            }
            return projects;
        } catch (error) {
            console.error("Error fetching projects:", error);
            throw error;
        }
      },
    });

    return <ApiDataFetcher queries={[projectsQuery]}>
        <SelectProjectWrapperInner {...props}/>
    </ApiDataFetcher>
  }


export default SelectProjectWrapper;
