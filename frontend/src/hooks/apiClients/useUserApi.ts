import { ThemeEnum } from "@/store/useThemeStore"
import { AuthenticationType } from "../../api/apiClient"
import useApiClient, { IClientRequestMetadataExtended } from "../useApiClient"

/** Campi che il backend restituisce da `toFrontendObject()`. */
export interface User {
    _id: string
    email: string
    name?: string
    surname?: string
    role: string
    status: string
    isInvited?: boolean
    createdAt: string
    updatedAt: string
    language?: string
    theme?: ThemeEnum
    marketingConsent?: boolean
    marketingConsentAt?: string
    marketingConsentVersion?: string
}

export interface UserProfileUpdateDTO {
    name?: string
    surname?: string
}

export interface UserRegistrationDTO {
    email: string
    password: string
    name?: string
    surname?: string
    marketingConsent?: boolean
}

export interface UserLoginDTO {
    email: string
    password: string
}

export interface ResetPasswordRequestDTO {
    email: string
}

export interface ResetPasswordDataDTO {
    token: string
    password: string
}

export interface UserInvitationDTO {
    email: string
    role?: string
}

export interface AuthResponse {
    accessToken: string
    user: User
}

const useUserApi = () => {
    const { doRequest } = useApiClient()

    // Authentication
    async function register(userData: UserRegistrationDTO) {
        const response = await doRequest<AuthResponse>({
            url: "/api/users/registration",
            authenticated: AuthenticationType.NONE,
            method: "POST",
            data: userData
        })
        return response.data
    }

    const saveTheme = (theme: ThemeEnum) => {
        doRequest({
            url: "/api/users/theme",
            method: "POST",
            silent: true,
            data: { theme }
        })
    }

    const saveLanguage = (language: string) => {
        doRequest({
            url: "/api/users/language",
            method: "POST",
            silent: true,
            data: { language }
        })
    }

    async function activateAccount(token: string) {
        await doRequest({
            url: "/api/users/account-activation",
            authenticated: AuthenticationType.NONE,
            method: "POST",
            data: { token }
        })
        return true
    }

    async function login(credentials: UserLoginDTO) {
        const response = await doRequest<AuthResponse>({
            url: "/api/users/login",
            authenticated: AuthenticationType.NONE,
            method: "POST",
            data: credentials
        })
        return response.data
    }

    async function resetPasswordRequest(data: ResetPasswordRequestDTO, metadata?: IClientRequestMetadataExtended) {
        return doRequest({
            ...metadata,
            url: "/api/users/forgot-password",
            authenticated: AuthenticationType.NONE,
            method: "POST",
            data
        })
    }

    async function resetPassword(data: ResetPasswordDataDTO) {
        await doRequest({
            url: "/api/users/reset-password",
            method: "POST",
            authenticated: AuthenticationType.NONE,
            data
        })
        return true
    }

    async function getProfile() {
        const response = await doRequest<User>({
            url: "/api/users/profile",
            method: "GET",
            authenticated: AuthenticationType.REQUIRED,
            silent: true
        })
        return response.data
    }

    async function updateProfile(data: UserProfileUpdateDTO) {
        const response = await doRequest<User>({
            url: "/api/users/profile",
            method: "PUT",
            data
        })
        return response.data
    }

    async function updateMarketingConsent(marketingConsent: boolean) {
        const response = await doRequest<User>({
            url: "/api/users/marketing-consent",
            method: "PUT",
            data: { marketingConsent }
        })
        return response.data
    }

    /**
     * L'immagine arriva come data URI e non come URL: l'endpoint è autenticato e
     * il `src` di un `<img>` non porta con sé l'header Authorization.
     */
    async function getAvatar() {
        const response = await doRequest<{ avatar: string | null }>({
            url: "/api/users/profile/avatar",
            method: "GET",
            silent: true
        })
        return response.data.avatar
    }

    async function uploadAvatar(file: File) {
        const formData = new FormData()
        formData.append("file", file)
        // Il Content-Type va sovrascritto: il client mette application/json di
        // default e axios, vedendolo, serializzerebbe il FormData come JSON.
        // Dichiarandolo multipart lascia che sia il browser a scrivere il boundary.
        await doRequest({
            url: "/api/users/profile/avatar",
            method: "POST",
            data: formData,
            headers: { "Content-Type": "multipart/form-data" }
        })
    }

    async function deleteAvatar() {
        await doRequest({
            url: "/api/users/profile/avatar",
            method: "DELETE"
        })
    }

    async function inviteUser(invitationData: UserInvitationDTO) {
        const response = await doRequest<User>({
            url: "/api/users/invitation",
            method: "POST",
            data: invitationData,
            authenticated: AuthenticationType.REQUIRED
        })
        return response.data
    }

    return {
        register,
        login,
        resetPasswordRequest,
        resetPassword,
        getProfile,
        updateProfile,
        updateMarketingConsent,
        getAvatar,
        uploadAvatar,
        deleteAvatar,
        activateAccount,
        inviteUser,
        saveTheme,
        saveLanguage
    }
}

export default useUserApi
