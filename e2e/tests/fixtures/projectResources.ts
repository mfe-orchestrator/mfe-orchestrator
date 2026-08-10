import { APIRequestContext, expect } from "@playwright/test"
import { ISSUER } from "./appUser"

/**
 * Lettura e seeding via API delle risorse di un progetto (ambienti, API key,
 * storage). Servono a preparare lo stato di partenza senza passare dalla UI e a
 * verificare dal lato server quello che la UI dichiara di aver fatto.
 */

/** Le rotte di progetto leggono il progetto dall'header, come fa la app. */
export const authHeaders = (accessToken: string, projectId?: string): Record<string, string> => ({
    Authorization: `Bearer ${accessToken}`,
    issuer: ISSUER,
    ...(projectId ? { "Project-Id": projectId } : {})
})

const json = async <T>(response: Awaited<ReturnType<APIRequestContext["get"]>>, what: string): Promise<T> => {
    expect(response.ok(), `${what} fallita (HTTP ${response.status()}): ${await response.text()}`).toBeTruthy()
    return (await response.json()) as T
}

export interface Environment {
    _id: string
    name: string
    slug: string
    color?: string
    isProduction?: boolean
}

export interface ApiKey {
    _id: string
    name: string
    expiresAt: string
}

export interface Storage {
    _id: string
    name: string
    type: string
    path?: string
    default?: boolean
    authConfig: Record<string, string>
}

export async function createEnvironmentViaApi(
    request: APIRequestContext,
    accessToken: string,
    projectId: string,
    environment: { name: string; slug: string; color?: string; isProduction?: boolean }
): Promise<Environment> {
    const response = await request.post("/api/environments", {
        headers: authHeaders(accessToken, projectId),
        data: { color: "#4F46E5", isProduction: false, ...environment }
    })
    return json<Environment>(response, `Creazione ambiente ${environment.slug}`)
}

export async function getEnvironmentsViaApi(request: APIRequestContext, accessToken: string, projectId: string): Promise<Environment[]> {
    const response = await request.get(`/api/projects/${projectId}/environments`, { headers: authHeaders(accessToken, projectId) })
    return json<Environment[]>(response, "Lettura ambienti")
}

export async function getApiKeysViaApi(request: APIRequestContext, accessToken: string, projectId: string): Promise<ApiKey[]> {
    const response = await request.get(`/api/projects/${projectId}/api-keys`, { headers: authHeaders(accessToken, projectId) })
    return json<ApiKey[]>(response, "Lettura API key")
}

export async function getStoragesViaApi(request: APIRequestContext, accessToken: string, projectId: string): Promise<Storage[]> {
    const response = await request.get(`/api/projects/${projectId}/storages`, { headers: authHeaders(accessToken, projectId) })
    return json<Storage[]>(response, "Lettura storage")
}
