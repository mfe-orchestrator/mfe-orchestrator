export default interface UpdateGithubDTO {
    name: string
    type: 'personal' | 'organization'
    organizationId?: string
}