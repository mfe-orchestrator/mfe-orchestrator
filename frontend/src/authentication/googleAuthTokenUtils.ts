import axios from "axios"

export interface GoogleTokenResponse {
    access_token: string
    refresh_token?: string
    expires_in: number
    scope: string
    token_type: string
}


export async function getAccessToken(code: string): Promise<GoogleTokenResponse> {
    const response = await axios.get<GoogleTokenResponse>(
        '/api/auth/google?code='+ code
    )

    return response.data

}