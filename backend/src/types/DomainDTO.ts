interface DomainDTO {
    name: string
    /** Left out on create, it is derived from the name. Never changed by an update. */
    slug?: string
    description?: string
    /** Markdown notes for AI agents about this domain. `null` removes it on update. */
    context?: string | null
}

/** Microfrontends and services of the project to put in a domain */
export interface DomainMembersDTO {
    microfrontendIds?: string[]
    serviceIds?: string[]
}

export default DomainDTO
