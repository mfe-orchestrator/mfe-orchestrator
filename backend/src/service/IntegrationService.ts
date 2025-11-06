import { ObjectId } from "mongoose"
import BaseAuthorizedService from "./BaseAuthorizedService"
import { MicrofrontendService } from "./MicrofrontendService"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import CodeManagementService from "./CodeManagementService"
import { join } from "path"
import { tmpdir } from "os"
import CodeRepository from "../models/CodeRepositoryModel"
import fs from "fs-extra"
import * as git from "isomorphic-git"
import { fastify } from ".."
import ServeService, { MicrofrontendAdaptedToServe } from "./ServeService"
import DeploymentService from "./DeploymentService"
import { IDeployment } from "../models/DeploymentModel"

export interface IIntegrationData {
    slug: string
    url?: string
    version: string
    type: string
}

export default class IntegrationService extends BaseAuthorizedService {

    async getIntegrationDataByMicrofrontendId(microfrontendId: string | ObjectId) {
        const microfrontendService = new MicrofrontendService(this.getUser())
        const microfrontend = await microfrontendService.getById(microfrontendId)

        if (!microfrontend) {
            throw new Error("No microfrontend found")
        }

        const integrationData: IIntegrationData = {
            slug: microfrontend.slug,
            url: microfrontend.host?.url,
            version: microfrontend.version,
            type: microfrontend.type
        }

        return {
            microfrontend,
            integrationData
        }
    }

    async injectMicrofrontendHostData(microfrontendId: string | ObjectId, environmentId?: string | ObjectId, deploymentId?: string | ObjectId) {
        if (!environmentId) {
            throw new Error("Environment ID is required")
        }

        const microfrontendService = new MicrofrontendService(this.getUser())
        const microfrontend = await microfrontendService.getById(microfrontendId)
        if (!microfrontend) {
            throw new EntityNotFoundError(microfrontendId.toString())
        }
        await this.ensureAccessToMicrofrontend(microfrontend)

        if (!microfrontend.codeRepository?.enabled) {
            throw new Error("Microfrontend code repository is not enabled")
        }

        const codeRepositoryData = await CodeRepository.findById(microfrontend.codeRepository.codeRepositoryId)
        if (!codeRepositoryData) {
            throw new EntityNotFoundError(microfrontend.codeRepository.codeRepositoryId.toString())
        }

        const data = await new ServeService().getMicrofrontendAdaptedData({
            microfrontendId: microfrontend._id,
            deploymentId: deploymentId,
            environmentId: environmentId,
        })

        if (!data || !data.microfrotnedUrls || data.microfrotnedUrls.length === 0) {
            throw new Error("No microfrontends found")
        }


        const tempDir = join(tmpdir(), `mfe-${microfrontend.slug}-${Date.now()}`)
        const codeManagementService = new CodeManagementService(codeRepositoryData.provider, codeRepositoryData.accessToken, tempDir)
        const repositoryUrl = codeManagementService.getRepositoryUrl(codeRepositoryData, microfrontend.codeRepository.repositoryId)

        await codeManagementService.cloneRepository({
            repositoryUrl,
            initializeInCaseOfEmptyRepo: false
        })

        try {
            // 1 - Cercare il file vite.config.ts o vite.config.js
            const viteConfigPath = await this.findViteConfig(tempDir)
            if (!viteConfigPath) {
                throw new Error("vite.config file not found")
            }

            // 2 - Leggere il file
            const configContent = await fs.readFile(viteConfigPath, "utf-8")

            // 3 - Iniettare i remotes
            const updatedConfig = await this.injectRemotesIntoViteConfig(configContent, data.microfrotnedUrls)
            await fs.writeFile(viteConfigPath, updatedConfig, "utf-8")

            // 4 - Committare
            await git.add({ fs, dir: tempDir, filepath: viteConfigPath.replace(tempDir + "/", "") })

            await git.commit({
                fs,
                dir: tempDir,
                message: `chore: inject microfrontend ${microfrontend.slug} configuration`,
                author: {
                    name: "MFE Orchestrator BOT",
                    email: "bot@mfe-orchestrator.dev"
                }
            })

            // 5 - Pushare
            await codeManagementService.pushRepository({
                branch: "main"
            })
        } finally {
            // Cleanup
            await fs.remove(tempDir)
        }
    }

    private async findViteConfig(directory: string): Promise<string | null> {
        const possibleFiles = ["vite.config.ts", "vite.config.js", "vite.config.mjs"]

        for (const file of possibleFiles) {
            const filePath = join(directory, file)
            if (await fs.pathExists(filePath)) {
                return filePath
            }
        }

        return null
    }

    private async injectRemotesIntoViteConfig(configContent: string, integrationData: MicrofrontendAdaptedToServe[]): Promise<string> {
        // Parse the config and inject remotes
        // This is a simplified implementation - you may need to adjust based on your actual vite config structure

        // Generate all remote entries from the array
        const remoteEntries = integrationData.map(data =>
            `"${data.nameToIntegrate}": "${data.url}"`
        )

        // Check if remotes object already exists
        if (configContent.includes("remotes:")) {
            // Replace all existing remotes content
            const remotesRegex = /(remotes:\s*{)([^}]*)(})/
            const match = configContent.match(remotesRegex)

            if (match) {
                // Replace with new remotes
                const newRemotesContent = remoteEntries.length > 0
                    ? `\n            ${remoteEntries.join(',\n            ')}\n        `
                    : ''

                return configContent.replace(remotesRegex, `$1${newRemotesContent}$3`)
            }
        } else {
            // Add remotes object to federation config
            if (configContent.includes("federation({")) {
                const remotesString = remoteEntries.join(',\n            ')
                const federationRegex = /(federation\(\{[^}]*)/
                return configContent.replace(
                    federationRegex,
                    `$1,\n        remotes: {\n            ${remotesString}\n        }`
                )
            }
        }

        return configContent
    }
}
