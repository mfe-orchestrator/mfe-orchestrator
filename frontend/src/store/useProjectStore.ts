import { Project } from '@/hooks/apiClients/useProjectApi';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface ProjectState {
  project?: Project;
  projects?: Project[];
  setProject: (project: Project) => void;
  setProjects: (projects: Project[]) => void;
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
    }),
    {
      name: 'project-storage',
    }
  )
);

export default useProjectStore