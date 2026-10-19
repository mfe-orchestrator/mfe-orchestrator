/** A relation drawn by hand from one domain of the project to another */
interface DomainLinkDTO {
    sourceDomainId: string
    targetDomainId: string
    label?: string
}

export default DomainLinkDTO
