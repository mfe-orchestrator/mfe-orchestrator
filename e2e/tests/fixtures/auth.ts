import { APIRequestContext, expect, Page } from "@playwright/test"

/**
 * Credentials of a pre-existing, verified user for wizard tests.
 * Defaults to the local dev seed user; override via env for other environments.
 */
const EMAIL = process.env.E2E_EMAIL || "demo@mfe.local"
const PASSWORD = process.env.E2E_PASSWORD || "Password123!"
const LOCAL_ISSUER = "microfrontend.orchestrator.hub"

/**
 * Logs in through the embedded-login API and injects the resulting token into
 * localStorage before the page loads, so tests start already authenticated
 * without going through the login UI / email verification.
 */
export async function loginViaApi(page: Page, request: APIRequestContext): Promise<void> {
    const res = await request.post("/api/users/login", {
        data: { email: EMAIL, password: PASSWORD }
    })
    expect(res.ok(), `Login failed for ${EMAIL} (HTTP ${res.status()}). Seed a verified user or set E2E_EMAIL / E2E_PASSWORD.`).toBeTruthy()

    const { accessToken } = await res.json()
    expect(accessToken, "Login response did not contain an accessToken").toBeTruthy()

    // Pre-select an existing project so SelectProjectWrapper renders the app
    // (and thus the /project-wizard route) instead of the project picker.
    let projectId = ""
    const projectsRes = await request.get("/api/projects/mine", {
        headers: { Authorization: `Bearer ${accessToken}`, issuer: LOCAL_ISSUER }
    })
    if (projectsRes.ok()) {
        const projects = await projectsRes.json()
        projectId = projects?.[0]?._id ?? ""
    }

    await page.addInitScript(
        ([token, issuer, selectedProjectId]) => {
            localStorage.setItem("token", JSON.stringify({ token, issuer }))
            localStorage.setItem("theme", "LIGHT")
            if (selectedProjectId) {
                localStorage.setItem("projectId", selectedProjectId)
            }
        },
        [accessToken, LOCAL_ISSUER, projectId]
    )
}
