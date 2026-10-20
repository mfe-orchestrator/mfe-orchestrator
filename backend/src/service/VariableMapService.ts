import { isValidObjectId, ObjectId, Schema } from "mongoose"
import { createBusinessException } from "../errors/BusinessException"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import Environment from "../models/EnvironmentModel"
import Service, { IService } from "../models/ServiceModel"
import { ConfigMap, IVariableMap, IVariableMapEntry, Secret, variableMapModels } from "../models/VariableMapModel"
import { SERVICE_VARIABLE_KEY } from "../types/ServiceStack"
import VariableMapDTO, { VARIABLE_MAP_NAME, VariableMapEntryDTO, VariableMapKind } from "../types/VariableMapDTO"
import { toObjectId } from "../utils/mongooseUtils"
import { isEncryptedSecret, SECRET_PLACEHOLDER } from "../utils/secretCrypto"
import BaseAuthorizedService from "./BaseAuthorizedService"
import GitOpsService from "./GitOpsService"

/** Per map: well past any real service, short of a document Mongo would refuse */
const MAX_VARIABLE_MAP_ENTRIES = 200
const MAX_VARIABLE_MAP_VALUE_LENGTH = 32 * 1024
/** Per kind attached to one service */
const MAX_ATTACHED_MAPS = 50
const MAX_DESCRIPTION_LENGTH = 2000

/** The field of a service that attaches maps of this kind */
const SERVICE_FIELD: Record<VariableMapKind, "configMapIds" | "secretIds"> = { configMap: "configMapIds", secret: "secretIds" }

const isDuplicateKeyError = (error: unknown): boolean => (error as { code?: number })?.code === 11000

/**
 * The entries as they are stored: keys valid and unique, blank values dropped (the key stays unset in
 * that environment), every environment one of the project and at most once per key. A secret that comes
 * back as the placeholder keeps the value stored for that key and environment; with none to keep, it
 * is refused rather than saved literally.
 */
export const normalizeEntries = (entries: unknown, kind: VariableMapKind, environmentIds: Set<string>, stored: IVariableMapEntry[] = []): VariableMapEntryDTO[] => {
    if (!Array.isArray(entries) || entries.length > MAX_VARIABLE_MAP_ENTRIES) {
        throw createBusinessException({ code: "VARIABLE_MAP_ENTRIES_INVALID", message: `entries must be a list of at most ${MAX_VARIABLE_MAP_ENTRIES} keys` })
    }

    const keys = new Set<string>()
    return entries.map((entry: VariableMapEntryDTO) => {
        const key = typeof entry?.key === "string" ? entry.key.trim() : ""
        if (!SERVICE_VARIABLE_KEY.test(key)) {
            throw createBusinessException({ code: "VARIABLE_MAP_KEY_INVALID", message: `"${key}" is not a valid key: letters, digits and underscores, not starting with a digit` })
        }
        if (keys.has(key)) {
            throw createBusinessException({ code: "VARIABLE_MAP_KEY_DUPLICATED", message: `"${key}" appears more than once` })
        }
        keys.add(key)

        const environments = new Set<string>()
        const values = (Array.isArray(entry.values) ? entry.values : []).flatMap(item => {
            const { environmentId, value } = (item ?? {}) as { environmentId?: unknown; value?: unknown }
            if (typeof value !== "string" || value === "") return []

            const environment = String(environmentId)
            if (!environmentIds.has(environment)) {
                throw createBusinessException({ code: "VARIABLE_MAP_ENVIRONMENT_UNKNOWN", message: `"${key}" has a value for ${environment}, which is not an environment of the project` })
            }
            if (environments.has(environment)) {
                throw createBusinessException({ code: "VARIABLE_MAP_ENVIRONMENT_DUPLICATED", message: `"${key}" has more than one value for environment ${environment}` })
            }
            environments.add(environment)

            if (kind === "secret" && value === SECRET_PLACEHOLDER) {
                const kept = stored.find(secret => secret.key === key)?.values.find(stored => String(stored.environmentId) === environment)?.value
                if (!kept) {
                    throw createBusinessException({ code: "VARIABLE_MAP_SECRET_VALUE_REQUIRED", message: `The secret "${key}" has no stored value for environment ${environment} to keep: type it` })
                }
                return [{ environmentId: environment, value: kept }]
            }
            // Stored as typed, it would read as a ciphertext and make every load of the secret fail to decrypt
            if (kind === "secret" && isEncryptedSecret(value)) {
                throw createBusinessException({ code: "VARIABLE_MAP_VALUE_INVALID", message: `The value of "${key}" cannot start with "enc:v1:"` })
            }
            if (value.length > MAX_VARIABLE_MAP_VALUE_LENGTH) {
                throw createBusinessException({ code: "VARIABLE_MAP_VALUE_TOO_LONG", message: `The value of "${key}" exceeds ${MAX_VARIABLE_MAP_VALUE_LENGTH} characters` })
            }
            return [{ environmentId: environment, value }]
        })

        return { key, values }
    })
}

