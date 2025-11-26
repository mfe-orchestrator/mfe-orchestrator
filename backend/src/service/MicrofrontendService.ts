import { MultipartFile } from "@fastify/multipart"
import axios from "axios"
import fs from "fs-extra"
import * as git from "isomorphic-git"
import http from "isomorphic-git/http/node"
import { ClientSession, Document, ObjectId, Schema, Types } from "mongoose"
import os, { tmpdir } from "os"
import path, { join } from "path"
import unzipper from "unzipper"
import { fastify } from ".."
import AzureDevOpsClient from "../client/AzureDevOpsClient"
import AzureStorageClient from "../client/AzureStorageAccount"
import GithubClient from "../client/GithubClient"
import GitlabClient from "../client/GitlabClient"
import GoogleStorageClient from "../client/GoogleStorageAccount"
import S3BucketClient from "../client/S3Buckets"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import { ApiKeyRole } from "../models/ApiKeyModel"
import BuiltFrontend from "../models/BuiltFrontendModel"
import CodeRepository, { CodeRepositoryProvider, CodeRepositoryType, ICodeRepository } from "../models/CodeRepositoryModel"
import { IMarket } from "../models/MarketModel"
import Microfrontend, { HostedOn, IMicrofrontend } from "../models/MicrofrontendModel"
import Project, { IProject } from "../models/ProjectModel"
import Storage, { StorageType } from "../models/StorageModel"
import MicrofrontendDTO from "../types/MicrofrontendDTO"
import { runInTransaction } from "../utils/runInTransaction"
import { ApiKeyService } from "./ApiKeyService"
import BaseAuthorizedService from "./BaseAuthorizedService"
import CodeManagementService from "./CodeManagementService"
import { deploySecretName } from "./CodeRepositoryService"
import MarketService from "./MarketService"

const pipelinesUrl = "https://github.com/mfe-orchestrator/template-pipelines/archive/refs/heads/main.zip"
export class MicrofrontendService extends BaseAuthorizedService {
    async getById(id: string | ObjectId, session?: ClientSession): Promise<IMicrofrontend | null> {
        const idObj = typeof id === "string" ? new Types.ObjectId(id) : id
        const microfrontend = await Microfrontend.findById(idObj, {}, { session })
        if (!microfrontend) {
            return null
        }
        this.ensureAccessToMicrofrontend(microfrontend)
        return microfrontend
    }

    async getByProjectId(projectId: string | ObjectId): Promise<IMicrofrontend[]> {
        const projectIdObj = typeof projectId === "string" ? new Types.ObjectId(projectId) : projectId
        await this.ensureAccessToProject(projectIdObj)
        return await Microfrontend.find({ projectId: projectIdObj })
    }

