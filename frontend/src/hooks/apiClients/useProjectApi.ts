import useApiClient from "../useApiClient"
import { EnvironmentDTO } from "./useEnvironmentsApi"

export enum RoleInProject {
    OWNER = "OWNER",
    MEMBER = "MEMBER",
    VIEWER = "VIEWER"
}

export interface ProjectPipelinesRepository {
    codeRepositoryId: string
    repositoryId: string
    name: string
}

/** Il repository da cui si copiano le pipeline dei repository creati da un template, al posto dei template-pipelines ufficiali */
export interface ProjectPipelines {
    codeRepository: ProjectPipelinesRepository
    /** Branch o tag letto; assente = il branch di default del repository */
    ref?: string
}

export interface Project {
    /** The organization the project belongs to: a project sits in exactly one. */
    organizationId: string
    name: string
    slug: string
    description?: string
    /** Markdown per gli agenti AI (client MCP, assistente della console) */
    context?: string
    pipelines?: ProjectPipelines
    createdAt?: string
    updatedAt?: string
    _id: string
}

export interface ProjectSummaryDTO {
    project: Project
    count: {
        environments: number
        users: number
        microfrontends: number
        codeRepositories: number
        apiKeys: number
        storages: number
    }
}

/**
 * Cio che si puo cambiare di un progetto dopo la creazione.
 *
 * Lo slug non c'e' di proposito: entra nel percorso fisico dei bundle gia caricati
 * (`<slug>-<id>/<mfe>/<versione>`), quindi cambiarlo renderebbe irraggiungibile cio che e' gia
 * stato deployato. Il nome resta una pura etichetta.
 */
export interface ProjectUpdateDTO {
    name?: string
    /** `null` azzera la descrizione: e' cosi che l'API esprime "nessuna descrizione". */
    description?: string | null
    /** `null` azzera il contesto, come per la descrizione. */
    context?: string | null
    isActive?: boolean
    /** Il repository si indica con l'id del provider: il backend verifica che la connessione lo raggiunga. `null` torna ai template-pipelines ufficiali; ref vuoto o null = il branch di default */
    pipelines?: { codeRepositoryId: string; repositoryId: string; ref?: string | null } | null
}

interface AddUserToProjectDTO {
    email: string
    role: RoleInProject
}

const useProjectApi = () => {
    const apiClient = useApiClient()

    /**
     * The projects the user can open. Narrowed to one organization when given, which is what every
     * screen of the app asks for: it works inside one organization at a time.
     */
    const getMineProjects = async (organizationId?: string): Promise<Project[]> => {
        const response = await apiClient.doRequest<Project[]>({
            url: "/api/projects/mine",
            params: organizationId ? { organizationId } : undefined
        })
        return response.data
    }

    const getEnvironmentsByProjectId = async (projectId: string): Promise<EnvironmentDTO[]> => {
        const response = await apiClient.doRequest<EnvironmentDTO[]>({
            url: `/api/projects/${projectId}/environments`
        })
        return response.data
    }

    const getProjectById = async (id: string): Promise<Project> => {
        const response = await apiClient.doRequest<Project>({
            url: `/api/projects/${id}`,
            method: "GET"
        })
        return response.data
    }

    const getProjectSummaryById = async (id: string): Promise<ProjectSummaryDTO> => {
        const response = await apiClient.doRequest<ProjectSummaryDTO>({
            url: `/api/projects/${id}/summary`,
            method: "GET"
        })
        return response.data
    }

    const createProject = async (project: Omit<Project, "_id" | "createdAt" | "updatedAt">): Promise<Project> => {
        const response = await apiClient.doRequest<Project>({
            url: "/api/projects",
            method: "POST",
            data: project
        })
        return response.data
    }

    const updateProject = async (id: string, project: ProjectUpdateDTO, customErrorMessage?: (error: Error) => string | undefined): Promise<Project> => {
        const response = await apiClient.doRequest<Project>({
            url: `/api/projects/${id}`,
            method: "PUT",
            data: project,
            customErrorMessage
        })
        return response.data
    }

    const deleteProject = async (id: string): Promise<void> => {
        await apiClient.doRequest({
            url: `/api/projects/${id}`,
            method: "DELETE"
        })
    }

    const inviteUser = async (dto: AddUserToProjectDTO & { projectId: string }): Promise<void> => {
        await apiClient.doRequest({
            url: `/api/projects/${dto.projectId}/users`,
            method: "POST",
            data: dto
        })
    }

    return {
        getMineProjects: getMineProjects,
        getProjectById,
        createProject,
        updateProject,
        getProjectSummaryById,
        deleteProject,
        getEnvironmentsByProjectId,
        inviteUser
    }
}

export default useProjectApi
