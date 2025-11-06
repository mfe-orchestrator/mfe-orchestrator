import fs from "fs-extra"
import * as git from "isomorphic-git"
import http from "isomorphic-git/http/node"

import { fastify } from ".."
import { CodeRepositoryProvider, ICodeRepository } from "../models/CodeRepositoryModel"

interface CloneRepositoryParams {
    repositoryUrl: string
    initializeInCaseOfEmptyRepo?: boolean
}

interface PushRepositoryParams {
    branch?: string
}

class CodeManagementService {

    provider: CodeRepositoryProvider
    accessToken: string
    workingDirectory: string

    constructor(provider: CodeRepositoryProvider, accessToken: string, workingDirectory: string) {
        this.provider = provider
        this.accessToken = accessToken
        this.workingDirectory = workingDirectory
    }

    getRepositoryUrl(codeRepository: ICodeRepository, repositoryId: string): string {
        const { provider } = codeRepository
        switch (provider) {
            case CodeRepositoryProvider.GITHUB: {
                const orgOrUserName = codeRepository.githubData?.userName || codeRepository.githubData?.organizationId
                return `https://github.com/${orgOrUserName}/${repositoryId}.git`
            }
            case CodeRepositoryProvider.GITLAB:
                return `https://gitlab.com/${repositoryId}.git`
            case CodeRepositoryProvider.AZURE_DEV_OPS:
                return `https://${codeRepository.azureData?.organization}@dev.azure.com/${codeRepository.azureData?.organization}/${codeRepository.azureData?.projectId}/${repositoryId}/_git/${repositoryId}`
            default:
                throw new Error(`Unsupported code repository provider: ${provider}`)
        }
    }

    async cloneRepository({ repositoryUrl, initializeInCaseOfEmptyRepo = true }: CloneRepositoryParams) {
        try {
            // Try clone
            await git.clone({
                fs,
                http,
                dir: this.workingDirectory,
                url: repositoryUrl,
                singleBranch: true,
                depth: 1,
                headers: { "User-Agent": "mfe-orchestrator" },
                onAuth: () => ({ username: this.accessToken, password: "x-oauth-basic" })
            })
            fastify.log.info("✅ Repo cloned successfully")
        } catch (e) {
            fastify.log.info("⚠️ Repo might be empty")
            fastify.log.error(e)
            if (initializeInCaseOfEmptyRepo) {
                fastify.log.info("⚠️ Initializing repo...")
                await git.init({ fs, dir: this.workingDirectory, defaultBranch: "main" })
                await git.addRemote({ fs, dir: this.workingDirectory, remote: "origin", url: repositoryUrl })
            }
        }
    }

    async pushRepository({ branch = "main" }: PushRepositoryParams) {
        await git.push({
            fs,
            http,
            dir: this.workingDirectory,
            remote: "origin",
            ref: branch,
            onAuth: () => ({ username: this.accessToken, password: "x-oauth-basic" })
        })
    }

}

export default CodeManagementService
