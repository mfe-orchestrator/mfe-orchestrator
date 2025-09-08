import axios from "axios"

export interface AzureAccessTokenResponse {
    access_token: string
    token_type: string
    expires_in: number
    refresh_token: string
    scope: string
    error?: string
    error_description?: string
}

export interface AzureAccessTokenRequest {
    client_id: string
    client_secret: string
    code: string
    redirect_uri: string
    grant_type: string
}

export interface AzureUser {
    subjectId: string
    descriptor: string
    publicAlias: string
    emailAddress: string
    coreRevision: number
    timeStamp: string
    id: string
    revision: number
    url: string
    displayName: string
    uniqueName: string
    imageUrl: string
    isAadIdentity: boolean
    isContainer: boolean
    isDeletedInOrigin: boolean
    profileUrl: string
    directoryAlias: string
    domain: string
    principalName: string
    mailAddress: string
}

export interface AzureOrganization {
    accountId: string
    accountName: string
    accountUri: string
    properties: any
}

export interface AzureDevOpsProject {
    id: string;
    name: string;
    url: string;
    state: string;
    revision: number;
    visibility: string;
    lastUpdateTime: string;
    description?: string; // opzionale perché non tutte le voci hanno description
  }
  
  export interface AzureDevOpsProjectsResponse {
    count: number;
    value: AzureDevOpsProject[];
  }

class AzureDevOpsClient {

    // Ottieni l'ID utente dal profilo
    async getUserId(token: string) {
        const response = await axios.request({
            url: "https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.1-preview.3",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });
        return response.data.id; // userId
    }

    // Ottieni tutte le orgs dell'utente
    async getOrganizations(token: string) {
        const userId = await this.getUserId(token);
        const url = `https://app.vssps.visualstudio.com/_apis/accounts?memberId=${userId}&api-version=7.1-preview.1`;

        const response = await axios.request({
            url,
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });
        return response.data.value; // array di orgs
    }

    async getProjects(token: string, organization: string) : Promise<AzureDevOpsProjectsResponse> {
        const url = `https://dev.azure.com/${organization}/_apis/projects?api-version=7.1-preview.4`;
        const response = await axios.request<AzureDevOpsProjectsResponse>({
            url,
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });
        return response.data;
    }

    async getRepositories(token: string, organization: string, project: string) {
        const url = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories?api-version=7.1-preview.1`;
        const response = await axios.request({
            url,
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });
        console.log(response.data);
        return response.data;
    }

    async createRepository(token: string, organization: string, project: string, repositoryName: string) {
        const url = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories?api-version=7.1-preview.1`;
        const body = {
            name: repositoryName,
            project: {
                id: project
            }
        };

        const response = await axios.request({
            method: 'POST',
            url,
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            data: body
        });

        return response.data;
    }

    async getRepository(token: string, organization: string, project: string, repositoryName: string){
        const url = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repositoryName}?api-version=7.1-preview.1`;
        const response = await axios.request({
            url,
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

        return response.data;
    }
}

export default AzureDevOpsClient