    async create(microfrontend: MicrofrontendDTO, projectId: string | ObjectId): Promise<IMicrofrontend> {
        const projectIdObj = typeof projectId === "string" ? new Types.ObjectId(projectId) : projectId
        await this.ensureAccessToProject(projectIdObj)

        if (microfrontend.codeRepository && microfrontend.codeRepository.enabled) {
            const codeRepository = await CodeRepository.findById(microfrontend.codeRepository.codeRepositoryId)
            if (!codeRepository) {
                throw new EntityNotFoundError(microfrontend.codeRepository.repositoryId.toString())
            }

            if (microfrontend?.codeRepository?.createData) {
                const template = microfrontend.codeRepository.createData.template ? await new MarketService().getSingle(microfrontend.codeRepository.createData.template) : null

                if (codeRepository.provider === CodeRepositoryProvider.AZURE_DEV_OPS) {
                    if (!codeRepository.azureData) {
                        throw new Error("Azure data is not set")
                    }

                    const azureDevOpsClient = new AzureDevOpsClient()
                    const createdRepository = await azureDevOpsClient.createRepository(
                        codeRepository.accessToken,
                        codeRepository.azureData.organization,
                        codeRepository.azureData.projectId,
                        microfrontend.codeRepository.createData.name
                    )
                    microfrontend.codeRepository.repositoryId = createdRepository.id
                    microfrontend.codeRepository.name = createdRepository.name
                    if (template) {
                        await this.injectTemplateAzureDevOps(codeRepository.accessToken, createdRepository.name, codeRepository, "azure_dev_ops", template)
                        await this.createPipelineAzureDevOps(createdRepository.name, codeRepository)
                    }
                } else if (codeRepository.provider === CodeRepositoryProvider.GITLAB) {
                    if (!codeRepository.gitlabData?.url) {
                        throw new Error("Gitlab url is not set")
                    }
                    const gitlabClient = new GitlabClient(codeRepository.gitlabData?.url, codeRepository.accessToken)
                    const createdRepository = await gitlabClient.createRepository({
                        name: microfrontend.codeRepository.createData.name,
                        path: microfrontend.codeRepository.createData.path,
                        visibility: microfrontend.codeRepository.createData.private ? "private" : "public"
                    })
                    microfrontend.codeRepository.repositoryId = createdRepository.name
                } else if (codeRepository.provider === CodeRepositoryProvider.GITHUB) {
                    const githubClient = new GithubClient()
                    const createdRepository = await githubClient.createRepository(
                        {
                            name: microfrontend.codeRepository.createData.name,
                            private: microfrontend.codeRepository.createData.private,
                            visibility: microfrontend.codeRepository.createData.private ? "private" : "public"
                        },
                        codeRepository.accessToken,
                        codeRepository.githubData?.organizationId
                    )
                    microfrontend.codeRepository.repositoryId = createdRepository.id + ""
                    microfrontend.codeRepository.name = createdRepository.name
                    // Now will inject api key
                    await this.gitHubInjectApiKey(codeRepository, microfrontend)
                    // Now will inject the template
                    if (template) {
                        await this.injectTemplateGithub(microfrontend.slug, codeRepository.accessToken, createdRepository.clone_url, "github", template)
                    }
                }

                microfrontend.codeRepository.createData = undefined
            }
        }

        return await Microfrontend.create({
            ...microfrontend,
            projectId: projectIdObj
        })
    }
    async gitHubInjectApiKey(codeRepository: ICodeRepository, microfrontend: MicrofrontendDTO) {
        if (codeRepository.provider !== CodeRepositoryProvider.GITHUB) return
        if (codeRepository.githubData?.type === CodeRepositoryType.ORGANIZATION) return
        if (!microfrontend.codeRepository.name) return

        const githubClient = new GithubClient()

        const exists = await githubClient.checkRepositorySecretExists({
            accessToken: codeRepository.accessToken,
            repositoryName: microfrontend.codeRepository.name,
            secretName: deploySecretName
        })

        if (exists) {
            return
        }

        const apiKey = await new ApiKeyService(this.user).create(codeRepository.projectId.toString(), {
            name: "MFE_ORCHESTRATOR_DEPLOY_SECRET - Github - " + microfrontend.slug,
            role: ApiKeyRole.MANAGER,
            expiresAt: new Date(Date.now() + 3600 * 1000 * 365)
        })

        await githubClient.upsertRepositorySecret({
            accessToken: codeRepository.accessToken,
            userName: codeRepository.githubData?.userName,
            repositoryName: microfrontend.codeRepository.name,
            secretName: deploySecretName,
            value: apiKey.apiKey
        })
    }

