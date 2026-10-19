import AdmZip from "adm-zip"
import axios from "axios"
import fs from "fs-extra"
import * as git from "isomorphic-git"
import http from "isomorphic-git/http/node"
import { tmpdir } from "os"
import path, { join } from "path"
import { fastify } from ".."
import AzureDevOpsClient from "../client/AzureDevOpsClient"
import GithubClient from "../client/GithubClient"
import GitlabClient from "../client/GitlabClient"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import { ApiKeyRole } from "../models/ApiKeyModel"
import CodeRepository, { CodeRepositoryProvider, CodeRepositoryType, ICodeRepository } from "../models/CodeRepositoryModel"
import { IMarket } from "../models/MarketModel"
import { ICodeRepositoryMicrofrontend } from "../models/MicrofrontendModel"
import MicrofrontendDTO from "../types/MicrofrontendDTO"
import { ApiKeyService } from "./ApiKeyService"
import BaseAuthorizedService from "./BaseAuthorizedService"
import CodeManagementService from "./CodeManagementService"
import { deployKeyExpiry, deploySecretName } from "./CodeRepositoryService"
import { federationName } from "./FederationConfigService"

const pipelinesUrl = "https://github.com/mfe-orchestrator/template-pipelines/archive/refs/heads/main.zip"

/** What `%domain%` becomes in a scaffolded repository: the console its CI talks back to */
export const placeholderDomain = () => process.env.BACKEND_URL || "https://console.mfe-orchestrator.dev"

/** The placeholders of a pipeline copied from template-pipelines, the same on every provider */
const pipelinePlaceholders = (slug: string): Record<string, string> => ({ "%microfrontendSlug%": slug, "%domain%": placeholderDomain() })

/** The repository part of a microfrontend or service DTO, filled in once the repository exists */
export type CodeRepositoryTarget = MicrofrontendDTO["codeRepository"]

/**
 * Ends the line of a template's bundler config that holds the module federation name, e.g.
 * `name: 'exampleremote', // mfe-orchestrator:federation-name`. The template keeps a valid name of
 * its own, so it builds as it is, and the scaffolder swaps that string for the microfrontend's.
 */
export const FEDERATION_NAME_MARKER = "mfe-orchestrator:federation-name"

/** The bundler configs that carry the marker: webpack names its container with it, Vite does not need one */
const FEDERATION_NAME_FILES = ["webpack.config.ts", "webpack.config.js", "webpack.config.mjs", "webpack.config.cjs"]

/**
 * Replaces the first string literal of every line carrying {@link FEDERATION_NAME_MARKER} with
 * `name`, keeping its quotes. A host the console configured loads the remote by that name, so it
 * has to be the same {@link federationName} the console derives from the slug.
 */
