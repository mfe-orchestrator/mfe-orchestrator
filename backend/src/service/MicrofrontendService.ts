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
import { ApiKeyRole } from "../models/ApiKeyModel"
import BuiltFrontend, { IBuiltFrontend } from "../models/BuiltFrontendModel"
import CodeRepository from "../models/CodeRepositoryModel"
import Microfrontend, { HostedOn, IHostMicrofrontend, IMicrofrontend, MicrofrontendKind } from "../models/MicrofrontendModel"
import Project, { IProject } from "../models/ProjectModel"
import Storage, { StorageType } from "../models/StorageModel"
import MicrofrontendDTO from "../types/MicrofrontendDTO"
import { MicrofrontendStackSource, parseCompiler, parseFramework } from "../types/MicrofrontendStack"
import { toObjectId } from "../utils/mongooseUtils"
import BaseAuthorizedService from "./BaseAuthorizedService"
import MarketService from "./MarketService"
import TemplateScaffoldService from "./TemplateScaffoldService"
import { forgetMicrofrontends } from "./workspace/workspaceCleanup"

/** What a microfrontend is served by when neither the caller nor a template says otherwise. */
const DEFAULT_ENTRY_POINT = "assets/remoteEntry.js"

/** A host given without an entry point gets the template's, when there is one: one given is kept */
const withEntryPoint = (host: IHostMicrofrontend, entryPoint?: string): IHostMicrofrontend => (entryPoint && !host.entryPoint ? { ...host, entryPoint } : host)

const isDuplicateKeyError = (error: unknown): boolean => (error as { code?: number })?.code === 11000

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0

/**
 * Refuses update operators and dotted paths: `{"$set": {"projectId": ...}}` or `{"codeRepository.codeRepositoryId": ...}`
 * would reach Mongo past every check here, moving the microfrontend or lending it a connection of another project.
 */
const ensurePlainFields = (fields: object) => {
    const key = Object.keys(fields).find(candidate => candidate.startsWith("$") || candidate.includes("."))
    if (key) {
        throw createBusinessException({ code: "MICROFRONTEND_INVALID", message: `"${key}" is not a field: update operators and dotted paths are refused` })
    }
}

/** What the CI pipeline of a FRONTEND sends once it pushed the image of a tagged version */
interface VersionRegistration {
    image: string
    digest?: string
    commitSha?: string
}

/**
 * The body the CI posts once it pushed an image. It arrives with an API key only, from a pipeline
 * nobody watches: a malformed one is refused with a 400 rather than stored half filled.
 */
const parseRegistration = (body: unknown): VersionRegistration => {
    const registration = (body ?? {}) as Record<string, unknown>
    if (!isNonEmptyString(registration.image)) {
        throw createBusinessException({ code: "MICROFRONTEND_VERSION_IMAGE_REQUIRED", message: "The image reference is required, e.g. ghcr.io/acme/shell:1.2.0" })
    }
    for (const field of ["digest", "commitSha"] as const) {
        if (registration[field] !== undefined && typeof registration[field] !== "string") {
            throw createBusinessException({ code: "MICROFRONTEND_VERSION_INVALID", message: `${field} must be a string` })
        }
    }
    return {
        image: registration.image.trim(),
        digest: (registration.digest as string | undefined)?.trim() || undefined,
        commitSha: (registration.commitSha as string | undefined)?.trim() || undefined
    }
}

/**
 * The repository part of an image reference, without tag nor digest:
 * `host:5000/acme/shell:1.2.0@sha256:…` → `host:5000/acme/shell`. A colon before the last slash
 * is a registry port, not a tag.
 */
const imageRepositoryOf = (image: string): string => {
    const withoutDigest = image.split("@")[0]
    const tagAt = withoutDigest.lastIndexOf(":")
    return tagAt > withoutDigest.lastIndexOf("/") ? withoutDigest.slice(0, tagAt) : withoutDigest
}

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