    async injectTemplateAzureDevOps(accessToken: string, repositoryName: string, codeRepository: ICodeRepository, repositoryType: string, template: IMarket) {
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

        // Download + unzip template
        const response = await axios.get(templateUrl, { responseType: "stream" })
        if (response.status !== 200) throw new Error(`Failed to download template: ${response.statusText}`)

        await new Promise((resolve, reject) => {
            response.data
                .pipe(unzipper.Extract({ path: tempDir }))
                .on("close", resolve)
                .on("error", reject)
        })

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

        // Copy pipelines
        if (template.type && template.compiler) {
            //Download piplines data
            const tempDirPipelines = await this.downloadZip("template-pipelines", pipelinesUrl)

            const pipelinePath = join(tempDirPipelines, "template-pipelines-main", template.type, template.compiler, repositoryType, "azure-pipelines.yml")

            // Check if the pipeline path exists
            if (await fs.pathExists(pipelinePath)) {
                // Copy all contents from pipeline path to .github directory
                await fs.copyFile(pipelinePath, join(tempDir, "azure-pipelines.yml"))

                // Replace placeholders in all copied files
                //await this.replacePlaceholdersInDirectory(githubDir, mfeSlug)
                // Da fare!!

                fastify.log.info(`✅ Pipeline files copied from ${template.type}/${template.compiler}/${repositoryType}`)
            } else {
                fastify.log.warn(`⚠️ Pipeline path not found: ${pipelinePath}`)
            }
        } else {
            fastify.log.warn("⚠️ Template type or compiler not specified, skipping pipeline setup")
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
            console.log("🔍 Known remotes:", remotes)

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

    async injectTemplateGithub(mfeSlug: string, githubToken: string, repoUrl: string, repositoryType: string, template: IMarket) {
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

        // Flatten GitHub zip (moves contents up)
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
                await this.replacePlaceholdersInDirectory(githubDir, mfeSlug)

                fastify.log.info(`✅ Pipeline files copied from ${template.type}/${template.compiler}/${repositoryType}`)
            } else {
                fastify.log.warn(`⚠️ Pipeline path not found: ${pipelinePath}`)
            }
        } else {
            fastify.log.warn("⚠️ Template type or compiler not specified, skipping pipeline setup")
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
            console.log("🔍 Known remotes:", remotes)

            const branches = await git.listBranches({ fs, dir: tempDir })
            console.log("🔍 Local branches:", branches)

            const remoteBranches = await git.listBranches({ fs, dir: tempDir, remote: "origin" }).catch(() => [])
            console.log("🔍 Remote branches:", remoteBranches)
        }
    }

    async downloadZip(prefixDirectory: string, urlToDownload: string): Promise<string> {
        const temporaryDirectory = join(tmpdir(), `${prefixDirectory}-${Date.now()}`)
        const responseDownload = await axios.get(urlToDownload, {
            responseType: "stream"
        })
        if (responseDownload.status !== 200) throw new Error(`Failed to download pipelines: ${responseDownload.statusText}`)

        await new Promise((resolve, reject) => {
            responseDownload.data
                .pipe(unzipper.Extract({ path: temporaryDirectory, verbose: true }))
                .on("close", resolve)
                .on("error", reject)
        })

        return temporaryDirectory
    }

    async update(microfrontendId: string | ObjectId, updates: MicrofrontendDTO): Promise<IMicrofrontend | null> {
        const microfrontendIdObj = typeof microfrontendId === "string" ? new Types.ObjectId(microfrontendId) : microfrontendId
        const microfrontend = await this.getById(microfrontendId)
        if (!microfrontend) {
            throw new EntityNotFoundError(microfrontendIdObj.toString())
        }
        await this.ensureAccessToMicrofrontend(microfrontend)

        const result = await Microfrontend.findByIdAndUpdate(microfrontendIdObj, updates, { new: true })
        return result
    }

    async delete(microfrontendId: string | ObjectId): Promise<IMicrofrontend | null> {
        const microfrontendIdObj = typeof microfrontendId === "string" ? new Types.ObjectId(microfrontendId) : microfrontendId
        const microfrontend = await this.getById(microfrontendId)
        if (!microfrontend) {
            throw new EntityNotFoundError(microfrontendIdObj.toString())
        }
        await this.ensureAccessToMicrofrontend(microfrontend)
        return await Microfrontend.findByIdAndDelete(microfrontendIdObj)
    }

    async bulkDelete(ids: string[]): Promise<number> {
        for (const id of ids) {
            const microfrontend = await this.getById(id)
            if (!microfrontend) {
                throw new EntityNotFoundError(id)
            }
            await this.ensureAccessToMicrofrontend(microfrontend)
        }

        const result = await Microfrontend.deleteMany({ _id: { $in: ids } })
        return result.deletedCount
    }