type KeyedMap = Pick<IVariableMap, "name"> & { entries: Pick<IVariableMapEntry, "key">[] }

/**
 * Every map attached to one service ends up as variables of one container: a key set by two of them
 * would be there twice, with no telling which value wins.
 */
const ensureNoKeyClash = (maps: KeyedMap[], serviceName?: string) => {
    const owners = new Map<string, string>()
    for (const map of maps) {
        for (const { key } of map.entries) {
            const owner = owners.get(key)
            if (owner !== undefined) {
                throw createBusinessException({
                    code: "SERVICE_VARIABLE_KEY_DUPLICATED",
                    message: `"${key}" is set both by "${owner}" and by "${map.name}"${serviceName ? `, both attached to ${serviceName}` : ""}`,
                    details: { key, maps: [owner, map.name], ...(serviceName && { service: serviceName }) }
                })
            }
            owners.set(key, map.name)
        }
    }
}

const keysOnly = "name entries.key"

/** The maps of the project with these ids, refused when one is missing or of another project */
const findAttachable = async (kind: VariableMapKind, ids: unknown, projectId: Schema.Types.ObjectId): Promise<{ ids: string[]; maps: KeyedMap[] }> => {
    const field = SERVICE_FIELD[kind]
    if (!Array.isArray(ids) || ids.length > MAX_ATTACHED_MAPS || !ids.every(isValidObjectId)) {
        throw createBusinessException({ code: "SERVICE_VARIABLE_MAPS_INVALID", message: `${field} must be a list of at most ${MAX_ATTACHED_MAPS} ids` })
    }

    const unique = [...new Set(ids.map(String))]
    const maps = await variableMapModels[kind].find({ _id: { $in: unique.map(id => toObjectId(id)) }, projectId }, keysOnly)
    if (maps.length !== unique.length) {
        const found = new Set(maps.map(map => String(map._id)))
        throw createBusinessException({ code: "SERVICE_VARIABLE_MAP_UNKNOWN", message: `${field} holds ${unique.find(id => !found.has(id))}, which is not a ${kind} of the project` })
    }
    return { ids: unique, maps }
}

/**
 * The maps a service attaches, checked: every id one of the project, no key set by two of them. A list
 * left out is compared as it is stored, and with both left out (an MCP update of the name, say) nothing
 * is read.
 */
export const resolveAttachedMaps = async <T extends { configMapIds?: unknown; secretIds?: unknown }>(dto: T, projectId: Schema.Types.ObjectId, existing?: IService): Promise<T> => {
    if (dto.configMapIds === undefined && dto.secretIds === undefined) return dto

    const configMaps = await findAttachable("configMap", dto.configMapIds ?? existing?.configMapIds ?? [], projectId)
    const secrets = await findAttachable("secret", dto.secretIds ?? existing?.secretIds ?? [], projectId)
    ensureNoKeyClash([...configMaps.maps, ...secrets.maps], existing?.name)

    return {
        ...dto,
        ...(dto.configMapIds !== undefined && { configMapIds: configMaps.ids }),
        ...(dto.secretIds !== undefined && { secretIds: secrets.ids })
    }
}

