import axios, { AxiosInstance } from "axios";

interface GitLabGroup {
  id: number;
  name: string;
  path: string;
}

interface GitLabProject {
  id: number;
  name: string;
  path_with_namespace: string;
}

class GitLabClient {
  private api: AxiosInstance;

  constructor(url: string, pat: string) {
    this.api = axios.create({
      baseURL: url+"/api/v4",
      headers: {
        "PRIVATE-TOKEN": pat,
      },
    });
  }

  async getGroups(owned?: boolean): Promise<GitLabGroup[]> {
    const res = await this.api.get<GitLabGroup[]>("/groups", {
      params: { owned },
    });
    return res.data;
  }

  async getProjects(groupId: number): Promise<GitLabProject[]> {
    const res = await this.api.get<GitLabProject[]>(`/groups/${groupId}/projects`);
    return res.data;
  }

  async createProject(groupId: number, projectName: string): Promise<GitLabProject> {
    const res = await this.api.post<GitLabProject>("/projects", {
      name: projectName,
      namespace_id: groupId,
    });
    return res.data;
  }
}


export default GitLabClient