    async deploySingle(microfrontendId: string | ObjectId, targetEnvironmentIds: (string | ObjectId)[]): Promise<void> {
        return runInTransaction(async session => this.deploySingleRaw(microfrontendId, targetEnvironmentIds, session))
    }

    async deploySingleRaw(microfrontendId: string | ObjectId, targetEnvironmentIds: (string | ObjectId)[], session?: ClientSession): Promise<void> {
        // Check if microfrontend exists
        const microfrontend = await this.getById(microfrontendId, session)
        if (!microfrontend) {
            throw new EntityNotFoundError(microfrontendId.toString())
        }
        // can i access to this microfrontend?
        await this.ensureAccessToMicrofrontend(microfrontend)

        // Check if target environment exists
        const targetEnvironmentsObj = await Promise.all(
            targetEnvironmentIds.map(async targetEnvironment => {
                const targetEnvironmentObjId = typeof targetEnvironment === "string" ? new Types.ObjectId(targetEnvironment) : targetEnvironment
                await this.ensureAccessToEnvironment(targetEnvironment, session)
                return targetEnvironmentObjId
            })
        )

        // deploy microfrontend
        const slugToFind = microfrontend.slug

        await Microfrontend.deleteMany({
            slug: slugToFind,
            environmentId: { $in: targetEnvironmentsObj },
            session
        })

        await Promise.all(targetEnvironmentIds.map(async targetEnvironmentId => Microfrontend.create({ ...microfrontend, environmentId: targetEnvironmentId }, { session })))
    }

    async uploadWithPermissionCheck(microfrontendSlug: string, version: string, projectId: string, file: MultipartFile): Promise<void> {
        const project = await Project.findById(projectId)
        if (!project) {
            throw new EntityNotFoundError(projectId)
        }
        const microfrontend = await Microfrontend.findOne({
            slug: microfrontendSlug,
            projectId
        })
        if (!microfrontend) {
            throw new EntityNotFoundError(microfrontendSlug)
        }

        // Validate that the file is a ZIP
        if (file.mimetype !== "application/zip" && !file.filename?.endsWith(".zip")) {
            throw new Error("File must be a ZIP archive")
        }

        if (microfrontend.host.type === HostedOn.MFE_ORCHESTRATOR_HUB) {
            const basePath = path.join(fastify.config.MICROFRONTEND_HOST_FOLDER, project.slug + "-" + project._id.toString(), microfrontendSlug, version)
            if (!fs.existsSync(basePath)) {
                fastify.log.info("Creating directory " + basePath)
                fs.mkdirSync(basePath, { recursive: true })
            }

            await this.extractZipToDirectory(file, basePath)
        } else if (microfrontend.host.type === HostedOn.CUSTOM_URL) {
            throw new Error("Microfrontend host type is not supported")
        } else if (microfrontend.host.type === HostedOn.CUSTOM_SOURCE) {
            if (!microfrontend.host.storageId) {
                throw new EntityNotFoundError("Storage id is not set")
            }
            await this.uploadToCloudSource(microfrontend.host.storageId, project, microfrontendSlug, version, file)
        }

        await BuiltFrontend.create({
            microfrontendId: microfrontend._id,
            version
        })
    }