/** The config maps or the secrets of a project, which its backend services attach */
export class VariableMapService extends BaseAuthorizedService {
    constructor(
        private readonly kind: VariableMapKind,
        ...args: ConstructorParameters<typeof BaseAuthorizedService>
    ) {
        super(...args)
    }

    private get model() {
        return variableMapModels[this.kind]
    }

    private get serviceField() {
        return SERVICE_FIELD[this.kind]
    }

    async getByProjectId(projectId: string | Schema.Types.ObjectId): Promise<IVariableMap[]> {
        const projectIdObj = toObjectId(projectId)
        await this.ensureAccessToProject(projectIdObj)
        return await this.model.find({ projectId: projectIdObj }).sort({ name: 1 })
    }

    async getById(id: string | ObjectId): Promise<IVariableMap> {
        const map = await this.model.findById(toObjectId(id))
        if (!map) {
            throw new EntityNotFoundError(String(id))
        }
        await this.ensureAccessToProject(map.projectId)
        return map
    }

    /**
     * The fields a caller may write, picked by name: anything else in the body, an update operator such as
     * `$push` included, never reaches Mongo, where it would skip the checks below and the encryption.
     */
    private async normalize(dto: Partial<VariableMapDTO>, projectId: Schema.Types.ObjectId, existing?: IVariableMap): Promise<Partial<Pick<VariableMapDTO, "name" | "description" | "entries">>> {
        const { name: typedName, description, entries } = (dto ?? {}) as Partial<VariableMapDTO>
        const fields: Partial<Pick<VariableMapDTO, "name" | "description" | "entries">> = {}

        if (typedName !== undefined) {
            const name = typeof typedName === "string" ? typedName.trim().toLowerCase() : ""
            if (!VARIABLE_MAP_NAME.test(name)) {
                throw createBusinessException({
                    code: "VARIABLE_MAP_NAME_INVALID",
                    message: `"${name}" is not a valid name: at most 63 lowercase letters, digits or dashes, starting and ending with a letter or digit`
                })
            }
            fields.name = name
        }
        if (description !== undefined) {
            if (typeof description !== "string" || description.length > MAX_DESCRIPTION_LENGTH) {
                throw createBusinessException({ code: "VARIABLE_MAP_DESCRIPTION_INVALID", message: `The description must be text of at most ${MAX_DESCRIPTION_LENGTH} characters` })
            }
            fields.description = description
        }
        if (entries !== undefined) {
            const environmentIds = new Set((await Environment.find({ projectId }, { _id: 1 })).map(environment => String(environment._id)))
            fields.entries = normalizeEntries(entries, this.kind, environmentIds, existing?.entries)
        }
        return fields
    }

    private refuseTakenName(error: unknown, name?: string): never {
        if (isDuplicateKeyError(error)) {
            throw createBusinessException({ code: "VARIABLE_MAP_NAME_TAKEN", message: `A ${this.kind} named "${name}" already exists in this project`, statusCode: 409 })
        }
        throw error
    }

    async create(dto: VariableMapDTO, projectId: string | Schema.Types.ObjectId): Promise<IVariableMap> {
        const projectIdObj = toObjectId(projectId)
        await this.ensureAccessToProject(projectIdObj)

        return new GitOpsService(this.user).saveVariableMap(projectIdObj, this.kind, async () => {
            const fields = await this.normalize({ entries: [], ...dto, name: dto.name ?? "" }, projectIdObj)
            // Checked before the commit too: the unique index would only refuse it once the files are pushed
            if (await this.model.exists({ projectId: projectIdObj, name: fields.name })) {
                this.refuseTakenName({ code: 11000 }, fields.name)
            }
            return {
                before: null,
                after: { name: fields.name!, entries: fields.entries ?? [] },
                write: async () => {
                    try {
                        return await this.model.create({ ...fields, projectId: projectIdObj } as unknown as IVariableMap)
                    } catch (error) {
                        this.refuseTakenName(error, fields.name)
                    }
                }
            }
        })
    }

