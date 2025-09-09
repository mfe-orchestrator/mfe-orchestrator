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
import { fastify } from ".."
import Project from "../models/ProjectModel"
import Storage, { StorageType } from "../models/StorageModel"
import GoogleStorageClient from "../client/GoogleStorageAccount"
import S3BucketClient from "../client/S3Buckets"
import AzureStorageClient from "../client/AzureStorageAccount"
import AzureDevOpsClient from "../client/AzureDevOpsClient"
import CodeRepository, { CodeRepositoryProvider } from "../models/CodeRepositoryModel"
import GithubClient from "../client/GithubClient"
import GitlabClient from "../client/GitlabClient"

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

        if(codeRepository){
            if (codeRepository.provider === CodeRepositoryProvider.AZURE_DEV_OPS) {
                const azureDevOpsClient = new AzureDevOpsClient()
                await azureDevOpsClient.createRepository(codeRepository.accessToken, codeRepository.name, microfrontend.codeRepository.azure.projectId, microfrontend.codeRepository.name)
            }else if(codeRepository.provider === CodeRepositoryProvider.GITLAB){
                if(!codeRepository.gitlabData?.url){
                    throw new Error("Gitlab url is not set")
                }
                const gitlabClient = new GitlabClient(codeRepository.gitlabData?.url, codeRepository.accessToken)
                await gitlabClient.createRepository({
                    name: microfrontend.codeRepository.name,
                    path: microfrontend.codeRepository.gitlab.path,
                    visibility: microfrontend.codeRepository.gitlab.private ? "private" : "public"
                })
            }else if(codeRepository.provider === CodeRepositoryProvider.GITHUB){
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

        if (microfrontend.host.type === HostedOn.MFE_ORCHESTRATOR_HUB) {
            const basePath = path.join(fastify.config.MICROFRONTEND_HOST_FOLDER, project.slug + "-" + project._id.toString(), microfrontendSlug, version)
            if (!fs.existsSync(basePath)) {
                fastify.log.info("Creating directory " + basePath)
                fs.mkdirSync(basePath, { recursive: true })
            }

            //TODO ensure it is ZIP!!!!!
            await this.pumpStreamToFile(file, basePath)
        } else if (microfrontend.host.type === HostedOn.CUSTOM_URL) {
            throw new Error("Microfrontend host type is not supported")
        } else if (microfrontend.host.type === HostedOn.CUSTOM_SOURCE) {
            if (!microfrontend.host.storageId) {
                throw new EntityNotFoundError("Microfrontend storage id is not set")
            }

            const storage = await Storage.findById(microfrontend.host.storageId)

            if (!storage) {
                throw new EntityNotFoundError("Storage not found for id " + microfrontend.host.storageId.toString())
            }

            const path = project.slug + "-" + project._id.toString() + "/" + microfrontendSlug + "/" + version

            if (storage.type === StorageType.GOOGLE) {
                const googleStorageClient = new GoogleStorageClient(storage.authConfig)
                await googleStorageClient.uploadFile(path, await file.toBuffer())
            } else if (storage.type === StorageType.AWS) {
                const s3Client = new S3BucketClient(storage.authConfig)
                await s3Client.uploadFile(path, await file.toBuffer())
            } else if (storage.type === StorageType.AZURE) {
                storage.authConfig
                const azureStorageClient = new AzureStorageClient(storage.authConfig)
                await azureStorageClient.uploadFile(path, await file.toBuffer())
            }
        }
    }

    ensureAccessToMicrofrontend(microfrontend: IMicrofrontend) {
        return this.ensureAccessToProject(microfrontend.projectId)
    }

    async pumpStreamToFile(stream: MultipartFile, destPath: string) {
        // Stream dal client → unzipper → cartella
        await new Promise((resolve, reject) => {
            stream.file
                .pipe(unzipper.Extract({ path: destPath }))
                .on("close", resolve)
                .on("error", reject)
        })
    }
}

export default MicrofrontendService