    async uploadToCloudSource(storageId: string | ObjectId, project: IProject, microfrontendSlug: string, version: string, file: MultipartFile) {
        const storage = await Storage.findById(storageId)

        if (!storage) {
            throw new EntityNotFoundError("Storage not found for id " + storageId.toString())
        }

        const pathToWrite = project.slug + "-" + project._id.toString() + "/" + microfrontendSlug + "/" + version

        // Validate that the file is a ZIP
        if (file.mimetype !== "application/zip" && !file.filename?.endsWith(".zip")) {
            throw new Error("File must be a ZIP archive")
        }

        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "unzip-"))
        try {
            const extractDir = path.join(tempDir, "extracted")
            // Estrai direttamente dal stream del file
            await this.extractZipToDirectory(file, extractDir)

            if (storage.type === StorageType.GOOGLE) {
                await this.uploadDirectoryToGoogle(extractDir, pathToWrite, new GoogleStorageClient(storage.authConfig))
            } else if (storage.type === StorageType.AWS) {
                await this.uploadDirectoryToS3(extractDir, pathToWrite, new S3BucketClient(storage.authConfig))
            } else if (storage.type === StorageType.AZURE) {
                const pathToWriteAzure = storage.path ? path.join(storage.path, pathToWrite) : pathToWrite
                await this.uploadDirectoryToAzure(extractDir, pathToWriteAzure, new AzureStorageClient(storage.authConfig))
            }
        } finally {
            // Pulisci i file temporanei
            fs.rmSync(tempDir, { recursive: true, force: true })
        }
    }

    private async extractZipToDirectory(file: MultipartFile, extractDir: string): Promise<void> {
        // Stream dal client → unzipper → cartella
        return new Promise((resolve, reject) => {
            file.file
                .pipe(unzipper.Extract({ path: extractDir }))
                .on("close", resolve)
                .on("error", reject)
        })
    }

    private async uploadDirectoryToS3(localDir: string, s3BasePath: string, s3Client: S3BucketClient): Promise<void> {
        const uploadFile = async (filePath: string, relativePath: string) => {
            const content = fs.readFileSync(filePath)
            const s3Path = path.posix.join(s3BasePath, relativePath.replace(/\\/g, "/"))
            await s3Client.uploadFile(s3Path, content)
        }

        await this.processDirectoryRecursive(localDir, uploadFile)
    }

    private async uploadDirectoryToGoogle(localDir: string, gcsBasePath: string, googleClient: GoogleStorageClient): Promise<void> {
        const uploadFile = async (filePath: string, relativePath: string) => {
            const content = fs.readFileSync(filePath)
            const gcsPath = path.posix.join(gcsBasePath, relativePath.replace(/\\/g, "/"))
            await googleClient.uploadFile(gcsPath, content)
        }

        await this.processDirectoryRecursive(localDir, uploadFile)
    }

    private async uploadDirectoryToAzure(localDir: string, azureBasePath: string, azureClient: AzureStorageClient): Promise<void> {
        const uploadFile = async (filePath: string, relativePath: string) => {
            const content = fs.readFileSync(filePath)
            const azurePath = path.posix.join(azureBasePath, relativePath.replace(/\\/g, "/"))
            await azureClient.uploadFile(azurePath, content)
        }

        await this.processDirectoryRecursive(localDir, uploadFile)
    }

    private async processDirectoryRecursive(localDir: string, fileHandler: (filePath: string, relativePath: string) => Promise<void>): Promise<void> {
        const processDirectory = async (dir: string, basePath: string = "") => {
            const items = fs.readdirSync(dir)

            for (const item of items) {
                const fullPath = path.join(dir, item)
                const relativePath = path.join(basePath, item)
                const stats = fs.statSync(fullPath)

                if (stats.isDirectory()) {
                    await processDirectory(fullPath, relativePath)
                } else if (stats.isFile()) {
                    await fileHandler(fullPath, relativePath)
                }
            }
        }

        await processDirectory(localDir)
    }

    private async replacePlaceholdersInDirectory(directory: string, mfeSlug: string): Promise<void> {
        const processFile = async (filePath: string) => {
            try {
                const content = await fs.readFile(filePath, "utf8")
                const updatedContent = content.replace(/%microfrontendSlug%/g, mfeSlug).replace(/%domain%/g, process.env.BACKEND_URL || "https://console.mfe-orchestrator.dev")

                if (content !== updatedContent) {
                    await fs.writeFile(filePath, updatedContent, "utf8")
                    fastify.log.info(`✅ Replaced placeholders in ${filePath}`)
                }
            } catch (error) {
                // Skip binary files or files that can't be read as text
                fastify.log.debug(`Skipping file ${filePath}: ${error}`)
            }
        }

        const processDirectory = async (dir: string) => {
            const items = await fs.readdir(dir)

            for (const item of items) {
                const fullPath = path.join(dir, item)
                const stats = await fs.lstat(fullPath)

                if (stats.isDirectory()) {
                    await processDirectory(fullPath)
                } else if (stats.isFile()) {
                    await processFile(fullPath)
                }
            }
        }

        await processDirectory(directory)
    }

    async build(microfrontendId: string, version: string, ref?: string): Promise<void> {
        const microfrontend = await this.getById(microfrontendId)
        if (!microfrontend) {
            throw new EntityNotFoundError(microfrontendId)
        }
        await this.ensureAccessToMicrofrontend(microfrontend)

        if (!microfrontend.codeRepository?.enabled) return

        const codeRepository = await CodeRepository.findById(microfrontend.codeRepository.codeRepositoryId)
        if (!codeRepository) {
            throw new EntityNotFoundError(microfrontend.codeRepository.codeRepositoryId.toString())
        }

        if (codeRepository.provider === CodeRepositoryProvider.GITHUB) {
            const githubClient = new GithubClient()
            if (!codeRepository.githubData) {
                throw new Error("Github data not set")
            }
            await githubClient.createBuild(
                {
                    version: version,
                    type: codeRepository.githubData.type,
                    owner: codeRepository.githubData.type === CodeRepositoryType.ORGANIZATION ? codeRepository.githubData.organizationId! : codeRepository.githubData.userName!,
                    repositoryName: microfrontend.codeRepository.name,
                    ref
                },
                codeRepository.accessToken
            )
        }
    }

    async getVersionsById(id: string) {
        const microfrontend = await this.getById(id)
        if (!microfrontend) {
            throw new EntityNotFoundError(id)
        }
        return BuiltFrontend.find({ microfrontendId: microfrontend._id }).select("version").distinct("version")
    }

    async setRelation(hostId: string, remoteId: string): Promise<IMicrofrontend> {
        const host = await this.getById(hostId)
        if (!host) {
            throw new EntityNotFoundError(hostId)
        }
        const remote = await this.getById(remoteId)
        if (!remote) {
            throw new EntityNotFoundError(remoteId)
        }

        await this.ensureAccessToMicrofrontend(host)

        if (remote.parentIds) {
            if (!remote.parentIds.includes(host._id)) {
                remote.parentIds.push(host._id)
            }
        } else {
            remote.parentIds = [host._id]
        }

        return await remote.save()
    }

    async deleteRelation(hostId: string, remoteId: string): Promise<IMicrofrontend> {
        const host = await this.getById(hostId)
        if (!host) {
            throw new EntityNotFoundError(hostId)
        }
        const remote = await this.getById(remoteId)
        if (!remote) {
            throw new EntityNotFoundError(remoteId)
        }

        await this.ensureAccessToMicrofrontend(host)

        if (remote.parentIds) {
            remote.parentIds = remote.parentIds.filter(id => id.toString() !== host._id.toString())
        }

        return await remote.save()
    }

    async setPosition(id: string, x: number, y: number): Promise<IMicrofrontend> {
        const microfrontend = await this.getById(id)
        if (!microfrontend) {
            throw new EntityNotFoundError(id)
        }
        await this.ensureAccessToMicrofrontend(microfrontend)
        if (!microfrontend.position) {
            microfrontend.position = { x, y }
        } else {
            microfrontend.position.x = x
            microfrontend.position.y = y
        }
        return await microfrontend.save()
    }

    async setDimension(id: string, width: number, height: number): Promise<IMicrofrontend> {
        const microfrontend = await this.getById(id)
        if (!microfrontend) {
            throw new EntityNotFoundError(id)
        }
        await this.ensureAccessToMicrofrontend(microfrontend)
        if (!microfrontend.position) {
            microfrontend.position = { width, height }
        } else {
            microfrontend.position.width = width
            microfrontend.position.height = height
        }
        return await microfrontend.save()
    }

    ensureAccessToMicrofrontend(microfrontend: IMicrofrontend) {
        return this.ensureAccessToProject(microfrontend.projectId)
    }
}

export default MicrofrontendService
