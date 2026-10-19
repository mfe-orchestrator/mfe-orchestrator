import { MultipartFile } from "@fastify/multipart"
import AdmZip from "adm-zip"
import fs from "fs-extra"
import { ClientSession, ObjectId, Schema, Types } from "mongoose"
import os from "os"
import path from "path"
import { fastify } from ".."
import AzureStorageClient from "../client/AzureStorageAccount"
import GoogleStorageClient from "../client/GoogleStorageAccount"
import S3BucketClient from "../client/S3Buckets"
import { createBusinessException } from "../errors/BusinessException"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import { ProjectNotFoundError } from "../errors/ProjectNotFoundError"
import BuiltFrontend from "../models/BuiltFrontendModel"
import CodeRepository from "../models/CodeRepositoryModel"
import Microfrontend, { HostedOn, IHostMicrofrontend, IMicrofrontend } from "../models/MicrofrontendModel"
import Project, { IProject } from "../models/ProjectModel"
import Service from "../models/ServiceModel"
import Storage, { StorageType } from "../models/StorageModel"
import MicrofrontendDTO from "../types/MicrofrontendDTO"
import { MicrofrontendStackSource, parseCompiler, parseFramework } from "../types/MicrofrontendStack"
import { isServiceTemplateType } from "../types/ServiceStack"
import { toObjectId } from "../utils/mongooseUtils"
import BaseAuthorizedService from "./BaseAuthorizedService"
import { resolveDomainId } from "./DomainService"
import MarketService from "./MarketService"
import TemplateScaffoldService from "./TemplateScaffoldService"
import { forgetMicrofrontends } from "./workspace/workspaceCleanup"

export class MicrofrontendService extends BaseAuthorizedService {
    async getById(id: string | ObjectId, session?: ClientSession): Promise<IMicrofrontend | null> {
        const idObj = typeof id === "string" ? new Types.ObjectId(id) : id
        const microfrontend = await Microfrontend.findById(idObj, {}, { session })
        if (!microfrontend) {
            return null
        }
        await this.ensureAccessToMicrofrontend(microfrontend)
        return microfrontend
    }

    async getByProjectId(projectId: string | Schema.Types.ObjectId): Promise<IMicrofrontend[]> {
        const projectIdObj = toObjectId(projectId)
        await this.ensureAccessToProject(projectIdObj)
        return await Microfrontend.find({ projectId: projectIdObj })
    }

    async create(microfrontend: MicrofrontendDTO, projectId: string | Schema.Types.ObjectId): Promise<IMicrofrontend> {
        const projectIdObj = toObjectId(projectId)
        await this.ensureAccessToProject(projectIdObj)

        // Both before the repository is created: a refused domain or a taken slug would leave an orphan repository behind
        if (microfrontend.domainId !== undefined) {
            microfrontend.domainId = await resolveDomainId(microfrontend.domainId, projectIdObj)
        }
        if (await Microfrontend.exists({ slug: microfrontend.slug, projectId: projectIdObj })) {
            throw createBusinessException({ code: "MICROFRONTEND_SLUG_TAKEN", message: `A microfrontend with slug "${microfrontend.slug}" already exists in this project`, statusCode: 409 })
        }

        // The file the template's build serves the microfrontend by: index.js for a single-spa
        // application, parcel.js for a micro-lc parcel, remoteEntry.js for webpack
        let templateEntryPoint: string | undefined

        if (microfrontend.codeRepository && microfrontend.codeRepository.enabled) {
            const codeRepository = await CodeRepository.findById(microfrontend.codeRepository.codeRepositoryId)
            if (!codeRepository) {
                throw new EntityNotFoundError(microfrontend.codeRepository.repositoryId.toString())
            }

            if (microfrontend?.codeRepository?.createData) {
                const template = microfrontend.codeRepository.createData.template ? await new MarketService().getSingle(microfrontend.codeRepository.createData.template) : null

                // Checked before anything is created at the provider: a service template scaffolds a
                // Docker image, which nothing can load as a microfrontend
                if (template && isServiceTemplateType(template.type)) {
                    throw createBusinessException({
                        code: "SERVICE_TEMPLATE_NOT_ALLOWED",
                        message: `"${template.slug}" is a backend service template: create a service from it, not a microfrontend`
                    })
                }

                await new TemplateScaffoldService(this.user).createRepository(codeRepository, microfrontend.codeRepository, microfrontend.slug, template, { microfrontendSlug: microfrontend.slug })

                // The template knows the stack the repository was just scaffolded with: keep it,
                // it is what makes the integration instructions specific to this microfrontend
                if (template) {
                    templateEntryPoint = template.entryPoint
                    microfrontend.template = template.slug
                    microfrontend.stack = {
                        framework: parseFramework(template.framework),
                        compiler: parseCompiler(template.compiler),
                        source: MicrofrontendStackSource.TEMPLATE
                    }
                }

                microfrontend.codeRepository.createData = undefined
            }
        }

        return await Microfrontend.create({
            ...microfrontend,
            host: microfrontend.host ? this.withEntryPoint(microfrontend.host, templateEntryPoint) : await this.defaultHost(projectIdObj, templateEntryPoint),
            projectId: projectIdObj
        } as unknown as IMicrofrontend)
    }