/** Semver precedence of two pre-release tags (`alpha.1` < `alpha.2` < `beta`). */
const comparePrerelease = (a: string, b: string): number => {
    const left = a.split(".")
    const right = b.split(".")
    for (let index = 0; index < Math.min(left.length, right.length); index++) {
        const [x, y] = [left[index], right[index]]
        const [xNumeric, yNumeric] = [/^\d+$/.test(x), /^\d+$/.test(y)]
        if (xNumeric && yNumeric && Number(x) !== Number(y)) return Number(x) - Number(y)
        if (xNumeric !== yNumeric) return xNumeric ? -1 : 1
        if (x !== y) return x < y ? -1 : 1
    }
    return left.length - right.length
}

/**
 * Whether `candidate` should become the version of a FRONTEND: always when it has none yet, otherwise
 * only when both are semver and `candidate` is newer. Tags that are not semver (`latest`, a commit sha)
 * cannot be ordered: they are registered as versions but never move the FRONTEND.
 */
const isNewerVersion = (candidate: string, current?: string): boolean => {
    if (!current?.trim()) return true
    const next = SEMVER.exec(candidate)
    const previous = SEMVER.exec(current)
    if (!next || !previous) return false
    for (let part = 1; part <= 3; part++) {
        const difference = Number(next[part]) - Number(previous[part])
        if (difference !== 0) return difference > 0
    }
    // A release ranks above its pre-releases.
    if (!next[4] || !previous[4]) return !next[4] && Boolean(previous[4])
    return comparePrerelease(next[4], previous[4]) > 0
}

const ensureValidKind = (kind: unknown) => {
    if (kind !== undefined && !Object.values(MicrofrontendKind).includes(kind as MicrofrontendKind)) {
        throw createBusinessException({ code: "MICROFRONTEND_KIND_INVALID", message: `kind must be one of ${Object.values(MicrofrontendKind).join(", ")}` })
    }
}

/**
 * A FRONTEND is the top of its tree: it is served by its own container, so nothing can load it as a
 * remote. Checked wherever parentIds is written, so no path leaves a FRONTEND with a parent.
 */
const frontendCannotHaveParents = (slug?: string) =>
    createBusinessException({
        code: "FRONTEND_CANNOT_HAVE_PARENTS",
        message: `${slug ? `"${slug}" is a FRONTEND` : "A FRONTEND"}: it is served by its own container and cannot be a remote of another microfrontend`
    })

const ensureFrontendHasNoParents = (kind: MicrofrontendKind | undefined, parentIds: unknown[] | undefined, slug?: string) => {
    if (kind === MicrofrontendKind.FRONTEND && parentIds && parentIds.length > 0) {
        throw frontendCannotHaveParents(slug)
    }
}

