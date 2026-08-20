import { AuthenticationType } from "@/api/apiClient"
import useApiClient from "@/hooks/useApiClient"
import { Project } from "./useProjectApi"

/** react-query key of the organization list, shared by everything that has to invalidate it. */
export const ORGANIZATIONS_QUERY_KEY = ["organizations-mine"]

export enum RoleInOrganization {
    OWNER = "OWNER",
    ADMIN = "ADMIN",
    MEMBER = "MEMBER"
}

/** The roles that administer an organization: they reach every project in it and manage its members. */
export const ORGANIZATION_ADMIN_ROLES: RoleInOrganization[] = [RoleInOrganization.OWNER, RoleInOrganization.ADMIN]

export const canAdministerOrganization = (organization?: Organization): boolean => Boolean(organization && ORGANIZATION_ADMIN_ROLES.includes(organization.role))

export interface Organization {
    _id: string
    name: string
    slug: string
    description?: string
    /** The role the signed-in user holds here: what every action on this screen is gated on. */
    role: RoleInOrganization
    createdAt?: string
    updatedAt?: string
}

export interface OrganizationSummaryDTO {
    organization: Organization
    role: RoleInOrganization
    count: {
        projects: number
        users: number
    }
}

export interface OrganizationUser {
    _id: string
    email: string
    name?: string
    surname?: string
    role: RoleInOrganization
    status?: string
    invitationPending?: boolean
    invitationExpiresAt?: string
    projectCount: number
    joinedAt: string
}

export interface AddUserToOrganizationDTO {
    email: string
    role: RoleInOrganization
}

const useOrganizationApi = () => {
    const { doRequest } = useApiClient()

    const getMineOrganizations = async (): Promise<Organization[]> => {
        const response = await doRequest<Organization[]>({ url: "/api/organizations/mine" })
        return response.data
    }

    const getOrganizationById = async (organizationId: string): Promise<Organization> => {
        const response = await doRequest<Organization>({ url: `/api/organizations/${organizationId}` })
        return response.data
    }

    const getOrganizationSummary = async (organizationId: string): Promise<OrganizationSummaryDTO> => {
        const response = await doRequest<OrganizationSummaryDTO>({ url: `/api/organizations/${organizationId}/summary` })
        return response.data
    }

    const getOrganizationProjects = async (organizationId: string): Promise<Project[]> => {
        const response = await doRequest<Project[]>({ url: `/api/organizations/${organizationId}/projects` })
        return response.data
    }

    const createOrganization = async (organization: { name: string; description?: string }): Promise<Organization> => {
        const response = await doRequest<Organization>({
            url: "/api/organizations",
            method: "POST",
            data: organization
        })
        return response.data
    }

    const updateOrganization = async (organizationId: string, organization: { name?: string; description?: string | null }): Promise<Organization> => {
        const response = await doRequest<Organization>({
            url: `/api/organizations/${organizationId}`,
            method: "PUT",
            data: organization
        })
        return response.data
    }

    const deleteOrganization = async (organizationId: string): Promise<void> => {
        await doRequest({ url: `/api/organizations/${organizationId}`, method: "DELETE" })
    }

    const getOrganizationUsers = async (organizationId: string): Promise<OrganizationUser[]> => {
        const response = await doRequest<OrganizationUser[]>({
            url: `/api/organizations/${organizationId}/users`,
            authenticated: AuthenticationType.REQUIRED
        })
        return response.data
    }

    const inviteUser = async (dto: AddUserToOrganizationDTO & { organizationId: string }): Promise<void> => {
        await doRequest({
            url: `/api/organizations/${dto.organizationId}/users`,
            method: "POST",
            data: { email: dto.email, role: dto.role }
        })
    }

    const updateUserRole = async (organizationId: string, userId: string, role: RoleInOrganization): Promise<void> => {
        await doRequest({
            url: `/api/organizations/${organizationId}/users/${userId}`,
            method: "PUT",
            data: { role }
        })
    }

    const removeUser = async (organizationId: string, userId: string): Promise<void> => {
        await doRequest({ url: `/api/organizations/${organizationId}/users/${userId}`, method: "DELETE" })
    }

    const resendInvitation = async (organizationId: string, userId: string): Promise<void> => {
        await doRequest({ url: `/api/organizations/${organizationId}/users/${userId}/resend-invitation`, method: "POST" })
    }

    return {
        getMineOrganizations,
        getOrganizationById,
        getOrganizationSummary,
        getOrganizationProjects,
        createOrganization,
        updateOrganization,
        deleteOrganization,
        getOrganizationUsers,
        inviteUser,
        updateUserRole,
        removeUser,
        resendInvitation
    }
}

export default useOrganizationApi
