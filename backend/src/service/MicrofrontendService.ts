import { ClientSession, ObjectId, Types } from "mongoose"
import Microfrontend, { HostedOn, IMicrofrontend } from "../models/MicrofrontendModel"

import MicrofrontendDTO from "../types/MicrofrontendDTO"
import BaseAuthorizedService from "./BaseAuthorizedService"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import { runInTransaction } from "../utils/runInTransaction"
import { MultipartFile } from "@fastify/multipart"
import path from "path"
import fs from "fs"
import unzipper from "unzipper"
import os from "os"
import { fastify } from ".."
import Project, { IProject } from "../models/ProjectModel"
import Storage, { IStorage, StorageType } from "../models/StorageModel"
import GoogleStorageClient from "../client/GoogleStorageAccount"
import S3BucketClient from "../client/S3Buckets"
import AzureStorageClient from "../client/AzureStorageAccount"
import AzureDevOpsClient from "../client/AzureDevOpsClient"
import CodeRepository, { CodeRepositoryProvider } from "../models/CodeRepositoryModel"
import GithubClient from "../client/GithubClient"
import GitlabClient from "../client/GitlabClient"
import BuiltFrontend from "../models/BuiltFrontendModel"

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

        const codeRepository = await CodeRepository.findById(microfrontend.codeRepository.repositoryId)

        if (codeRepository) {
            if (codeRepository.provider === CodeRepositoryProvider.AZURE_DEV_OPS) {
                const azureDevOpsClient = new AzureDevOpsClient()
                await azureDevOpsClient.createRepository(codeRepository.accessToken, codeRepository.name, microfrontend.codeRepository.azure.projectId, microfrontend.codeRepository.name)
            } else if (codeRepository.provider === CodeRepositoryProvider.GITLAB) {
                if (!codeRepository.gitlabData?.url) {
                    throw new Error("Gitlab url is not set")
                }
                const gitlabClient = new GitlabClient(codeRepository.gitlabData?.url, codeRepository.accessToken)
                await gitlabClient.createRepository({
                    name: microfrontend.codeRepository.name,
                    path: microfrontend.codeRepository.gitlab.path,
                    visibility: microfrontend.codeRepository.gitlab.private ? "private" : "public"
                })
            } else if (codeRepository.provider === CodeRepositoryProvider.GITHUB) {
                const githubClient = new GithubClient()
                await githubClient.createRepository({
                    name: microfrontend.codeRepository.name,
                    private: microfrontend.codeRepository.github.private,
                    visibility: microfrontend.codeRepository.github.private ? "private" : "public"
                }, codeRepository.accessToken, microfrontend.codeRepository.github.organizationId)
            }
        }

        return await Microfrontend.create({ ...microfrontend, projectId: projectIdObj })
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

        await Microfrontend.deleteMany({ slug: slugToFind, environmentId: { $in: targetEnvironmentsObj }, session })

        await Promise.all(targetEnvironmentIds.map(async targetEnvironmentId => Microfrontend.create({ ...microfrontend, environmentId: targetEnvironmentId }, { session })))
    }

    async uploadWithPermissionCheck(microfrontendSlug: string, version: string, projectId: string, file: MultipartFile): Promise<void> {
        const project = await Project.findById(projectId)
        if (!project) {
            throw new EntityNotFoundError(projectId)
        }
        const microfrontend = await Microfrontend.findOne({ slug: microfrontendSlug, projectId })
        if (!microfrontend) {
            throw new EntityNotFoundError(microfrontendSlug)
        }

        // Validate that the file is a ZIP
        if (file.mimetype !== 'application/zip' && !file.filename?.endsWith('.zip')) {
            throw new Error('File must be a ZIP archive')
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
            version,
        })
    }

    async uploadToCloudSource(storageId: string | ObjectId, project: IProject, microfrontendSlug: string, version: string, file: MultipartFile) {
        const storage = await Storage.findById(storageId)

        if (!storage) {
            throw new EntityNotFoundError("Storage not found for id " + storageId.toString())
        }

        const pathToWrite = project.slug + "-" + project._id.toString() + "/" + microfrontendSlug + "/" + version

        // Validate that the file is a ZIP
        if (file.mimetype !== 'application/zip' && !file.filename?.endsWith('.zip')) {
            throw new Error('File must be a ZIP archive')
        }

        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unzip-'))
        try {
            const extractDir = path.join(tempDir, 'extracted')
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
            const s3Path = path.posix.join(s3BasePath, relativePath.replace(/\\/g, '/'))
            await s3Client.uploadFile(s3Path, content)
        }

        await this.processDirectoryRecursive(localDir, uploadFile)
    }

    private async uploadDirectoryToGoogle(localDir: string, gcsBasePath: string, googleClient: GoogleStorageClient): Promise<void> {
        const uploadFile = async (filePath: string, relativePath: string) => {
            const content = fs.readFileSync(filePath)
            const gcsPath = path.posix.join(gcsBasePath, relativePath.replace(/\\/g, '/'))
            await googleClient.uploadFile(gcsPath, content)
        }

        await this.processDirectoryRecursive(localDir, uploadFile)
    }

    private async uploadDirectoryToAzure(localDir: string, azureBasePath: string, azureClient: AzureStorageClient): Promise<void> {
        const uploadFile = async (filePath: string, relativePath: string) => {
            const content = fs.readFileSync(filePath)
            const azurePath = path.posix.join(azureBasePath, relativePath.replace(/\\/g, '/'))
            await azureClient.uploadFile(azurePath, content)
        }

        await this.processDirectoryRecursive(localDir, uploadFile)
    }

    private async processDirectoryRecursive(
        localDir: string, 
        fileHandler: (filePath: string, relativePath: string) => Promise<void>
    ): Promise<void> {
        const processDirectory = async (dir: string, basePath: string = '') => {
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

    async build(microfrontendId: string, version: string): Promise<void> {
        const microfrontend = await this.getById(microfrontendId)
        if (!microfrontend) {
            throw new EntityNotFoundError(microfrontendId)
        }
        await this.ensureAccessToMicrofrontend(microfrontend)
        
        if(!microfrontend.codeRepository?.enabled) return;

        const codeRepository = await CodeRepository.findById(microfrontend.codeRepository.repositoryId)
        if(!codeRepository) {
            throw new EntityNotFoundError(microfrontend.codeRepository.repositoryId.toString())
        }

        if(codeRepository.provider === CodeRepositoryProvider.GITHUB) {
            const githubClient = new GithubClient()
            if(!codeRepository.githubData) {
                throw new Error("Github data not set")
            }
            await githubClient.createBuild({
                name: microfrontend.codeRepository.name,
                version: version
            }, codeRepository.accessToken)
        }
    }

    async getVersionsById(id: string){
        const microfrontend = await this.getById(id)
        if(!microfrontend){
            throw new EntityNotFoundError(id)
        }
        return BuiltFrontend.find({ microfrontendId: microfrontend._id }).select("version").distinct("version")
    }

    ensureAccessToMicrofrontend(microfrontend: IMicrofrontend) {
        return this.ensureAccessToProject(microfrontend.projectId)
    }
}

export default MicrofrontendService