    async update(id: string | ObjectId, dto: Partial<VariableMapDTO>): Promise<IVariableMap | null> {
        const { projectId } = await this.getById(id)
        return new GitOpsService(this.user).saveVariableMap(projectId, this.kind, async () => {
            // Read again under the lock of the GitOps repository: another save may have changed it meanwhile
            const map = await this.getById(id)
            const fields = await this.normalize(dto, map.projectId, map)
            if (fields.entries) {
                await this.ensureNoClashInAttachingServices(map, fields.entries)
            }
            const renamed = Boolean(fields.name) && fields.name !== map.name
            if (renamed && (await this.model.exists({ projectId: map.projectId, name: fields.name }))) {
                this.refuseTakenName({ code: 11000 }, fields.name)
            }
            return {
                before: map,
                // A change of the description alone is not in the manifests: nothing to commit
                after: fields.entries || renamed ? { name: fields.name ?? map.name, entries: fields.entries ?? map.entries } : undefined,
                write: async () => {
                    try {
                        return await this.model.findByIdAndUpdate(map._id, { $set: fields }, { new: true, runValidators: true })
                    } catch (error) {
                        this.refuseTakenName(error, fields.name)
                    }
                }
            }
        })
    }

    /** New keys must not collide with those of the other maps attached to any service using this one */
    private async ensureNoClashInAttachingServices(map: IVariableMap, entries: VariableMapEntryDTO[]) {
        const services = await Service.find({ projectId: map.projectId, [this.serviceField]: map._id }, { name: 1, configMapIds: 1, secretIds: 1 })
        if (services.length === 0) return

        // One read per kind for all of them; this map is read with the new entries, not the stored ones
        const configMaps = await ConfigMap.find({ _id: { $in: services.flatMap(service => service.configMapIds ?? []) }, projectId: map.projectId }, keysOnly)
        const secrets = await Secret.find({ _id: { $in: services.flatMap(service => service.secretIds ?? []) }, projectId: map.projectId }, keysOnly)
        const byId = new Map<string, KeyedMap>([
            ...configMaps.map(other => [`configMap:${other._id}`, other] as const),
            ...secrets.map(other => [`secret:${other._id}`, other] as const),
            [`${this.kind}:${map._id}`, { name: map.name, entries }]
        ])

        for (const service of services) {
            const attached = [...(service.configMapIds ?? []).map(id => `configMap:${id}`), ...(service.secretIds ?? []).map(id => `secret:${id}`)]
            ensureNoKeyClash(
                attached.flatMap(key => byId.get(key) ?? []),
                service.name
            )
        }
    }

    /** Refused while a service attaches it: deleting it would silently take variables away from a running container */
    async delete(id: string | ObjectId): Promise<IVariableMap | null> {
        const { projectId } = await this.getById(id)
        return new GitOpsService(this.user).saveVariableMap(projectId, this.kind, async () => {
            const map = await this.getById(id)
            const services = await Service.find({ projectId: map.projectId, [this.serviceField]: map._id }, { name: 1 })
            if (services.length > 0) {
                throw createBusinessException({
                    code: "VARIABLE_MAP_IN_USE",
                    message: `"${map.name}" is attached to ${services.map(service => service.name).join(", ")}: detach it first`,
                    statusCode: 409,
                    details: { services: services.map(service => service.name) }
                })
            }
            return { before: map, after: null, write: () => this.model.findByIdAndDelete(map._id) }
        })
    }
}

export default VariableMapService