    /** A host given without an entry point gets the template's, when there is one: one given is kept */
    private withEntryPoint(host: IHostMicrofrontend, entryPoint?: string): IHostMicrofrontend {
        return entryPoint && !host.entryPoint ? { ...host, entryPoint } : host
    }

    /**
     * The hosting the console preselects for a new microfrontend: the project's default storage,
     * or the MFE Orchestrator hub when it has none, with the template's entry point when it was
     * created from one. Applied when a caller (the assistant, an MCP client) creates one without
     * saying where it is served from.
     */
    private async defaultHost(projectId: ReturnType<typeof toObjectId>, templateEntryPoint?: string): Promise<IHostMicrofrontend> {
        const entryPoint = templateEntryPoint || "assets/remoteEntry.js"
        const storage = await Storage.findOne({ projectId, default: true }, { _id: 1 })
        if (!storage) {
            return { type: HostedOn.MFE_ORCHESTRATOR_HUB, entryPoint }
        }
        return { type: HostedOn.CUSTOM_SOURCE, storageId: storage._id as unknown as IHostMicrofrontend["storageId"], entryPoint }
    }

    async update(microfrontendId: string | ObjectId, updates: MicrofrontendDTO): Promise<IMicrofrontend | null> {
        const microfrontendIdObj = typeof microfrontendId === "string" ? new Types.ObjectId(microfrontendId) : microfrontendId
        const microfrontend = await this.getById(microfrontendId)
        if (!microfrontend) {
            throw new EntityNotFoundError(microfrontendIdObj.toString())
        }
        await this.ensureAccessToMicrofrontend(microfrontend)

        // Never moved to another project, nor given another identity, through an update: the slug is
        // in the upload URL the CI of the repository calls, as for a service
        const { _id: _mongoId, projectId: _projectId, slug: _slug, ...allowed } = updates as Partial<MicrofrontendDTO> & { _id?: unknown; projectId?: unknown }
        if (allowed.domainId !== undefined) {
            allowed.domainId = await resolveDomainId(allowed.domainId, microfrontend.projectId)
        }

        const result = await Microfrontend.findByIdAndUpdate(microfrontendIdObj, allowed, { new: true })
        return result
    }

    async delete(microfrontendId: string | ObjectId): Promise<IMicrofrontend | null> {
        const microfrontendIdObj = typeof microfrontendId === "string" ? new Types.ObjectId(microfrontendId) : microfrontendId
        const microfrontend = await this.getById(microfrontendId)
        if (!microfrontend) {
            throw new EntityNotFoundError(microfrontendIdObj.toString())
        }
        await this.ensureAccessToMicrofrontend(microfrontend)
        const deleted = await Microfrontend.findByIdAndDelete(microfrontendIdObj)
        await forgetMicrofrontends([microfrontend])
        return deleted
    }