export const replaceFederationName = (content: string, name: string): string =>
    content
        .split("\n")
        .map(line => (line.includes(FEDERATION_NAME_MARKER) ? line.replace(/(['"`])[^'"`]*\1/, (_, quote) => `${quote}${name}${quote}`) : line))
        .join("\n")

export interface ScaffoldOptions {
    /**
     * Replaced in every text file of the scaffolded tree before the initial commit. Microfrontends
     * leave it out: their placeholders live only in the pipeline overlay, replaced on its own.
     */
    placeholders?: Record<string, string>
    /**
     * Slug of the microfrontend being scaffolded: the federation name in its webpack config becomes
     * `federationName(slug)`, the name a host configured by the console looks the remote up by.
     */
    microfrontendSlug?: string
}

/**
 * Creates code repositories from marketplace templates and tags their releases, for whatever is
 * built from one: microfrontends and backend services go through exactly the same steps.
 */
export class TemplateScaffoldService extends BaseAuthorizedService {
    /**
     * Creates `target.createData` at the provider of the connection, injects the deploy secret on
     * GitHub and pushes the template, then writes what the provider answered back into `target`.
     */
    async createRepository(codeRepository: ICodeRepository, target: CodeRepositoryTarget, slug: string, template: IMarket | null, options?: ScaffoldOptions): Promise<void> {
        const createData = target.createData
        if (!createData) return

        if (codeRepository.provider === CodeRepositoryProvider.AZURE_DEV_OPS) {
            if (!codeRepository.azureData) {
                throw new Error("Azure data is not set")
            }

            const azureDevOpsClient = new AzureDevOpsClient()
            const createdRepository = await azureDevOpsClient.createRepository(codeRepository.accessToken, codeRepository.azureData.organization, codeRepository.azureData.projectId, createData.name)
            target.repositoryId = createdRepository.id
            target.name = createdRepository.name
            target.cloneUrlHttps = createdRepository.remoteUrl
            target.cloneUrlSsh = createdRepository.sshUrl
            if (template) {
                await this.injectTemplateAzureDevOps(slug, codeRepository.accessToken, createdRepository.name, codeRepository, "azure_dev_ops", template, options)
                await this.createPipelineAzureDevOps(createdRepository.name, codeRepository)
            }
        } else if (codeRepository.provider === CodeRepositoryProvider.GITLAB) {
            if (!codeRepository.gitlabData?.url) {
                throw new Error("Gitlab url is not set")
            }
            const gitlabClient = new GitlabClient(codeRepository.gitlabData?.url, codeRepository.accessToken)
            // In the connection's own group when none is picked: its deploy variable lives there
            const createdRepository = await gitlabClient.createRepository({
                name: createData.name,
                namespace_id: target.gitlab?.groupId ?? codeRepository.gitlabData?.groupId,
                visibility: createData.private ? "private" : "public"
            })
            // The template goes where GitLab put the repository, never to a path rebuilt from the
            // input: a group path that does not match the group id would force-push onto another repository
            const fullPath = createdRepository.path_with_namespace
            const separator = fullPath.lastIndexOf("/")
            target.name = createdRepository.name
            target.repositoryId = createdRepository.id + ""
            target.cloneUrlHttps = createdRepository.http_url_to_repo
            target.cloneUrlSsh = createdRepository.ssh_url_to_repo
            if (template) {
                await this.injectTemplateGitlab(
                    slug,
                    codeRepository.accessToken,
                    codeRepository.gitlabData?.url,
                    fullPath.slice(separator + 1),
                    fullPath.slice(0, separator),
                    codeRepository,
                    "gitlab",
                    template,
                    options
                )
            }
        } else if (codeRepository.provider === CodeRepositoryProvider.GITHUB) {
            const githubClient = new GithubClient()
            const createdRepository = await githubClient.createRepository(
                {
                    name: createData.name,
                    private: createData.private,
                    visibility: createData.private ? "private" : "public"
                },
                codeRepository.accessToken,
                codeRepository.githubData?.organizationId
            )
            target.repositoryId = createdRepository.id + ""
            target.name = createdRepository.name
            target.cloneUrlHttps = createdRepository.clone_url
            target.cloneUrlSsh = createdRepository.ssh_url
            // Now will inject api key
            await this.gitHubInjectApiKey(codeRepository, slug, target.name)
            // Now will inject the template
            if (template) {
                await this.injectTemplateGithub(slug, codeRepository.accessToken, createdRepository.clone_url, "github", template, options)
            }
        }
    }

    /** Stores a deploy API key as a secret of the GitHub repository, so its pipeline can call back */
    async gitHubInjectApiKey(codeRepository: ICodeRepository, slug: string, repositoryName?: string) {
        if (codeRepository.provider !== CodeRepositoryProvider.GITHUB) return
        if (codeRepository.githubData?.type === CodeRepositoryType.ORGANIZATION) return
        if (!repositoryName) return

        const githubClient = new GithubClient()

        const exists = await githubClient.checkRepositorySecretExists({
            accessToken: codeRepository.accessToken,
            repositoryName,
            secretName: deploySecretName
        })

        if (exists) {
            return
        }

        const apiKey = await new ApiKeyService(this.user).create(codeRepository.projectId.toString(), {
            name: "MFE_ORCHESTRATOR_DEPLOY_SECRET - Github - " + slug,
            role: ApiKeyRole.MANAGER,
            expiresAt: deployKeyExpiry()
        })

        await githubClient.upsertRepositorySecret({
            accessToken: codeRepository.accessToken,
            userName: codeRepository.githubData?.userName,
            repositoryName,
            secretName: deploySecretName,
            value: apiKey.apiKey
        })
    }

    async injectTemplateGitlab(
        slug: string,
        accessToken: string,
        baseUrl: string,
        repositoryName: string,
        repositoryGroup: string,
        codeRepository: ICodeRepository,
        repositoryType: string,
        template: IMarket,
        options?: ScaffoldOptions
    ) {
        const templateUrl = template.zipUrl
        if (!templateUrl) {
            throw new Error("Template url is not set")
        }

        if (!codeRepository.gitlabData) {
            throw new Error("Gitlab data is not set")
        }

        // Download + unzip template
        const tempDir = await this.downloadZip("template", templateUrl)

        const codeManagementService = new CodeManagementService(CodeRepositoryProvider.GITLAB, accessToken, tempDir)

        const path = repositoryGroup || codeRepository.gitlabData.groupPath

        const baseUrlReal = baseUrl.replaceAll("https://", "").replaceAll("http://", "")
        const repoUrl = "https://oauth2:" + accessToken + "@" + baseUrlReal + "/" + path + "/" + repositoryName + ".git"

        await codeManagementService.cloneRepository({
            repositoryUrl: repoUrl,
            initializeInCaseOfEmptyRepo: true,
            onAuth: () => ({ username: "oauth2", password: accessToken })
        })

        await this.flattenTemplate(tempDir)

        // Work on pipelines
        if (template.type && template.compiler) {
            //Download piplines data
            const tempDirPipelines = await this.downloadZip("template-pipelines", pipelinesUrl)

            const pipelinePath = join(tempDirPipelines, "template-pipelines-main", template.type, template.compiler, repositoryType, ".gitlab-ci.yml")

            // Check if the pipeline path exists
            if (await fs.pathExists(pipelinePath)) {
                const pipelineFile = join(tempDir, ".gitlab-ci.yml")
                await fs.copyFile(pipelinePath, pipelineFile)
                await this.replacePlaceholdersInFile(pipelineFile, pipelinePlaceholders(slug))

                fastify.log.info(`✅ Pipeline files copied from ${template.type}/${template.compiler}/${repositoryType}`)
            } else {
                fastify.log.warn(`⚠️ Pipeline path not found: ${pipelinePath}`)
            }
        } else {
            fastify.log.warn("⚠️ Template type or compiler not specified, skipping pipeline setup")
        }

        if (options?.placeholders) {
            await this.replacePlaceholdersInDirectory(tempDir, options.placeholders)
        }

        if (options?.microfrontendSlug) {
            await this.replaceFederationNameInConfigs(tempDir, federationName(options.microfrontendSlug))
        }

        // Stage + commit
        try {
            await git.branch({
                fs,
                dir: tempDir,
                ref: "main",
                checkout: true,
                force: true
            })
            await git.add({ fs, dir: tempDir, filepath: "." })
            await git.commit({
                fs,
                dir: tempDir,
                message: "Initial commit",
                author: {
                    name: "MFE Orchestrator Bot",
                    email: "bot@mfe-orchestrator.dev"
                }
            })

            // Push creates "main" on remote if missing
            await git.push({
                fs,
                http,
                dir: tempDir,
                remote: "origin",
                ref: "main",
                remoteRef: "main",
                headers: { "User-Agent": "mfe-orchestrator" },
                onAuth: () => ({ username: "oauth2", password: accessToken }),
                force: true
            })

            console.log("✅ Repo is ready and pushed!")
            return tempDir
        } catch (e) {
            console.error("‼️ Error pushing to remote: ", e)
            const remotes = await git.listRemotes({ fs, dir: tempDir })
            // A remote URL can carry the access token: never written to the log
            console.log(
                "🔍 Known remotes:",
                remotes.map(remote => ({ ...remote, url: remote.url.replace(/\/\/[^/@]*@/, "//***@") }))
            )

            const branches = await git.listBranches({ fs, dir: tempDir })
            console.log("🔍 Local branches:", branches)

            const remoteBranches = await git.listBranches({ fs, dir: tempDir, remote: "origin" }).catch(() => [])
            console.log("🔍 Remote branches:", remoteBranches)
        }
    }

    async injectTemplateAzureDevOps(slug: string, accessToken: string, repositoryName: string, codeRepository: ICodeRepository, repositoryType: string, template: IMarket, options?: ScaffoldOptions) {
        const templateUrl = template.zipUrl
        if (!templateUrl) {
            throw new Error("Template url is not set")
        }
        if (!codeRepository.azureData) {
            throw new Error("Azure data is not set")
        }

        // Download + unzip template
        const tempDir = await this.downloadZip("template", templateUrl)

        const codeManagementService = new CodeManagementService(CodeRepositoryProvider.AZURE_DEV_OPS, accessToken, tempDir)

        const repoUrl = "https://root:" + accessToken + "@dev.azure.com/" + codeRepository.azureData.organization + "/" + codeRepository.azureData.projectId + "/_git/" + repositoryName

        await codeManagementService.cloneRepository({
            repositoryUrl: repoUrl,
            initializeInCaseOfEmptyRepo: true
        })

        await this.flattenTemplate(tempDir)

        // Copy pipelines
        if (template.type && template.compiler) {
            //Download piplines data
            const tempDirPipelines = await this.downloadZip("template-pipelines", pipelinesUrl)

            const pipelinePath = join(tempDirPipelines, "template-pipelines-main", template.type, template.compiler, repositoryType, "azure-pipelines.yml")

            // Check if the pipeline path exists
            if (await fs.pathExists(pipelinePath)) {
                const pipelineFile = join(tempDir, "azure-pipelines.yml")
                await fs.copyFile(pipelinePath, pipelineFile)
                await this.replacePlaceholdersInFile(pipelineFile, pipelinePlaceholders(slug))

                fastify.log.info(`✅ Pipeline files copied from ${template.type}/${template.compiler}/${repositoryType}`)
            } else {
                fastify.log.warn(`⚠️ Pipeline path not found: ${pipelinePath}`)
            }
        } else {
            fastify.log.warn("⚠️ Template type or compiler not specified, skipping pipeline setup")
        }

        if (options?.placeholders) {
            await this.replacePlaceholdersInDirectory(tempDir, options.placeholders)
        }

        if (options?.microfrontendSlug) {
            await this.replaceFederationNameInConfigs(tempDir, federationName(options.microfrontendSlug))
        }

        // Stage + commit
        try {
            await git.branch({
                fs,
                dir: tempDir,
                ref: "main",
                checkout: true,
                force: true
            })
            await git.add({ fs, dir: tempDir, filepath: "." })
            await git.commit({
                fs,
                dir: tempDir,
                message: "Initial commit",
                author: {
                    name: "MFE Orchestrator Bot",
                    email: "bot@mfe-orchestrator.dev"
                }
            })

            // Push creates "main" on remote if missing
            await git.push({
                fs,
                http,
                dir: tempDir,
                remote: "origin",
                ref: "main",
                remoteRef: "main",
                headers: { "User-Agent": "mfe-orchestrator" },
                onAuth: () => ({ username: accessToken, password: "x-oauth-basic" }),
                force: true
            })

            console.log("✅ Repo is ready and pushed!")
            return tempDir
        } catch (e) {
            console.error("‼️ Error pushing to remote: ", e)
            const remotes = await git.listRemotes({ fs, dir: tempDir })
            // A remote URL can carry the access token: never written to the log
            console.log(
                "🔍 Known remotes:",
                remotes.map(remote => ({ ...remote, url: remote.url.replace(/\/\/[^/@]*@/, "//***@") }))
            )

            const branches = await git.listBranches({ fs, dir: tempDir })
            console.log("🔍 Local branches:", branches)

            const remoteBranches = await git.listBranches({ fs, dir: tempDir, remote: "origin" }).catch(() => [])
            console.log("🔍 Remote branches:", remoteBranches)
        }
    }

    async createPipelineAzureDevOps(repositoryName: string, codeRepository: ICodeRepository) {
        if (!codeRepository.azureData) {
            throw new Error("Azure data is not set")
        }

        const accessToken = codeRepository.accessToken
        const azureDevOpsClient = new AzureDevOpsClient()

        try {
            // Get repository details to obtain the repository ID
            const repository = await azureDevOpsClient.getRepository(accessToken, codeRepository.azureData.organization, codeRepository.azureData.projectId, repositoryName)

            // Create the pipeline
            const pipeline = await azureDevOpsClient.createPipeline(
                accessToken,
                codeRepository.azureData.organization,
                codeRepository.azureData.projectId,
                repository.id,
                `${repositoryName}`,
                "azure-pipelines.yml",
                "/"
            )

            fastify.log.info(`✅ Pipeline created successfully: ${pipeline.name} (ID: ${pipeline.id})`)
            fastify.log.info(`🔗 Pipeline URL: ${pipeline._links.web.href}`)

            return pipeline
        } catch (error: unknown) {
            fastify.log.error(`❌ Failed to create pipeline for repository ${repositoryName}:` + error)
            throw new Error(`Failed to create Azure DevOps pipeline: ${error}`)
        }
    }

    async injectTemplateGithub(slug: string, githubToken: string, repoUrl: string, repositoryType: string, template: IMarket, options?: ScaffoldOptions) {
        const templateUrl = template.zipUrl
        if (!templateUrl) {
            throw new Error("Template url is not set")
        }

        // Download + unzip template
        const tempDir = await this.downloadZip("template", templateUrl)

        const codeManagementService = new CodeManagementService(CodeRepositoryProvider.GITHUB, githubToken, tempDir)
        await codeManagementService.cloneRepository({
            repositoryUrl: repoUrl,
            initializeInCaseOfEmptyRepo: true
        })

        await this.flattenTemplate(tempDir)

        // Copy pipelines
        if (template.type && template.compiler) {
            //Download piplines data
            const tempDirPipelines = await this.downloadZip("template-pipelines", pipelinesUrl)

            const pipelinePath = join(tempDirPipelines, "template-pipelines-main", template.type, template.compiler, repositoryType)

            // Check if the pipeline path exists
            if (await fs.pathExists(pipelinePath)) {
                const githubDir = join(tempDir, ".github")

                // Ensure .github directory exists
                await fs.ensureDir(githubDir)

                // Copy all contents from pipeline path to .github directory
                await fs.copy(pipelinePath, githubDir, { overwrite: true })

                // Replace placeholders in all copied files
                await this.replacePlaceholdersInDirectory(githubDir, pipelinePlaceholders(slug))

                fastify.log.info(`✅ Pipeline files copied from ${template.type}/${template.compiler}/${repositoryType}`)
            } else {
                fastify.log.warn(`⚠️ Pipeline path not found: ${pipelinePath}`)
            }
        } else {
            fastify.log.warn("⚠️ Template type or compiler not specified, skipping pipeline setup")
        }

        if (options?.placeholders) {
            await this.replacePlaceholdersInDirectory(tempDir, options.placeholders)
        }

        if (options?.microfrontendSlug) {
            await this.replaceFederationNameInConfigs(tempDir, federationName(options.microfrontendSlug))
        }

        // Stage + commit
        try {
            await git.branch({
                fs,
                dir: tempDir,
                ref: "main",
                checkout: true,
                force: true
            })
            await git.add({ fs, dir: tempDir, filepath: "." })
            await git.commit({
                fs,
                dir: tempDir,
                message: "Initial commit",
                author: {
                    name: "MFE Orchestrator Bot",
                    email: "bot@mfe-orchestrator.dev"
                }
            })

            await codeManagementService.pushRepository({
                branch: "main"
            })

            console.log("✅ Repo is ready and pushed!")
            return tempDir
        } catch (e) {
            console.error("‼️ Error pushing to remote: ", e)
            const remotes = await git.listRemotes({ fs, dir: tempDir })
            // A remote URL can carry the access token: never written to the log
            console.log(
                "🔍 Known remotes:",
                remotes.map(remote => ({ ...remote, url: remote.url.replace(/\/\/[^/@]*@/, "//***@") }))
            )

            const branches = await git.listBranches({ fs, dir: tempDir })
            console.log("🔍 Local branches:", branches)

            const remoteBranches = await git.listBranches({ fs, dir: tempDir, remote: "origin" }).catch(() => [])
            console.log("🔍 Remote branches:", remoteBranches)
        }
    }

    async downloadZip(prefixDirectory: string, urlToDownload: string): Promise<string> {
        const temporaryDirectory = join(tmpdir(), `${prefixDirectory}-${Date.now()}`)
        const responseDownload = await axios.get(urlToDownload, {
            responseType: "arraybuffer"
        })
        if (responseDownload.status !== 200) throw new Error(`Failed to download pipelines: ${responseDownload.statusText}`)

        const zip = new AdmZip(Buffer.from(responseDownload.data))
        // Keep the permissions: an executable such as mvnw must stay executable in the commit
        zip.extractAllTo(temporaryDirectory, true, true)

        return temporaryDirectory
    }

    /** A provider zip holds a single top-level folder (`<repo>-main/`): its content moves up to the root */
    private async flattenTemplate(tempDir: string): Promise<void> {
        let files = await fs.readdir(tempDir)
        files = files.filter(f => !f.startsWith(".")) // Ignore hidden files

        if (files.length === 1) {
            const top = join(tempDir, files[0])
            const stat = await fs.lstat(top)
            if (stat.isDirectory()) {
                const items = await fs.readdir(top)
                for (const item of items) {
                    try {
                        await fs.move(join(top, item), join(tempDir, item), {
                            overwrite: true
                        })
                    } catch (err) {
                        console.error(`Error moving ${item}:`, err)
                    }
                }
                try {
                    await fs.remove(top)
                } catch (err) {
                    console.error(`Error removing top-level folder:`, err)
                }
            }
        }
    }

    /** Writes `name` on the marked federation name line of each webpack config at the root of the template */
    async replaceFederationNameInConfigs(directory: string, name: string): Promise<void> {
        for (const file of FEDERATION_NAME_FILES) {
            const filePath = join(directory, file)
            if (!(await fs.pathExists(filePath))) continue

            const content = await fs.readFile(filePath, "utf8")
            const updatedContent = replaceFederationName(content, name)
            if (content !== updatedContent) {
                await fs.writeFile(filePath, updatedContent, "utf8")
                fastify.log.info(`✅ Federation name set to ${name} in ${file}`)
            }
        }
    }

    /** Replaces each placeholder with its value in `filePath`, unless it is binary (any NUL byte) */
    async replacePlaceholdersInFile(filePath: string, placeholders: Record<string, string>): Promise<void> {
        try {
            const buffer = await fs.readFile(filePath)
            if (buffer.includes(0)) return

            const content = buffer.toString("utf8")
            let updatedContent = content
            for (const [placeholder, value] of Object.entries(placeholders)) {
                updatedContent = updatedContent.split(placeholder).join(value)
            }

            if (content !== updatedContent) {
                await fs.writeFile(filePath, updatedContent, "utf8")
                fastify.log.info(`✅ Replaced placeholders in ${filePath}`)
            }
        } catch (error) {
            // Skip files that can't be read
            fastify.log.debug(`Skipping file ${filePath}: ${error}`)
        }
    }

    /**
     * Replaces each placeholder with its value in every text file under `directory`. The `.git`
     * folder is never entered, and binary files (any NUL byte) are left alone.
     */
    async replacePlaceholdersInDirectory(directory: string, placeholders: Record<string, string>): Promise<void> {
        const processDirectory = async (dir: string) => {
            const items = await fs.readdir(dir)

            for (const item of items) {
                const fullPath = path.join(dir, item)
                const stats = await fs.lstat(fullPath)

                if (stats.isDirectory()) {
                    if (item !== ".git") {
                        await processDirectory(fullPath)
                    }
                } else if (stats.isFile()) {
                    await this.replacePlaceholdersInFile(fullPath, placeholders)
                }
            }
        }

        await processDirectory(directory)
    }

    /**
     * Tags `ref` (main by default) of the linked repository with `version`: the tag is what starts
     * the release pipeline. Nothing happens when no repository is linked. The connection must belong
     * to `projectId`, the project of what is built: one of another project would lend it its token.
     */
    async createTag(link: ICodeRepositoryMicrofrontend | undefined, projectId: unknown, version: string, ref?: string): Promise<void> {
        if (!link?.enabled) return

        const codeRepository = await CodeRepository.findById(link.codeRepositoryId)
        if (!codeRepository || String(codeRepository.projectId) !== String(projectId)) {
            throw new EntityNotFoundError(String(link.codeRepositoryId))
        }

        const repositoryId = link.repositoryId
        const branchName = ref || "main"

        if (codeRepository.provider === CodeRepositoryProvider.GITHUB) {
            const githubClient = new GithubClient()
            const commitSha = await githubClient.getBranchCommitSha(codeRepository.accessToken, link.name, branchName, codeRepository.githubData?.organizationId, codeRepository.githubData?.userName)
            return await githubClient.createTag(codeRepository.accessToken, link.name, version, commitSha, codeRepository.githubData?.organizationId, codeRepository.githubData?.userName)
        } else if (codeRepository.provider === CodeRepositoryProvider.GITLAB) {
            const gitlabClient = new GitlabClient(codeRepository.gitlabData?.url || "", codeRepository.accessToken)

            const commitSha = await gitlabClient.getBranchCommitSha(repositoryId, branchName)
            return await gitlabClient.createTag(repositoryId, version, commitSha)
        } else if (codeRepository.provider === CodeRepositoryProvider.AZURE_DEV_OPS) {
            const azureClient = new AzureDevOpsClient()
            if (!codeRepository.azureData) {
                throw new Error("Azure DevOps data not found")
            }

            const commitId = await azureClient.getBranchCommitId(codeRepository.accessToken, codeRepository.azureData.organization, codeRepository.azureData.projectId, repositoryId, branchName)
            return await azureClient.createTag(codeRepository.accessToken, codeRepository.azureData.organization, codeRepository.azureData.projectId, repositoryId, version, commitId)
        }
    }
}

export default TemplateScaffoldService
