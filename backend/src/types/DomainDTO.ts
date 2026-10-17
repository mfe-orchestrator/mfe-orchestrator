interface DomainDTO {
    name: string
    /** Left out on create, it is derived from the name. Never changed by an update. */
    slug?: string
    description?: string
}

export default DomainDTO
