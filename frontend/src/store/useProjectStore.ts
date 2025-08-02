import { EnvironmentDTO } from '@/hooks/apiClients/useEnvironmentsApi';
import { Project } from '@/hooks/apiClients/useProjectApi';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface ProjectState {
  project?: Project;
  projects?: Project[];
  environments?: EnvironmentDTO[];
  environment?: EnvironmentDTO;
  setProject: (project: Project) => void;
  setProjects: (projects: Project[]) => void;
  setEnvironments: (environments: EnvironmentDTO[]) => void;
  setEnvironment: (environment: EnvironmentDTO) => void;
}

const useProjectStore = create<ProjectState>()(
  devtools(
    (set, get) => ({
      setProject: (project: Project) => {
        
        set({ project });
      },      
      setProjects: (projects: Project[]) => {
        set({ projects });
      },
      setEnvironments: (environments: EnvironmentDTO[]) => {
        set({ environments });
      },
      setEnvironment: (environment: EnvironmentDTO) => {
        set({ environment });
      },
    }),
    {
      name: 'project-storage',
    }
  )
);

export default useProjectStore