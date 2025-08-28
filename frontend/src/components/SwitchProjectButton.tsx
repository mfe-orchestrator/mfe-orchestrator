import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Repeat } from "lucide-react";
import { useNavigate } from "react-router-dom";
import useProjectStore from '@/store/useProjectStore';
import { FormProvider, useForm } from 'react-hook-form';
import TextField from './input/TextField.rhf';
import { Textarea } from "@/components/ui/textarea";
import useProjectApi from '@/hooks/apiClients/useProjectApi';
import { Project } from '@/hooks/apiClients/useProjectApi';
import TextareaField from './input/TextareaField.rhf';

interface CreateNewProjectFormData {
    name: string;
    description: string;
}

interface CreateNewProjectFormProps {
    onSuccess?: () => void
}
const CreateNewProjectForm : React.FC<CreateNewProjectFormProps> = ({onSuccess}) =>{
    const form = useForm<CreateNewProjectFormData>()
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const projectApi = useProjectApi();
    const projectStore = useProjectStore();

    const onSubmit = async (values: CreateNewProjectFormData) => {
        try {
            setIsSubmitting(true);
            setError('');
            const newProject = await projectApi.createProject({
                name: values.name,
                description: values.description
            });
            
            // Update the projects list in the store
            projectStore.setProjects([...projectStore.projects, newProject]);
            projectStore.setProject(newProject);
            
            onSuccess?.();
            form.reset();
        } catch (err: any) {
            setError(err.message || 'Failed to create project');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <FormProvider {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
                <div className="space-y-4">
                    <TextField
                        name="name"
                        label="Name"
                        placeholder="Enter project name"
                        rules={{ required: 'Project name is required' }}
                        required
                    />
                    <TextareaField
                        name="description"
                        label="Description"
                        placeholder="A brief description of your project"
                        className="min-h-[100px]"
                        maxLength={500}
                    />
                    <Button type="submit" className="w-full" disabled={isSubmitting}>Create</Button>
                </div>
            </form>
        </FormProvider>
    )
}

const SwitchProjectButton = () => {
    const [isOpen, setIsOpen] = useState(false);
    const { project, projects = [], setProject, setProjects } = useProjectStore();
    const projectApi = useProjectApi();

    const handleProjectSelect = (selectedProject: Project) => {
        setProject(selectedProject);
        setIsOpen(false);
    };

    const loadProjects = async () => {
        try {
            const projects = await projectApi.getMineProjects();
            setProjects(projects);
        } catch (error) {
            console.error('Failed to load projects:', error);
        }
    };

    const handleOpenChange = (open: boolean) => {
        setIsOpen(open);
        if (open) {
            loadProjects();
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="default" className="relative flex items-center bg-primary hover:bg-primary/90 p-4">
                    <Repeat className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{projects && projects.length > 1 ? 'Switch Project' : 'Create New Project'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    {projects && projects.length > 1 &&
                        <div className="space-y-2">
                            {projects?.map((proj) => (
                                <div
                                    key={proj._id}
                                    onClick={() => handleProjectSelect(proj)}
                                    className={`flex items-center p-3 rounded-md cursor-pointer hover:bg-accent ${project?._id === proj._id ? 'bg-accent' : ''}`}
                                >
                                    <span className="truncate">{proj.name}</span>
                                </div>
                            ))}
                        </div>
                    }
                    <CreateNewProjectForm onSuccess={() => setIsOpen(false)}/>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default SwitchProjectButton;