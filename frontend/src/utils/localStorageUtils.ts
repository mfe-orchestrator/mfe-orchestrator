export const setLanguageInLocalStorage = (language: string) => {
    if (!localStorage) return
    localStorage.setItem("language", language)
}

export const setThemeInLocalStorage = (theme: string) => {
    if (!localStorage) return
    localStorage.setItem("theme", theme)
}

export const getLanguageFromLocalStorage = () => {
    if (!localStorage) return
    return localStorage.getItem("language")
}

export const getThemeFromLocalStorage = () => {
    if (!localStorage) return
    return localStorage.getItem("theme")
}

export const setProjectIdInLocalStorage = (projectId: string) => {
    if (!localStorage) return
    localStorage.setItem("projectId", projectId)
}

export const getProjectIdFromLocalStorage = () => {
    if (!localStorage) return
    return localStorage.getItem("projectId")
}

export const setOrganizationIdInLocalStorage = (organizationId: string) => {
    if (!localStorage) return
    localStorage.setItem("organizationId", organizationId)
}

export const getOrganizationIdFromLocalStorage = () => {
    if (!localStorage) return
    return localStorage.getItem("organizationId")
}

/**
 * Forgets the project in use, without touching the organization.
 *
 * Called when the organization changes: the stored project belongs to the previous one, and keeping it
 * would restore a project the user cannot even see from where they now are.
 */
export const clearProjectIdInLocalStorage = () => {
    if (!localStorage) return
    localStorage.removeItem("projectId")
}