/** Matches a document with no parents: what a write making it a FRONTEND requires of what is stored at that moment */
const WITHOUT_PARENTS = { $or: [{ parentIds: { $exists: false } }, { parentIds: { $size: 0 } }] }

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

    async create(dto: MicrofrontendDTO, projectId: string | Schema.Types.ObjectId): Promise<IMicrofrontend> {
        const projectIdObj = toObjectId(projectId)
        await this.ensureAccessToProject(projectIdObj)

        ensurePlainFields(dto)
        ensureValidKind(dto.kind)
        ensureFrontendHasNoParents(dto.kind, dto.parentIds, dto.slug)
        const microfrontend = { ...dto }

        // Both before the repository is created: a missing version or a taken slug would leave an orphan repository behind.
        // A FRONTEND starts without a version: its first registered image sets it
        if (dto.kind !== MicrofrontendKind.FRONTEND && (typeof dto.version !== "string" || !dto.version.trim())) {
            throw createBusinessException({ code: "MICROFRONTEND_VERSION_REQUIRED", message: "A MICROFRONTEND needs a version" })
        }
        if (await Microfrontend.exists({ slug: microfrontend.slug, projectId: projectIdObj })) {
            throw createBusinessException({ code: "MICROFRONTEND_SLUG_TAKEN", message: `A microfrontend with slug "${microfrontend.slug}" already exists in this project`, statusCode: 409 })
        }

        // The file the template's build serves the microfrontend by: index.js for a single-spa
        // application, parcel.js for a micro-lc parcel, remoteEntry.js for webpack
        let templateEntryPoint: string | undefined

        if (microfrontend.codeRepository && microfrontend.codeRepository.enabled) {
            const codeRepository = await CodeRepository.findById(microfrontend.codeRepository.codeRepositoryId)
            // A connection of another project would lend this one its access token
            if (!codeRepository || String(codeRepository.projectId) !== String(projectIdObj)) {
                throw new EntityNotFoundError(String(microfrontend.codeRepository.codeRepositoryId))
            }

            if (microfrontend?.codeRepository?.createData) {
                await this.ensureNotViewer(projectIdObj, { code: "REPOSITORY_CREATE_FORBIDDEN", message: "A viewer cannot create a code repository" })
                const template = microfrontend.codeRepository.createData.template ? await new MarketService().getSingle(microfrontend.codeRepository.createData.template) : null

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
            host: microfrontend.host ? withEntryPoint(microfrontend.host, templateEntryPoint) : await this.defaultHost(projectIdObj, templateEntryPoint),
            projectId: projectIdObj
        } as unknown as IMicrofrontend)
    }

    /**
     * The hosting the console preselects for a new microfrontend: the project's default storage,
     * or the MFE Orchestrator hub when it has none, with the template's entry point when it was
     * created from one. Applied when a caller (the assistant, an MCP client) creates one without
     * saying where it is served from.
     */
    private async defaultHost(projectId: ReturnType<typeof toObjectId>, templateEntryPoint?: string): Promise<IHostMicrofrontend> {
        const entryPoint = templateEntryPoint || DEFAULT_ENTRY_POINT
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
        // in the upload URL the CI of the repository calls
        const { _id: _mongoId, projectId: _projectId, slug: _slug, ...fields } = updates as Partial<MicrofrontendDTO> & { _id?: unknown; projectId?: unknown }
        ensurePlainFields(fields)
        ensureValidKind(fields.kind)
        const kind = fields.kind ?? microfrontend.kind
        // Both sides of the rule can change here: parents given to a FRONTEND, or a microfrontend with parents made one
        ensureFrontendHasNoParents(kind, fields.parentIds ?? microfrontend.parentIds, microfrontend.slug)
        const allowed: Partial<MicrofrontendDTO> & Record<string, unknown> = { ...fields }
        // The orchestrator draws no canary for a FRONTEND: one left enabled would only mislead the console
        if (kind === MicrofrontendKind.FRONTEND && allowed.canary) {
            allowed.canary = { ...allowed.canary, enabled: false }
        } else if (kind === MicrofrontendKind.FRONTEND && microfrontend.kind !== MicrofrontendKind.FRONTEND && microfrontend.canary) {
            allowed["canary.enabled"] = false
        }
        // Checked once the link is enabled, as in create: a disabled link lends no token, and refusing it
        // would block every edit of a microfrontend whose connection was deleted since
        if (allowed.codeRepository?.enabled) {
            const codeRepository = await CodeRepository.findById(allowed.codeRepository.codeRepositoryId)
            // A connection of another project would lend this one its access token
            if (!codeRepository || String(codeRepository.projectId) !== String(microfrontend.projectId)) {
                throw new EntityNotFoundError(String(allowed.codeRepository.codeRepositoryId))
            }
        }

        if (kind !== MicrofrontendKind.FRONTEND || fields.parentIds !== undefined) {
            return await Microfrontend.findByIdAndUpdate(microfrontendIdObj, allowed, { new: true, runValidators: true })
        }
        // Conditional on the parents stored when it is written: a relation set since the check above makes it miss
        const result = await Microfrontend.findOneAndUpdate({ _id: microfrontend._id, ...WITHOUT_PARENTS }, allowed, { new: true, runValidators: true })
        if (!result) {
            throw frontendCannotHaveParents(microfrontend.slug)
        }
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
        // Its container serves its files: the CI registers the image instead, see registerVersionWithPermissionCheck
        if (microfrontend.kind === MicrofrontendKind.FRONTEND) {
            throw createBusinessException({
                code: "FRONTEND_UPLOAD_NOT_ALLOWED",
                message: `"${microfrontendSlug}" is a FRONTEND: it is served by its own container, register the version of its image instead of uploading a bundle`
            })
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
        // A kind switch leaves the versions of the other kind behind: a bundle has no image, a registered image has one
        return BuiltFrontend.find({ microfrontendId: microfrontend._id, image: { $exists: microfrontend.kind === MicrofrontendKind.FRONTEND } })
            .select("version")
            .distinct("version")
    }

    /** What was built of each version, newest first: for a FRONTEND the image the CI registered with it */
    async getBuildsById(id: string): Promise<IBuiltFrontend[]> {
        const microfrontend = await this.getById(id)
        if (!microfrontend) {
            throw new EntityNotFoundError(id)
        }
        return await BuiltFrontend.find({ microfrontendId: microfrontend._id }).sort({ createdAt: -1 })
    }

    /**
     * Called by the CI of a FRONTEND with the deploy API key once the image of `version` is pushed:
     * registering the same version again replaces what was stored for it, the FRONTEND
     * moves to `version` only when it is newer and learns its image repository from the first
     * registration. A MICROFRONTEND uploads its bundle instead. MANAGER keys only.
     */
    async registerVersionWithPermissionCheck(microfrontendSlug: string, version: string, projectId: string, body: unknown, apiKeyRole?: ApiKeyRole): Promise<IBuiltFrontend> {
        if (apiKeyRole !== ApiKeyRole.MANAGER) {
            throw createBusinessException({ code: "MICROFRONTEND_VERSION_FORBIDDEN", message: "Registering a version requires an API key with the MANAGER role", statusCode: 403 })
        }
        const registration = parseRegistration(body)
        if (typeof version !== "string" || !version.trim()) {
            throw createBusinessException({ code: "MICROFRONTEND_VERSION_INVALID", message: "The version is required" })
        }

        const project = await Project.findById(projectId)
        if (!project) {
            throw new ProjectNotFoundError(projectId)
        }
        const microfrontend = await Microfrontend.findOne({ slug: microfrontendSlug.trim().toLowerCase(), projectId: toObjectId(projectId) })
        if (!microfrontend) {
            throw new EntityNotFoundError(microfrontendSlug)
        }
        if (microfrontend.kind !== MicrofrontendKind.FRONTEND) {
            throw createBusinessException({
                code: "MICROFRONTEND_VERSION_REGISTRATION_NOT_ALLOWED",
                message: `"${microfrontend.slug}" is a MICROFRONTEND: its CI uploads the bundle of a version, there is no image to register`
            })
        }

        const trimmedVersion = version.trim()
        const unset: Record<string, ""> = {}
        if (!registration.digest) unset.digest = ""
        if (!registration.commitSha) unset.commitSha = ""

        const upsert = () =>
            BuiltFrontend.findOneAndUpdate(
                { microfrontendId: microfrontend._id, version: trimmedVersion },
                {
                    $set: {
                        image: registration.image,
                        ...(registration.digest && { digest: registration.digest }),
                        ...(registration.commitSha && { commitSha: registration.commitSha })
                    },
                    ...(Object.keys(unset).length > 0 && { $unset: unset })
                },
                { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
            )
        let built
        try {
            built = await upsert()
        } catch (error) {
            if (!isDuplicateKeyError(error)) throw error
            built = await upsert()
        }

        // Compare and set on the version that was read: two pipelines finishing
        // together cannot move the FRONTEND back to the older of the two
        let current: IMicrofrontend | null = microfrontend
        for (let attempt = 0; current && attempt < 3; attempt++) {
            const updates: Record<string, string> = {}
            if (isNewerVersion(trimmedVersion, current.version)) updates.version = trimmedVersion
            if (!current.image?.repository?.trim()) updates["image.repository"] = imageRepositoryOf(registration.image)
            if (Object.keys(updates).length === 0) break
            const result = await Microfrontend.updateOne({ _id: microfrontend._id, version: current.version ?? null }, { $set: updates })
            if (result.matchedCount > 0) break
            current = await Microfrontend.findById(microfrontend._id)
        }

        return built as IBuiltFrontend
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
        ensureFrontendHasNoParents(remote.kind, [host._id], remote.slug)

        // Conditional on the kind stored when it is written: a switch to FRONTEND since the check above makes it miss
        const updated = await Microfrontend.findOneAndUpdate({ _id: remote._id, kind: { $ne: MicrofrontendKind.FRONTEND } }, { $addToSet: { parentIds: host._id } }, { new: true })
        if (!updated) {
            throw frontendCannotHaveParents(remote.slug)
        }
        return updated
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
