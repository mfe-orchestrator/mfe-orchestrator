import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export interface Project {
  id: string;
  name: string;
  // Add other project properties as needed
  [key: string]: any;
}

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