    async bulkDelete(ids: string[]): Promise<number> {
        const microfrontends: IMicrofrontend[] = []
        for (const id of ids) {
            const microfrontend = await this.getById(id)
            if (!microfrontend) {
                throw new EntityNotFoundError(id)
            }
            await this.ensureAccessToMicrofrontend(microfrontend)
            microfrontends.push(microfrontend)
        }

        const result = await Microfrontend.deleteMany({ _id: { $in: ids.map(toObjectId) } })
        await forgetMicrofrontends(microfrontends)
        return result.deletedCount
    }

    async uploadWithPermissionCheck(microfrontendSlug: string, version: string, projectId: string, file: MultipartFile): Promise<void> {
        const project = await Project.findById(projectId)
        if (!project) {
            throw new ProjectNotFoundError(projectId)
        }
        const microfrontend = await Microfrontend.findOne({
            slug: microfrontendSlug,
            projectId: toObjectId(projectId)
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
        } else {
            throw new Error("Microfrontend host type is not supported")
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

            let pathToWriteEnriched = storage.path ? path.join(storage.path, pathToWrite) : pathToWrite
            if (pathToWriteEnriched.startsWith("/")) {
                pathToWriteEnriched = pathToWriteEnriched.substring(1)
            }

            if (storage.type === StorageType.GOOGLE) {
                await this.uploadDirectoryToGoogle(extractDir, pathToWriteEnriched, new GoogleStorageClient(storage.authConfig))
            } else if (storage.type === StorageType.AWS) {
                await this.uploadDirectoryToS3(extractDir, pathToWriteEnriched, new S3BucketClient(storage.authConfig))
            } else if (storage.type === StorageType.AZURE) {
                await this.uploadDirectoryToAzure(extractDir, pathToWriteEnriched, new AzureStorageClient(storage.authConfig))
            }
        } finally {
            // Pulisci i file temporanei
            fs.rmSync(tempDir, { recursive: true, force: true })
        }
    }

    private async extractZipToDirectory(file: MultipartFile, extractDir: string): Promise<void> {
        // Convert stream to buffer
        const buffer = await file.toBuffer()
        const zip = new AdmZip(buffer)
        zip.extractAllTo(extractDir, true)
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

    async build(microfrontendId: string, version: string, ref?: string): Promise<void> {
        const microfrontend = await this.getById(microfrontendId)
        if (!microfrontend) {
            throw new EntityNotFoundError(microfrontendId)
        }
        await this.ensureAccessToMicrofrontend(microfrontend)

        await new TemplateScaffoldService(this.user).createTag(microfrontend.codeRepository, microfrontend.projectId, version, ref)
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

    /** Links a backend service the microfrontend calls: both must belong to the same project. */
    async linkService(microfrontendId: string, serviceId: string): Promise<IMicrofrontend> {
        const microfrontend = await this.getById(microfrontendId)
        if (!microfrontend) {
            throw new EntityNotFoundError(microfrontendId)
        }
        const service = await Service.findById(toObjectId(serviceId))
        if (!service || service.projectId.toString() !== microfrontend.projectId.toString()) {
            throw new EntityNotFoundError(serviceId)
        }

        if (!microfrontend.serviceIds?.some(id => id.toString() === service._id.toString())) {
            microfrontend.serviceIds = [...(microfrontend.serviceIds ?? []), service._id]
        }
        return await microfrontend.save()
    }

    /** No check on the service: a link to a service deleted since must still be removable. */
    async unlinkService(microfrontendId: string, serviceId: string): Promise<IMicrofrontend> {
        const microfrontend = await this.getById(microfrontendId)
        if (!microfrontend) {
            throw new EntityNotFoundError(microfrontendId)
        }
        microfrontend.serviceIds = (microfrontend.serviceIds ?? []).filter(id => id.toString() !== serviceId)
        return await microfrontend.save()
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
