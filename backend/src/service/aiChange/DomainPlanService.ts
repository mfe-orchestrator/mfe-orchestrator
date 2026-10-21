import { fastify } from "../.."
import { createBusinessException } from "../../errors/BusinessException"
import { EntityNotFoundError } from "../../errors/EntityNotFoundError"
import Domain from "../../models/DomainModel"
import { IMarket } from "../../models/MarketModel"
import Microfrontend from "../../models/MicrofrontendModel"
import Project from "../../models/ProjectModel"
import Service from "../../models/ServiceModel"
import { SERVICE_SLUG } from "../../types/ServiceStack"
import { toObjectId } from "../../utils/mongooseUtils"
import { aiProviderError } from "../llm"
import MarketService from "../MarketService"
import { defaultTemplateOf, isTemplateOfKind, REPOSITORY_NAME_SUFFIXES } from "../RepositoryCreationService"
import { isValidRepositoryName } from "../RepositoryRenameService"
import { RepositoryComponentKind } from "../workspace/repositoryComponent"
import { AiChangeBaseService, loggable } from "./aiChangeShared"

/** Components of each kind a plan may propose: a domain starts small, the agent can be asked for more later. */
export const MAX_PLANNED_PER_KIND = 3
const MAX_TOKENS = 4_000
const MAX_NAME_LENGTH = 100
const MAX_REASON_LENGTH = 500
const MAX_REPOSITORY_NAME_LENGTH = 100

export interface DomainPlanInput {
    domainId: string
    prompt: string
    /** The AI that plans, one the project may use: the project's default when left out. */
    aiModelId?: string
}

/** A microfrontend or a service the AI proposes to create, with the repository it would be scaffolded in. */
export interface DomainPlanComponent {
    name: string
    slug: string
    /** Slug of a marketplace template of the right kind. */
    template: string
    repositoryName: string
    /** Why the request needs it, in the words of the model. */
    reason: string
}

export interface DomainPlan {
    microfrontends: DomainPlanComponent[]
    services: DomainPlanComponent[]
}

const PLAN_SYSTEM_PROMPT = `You plan the first components of a functional domain on MFE Orchestrator, a platform where a project is made of microfrontends (frontends, each in its own repository) and backend services (each in its own repository, deployed as a container). The domain has no component yet. From the user's request, propose the microfrontends and the services to create so that an AI agent can then implement the request in them.
- Propose the smallest set the request needs: usually one microfrontend and one service, none of a kind the request does not need, at most ${MAX_PLANNED_PER_KIND} of each.
- name: a short human name, e.g. "Orders".
- slug: lowercase letters, digits and dashes, 2 to 50 characters, starting with a letter or a digit, not one of the slugs already taken.
- repositoryName: the slug followed by "${REPOSITORY_NAME_SUFFIXES.microfrontend}" for a microfrontend and by "${REPOSITORY_NAME_SUFFIXES.service}" for a service, e.g. orders${REPOSITORY_NAME_SUFFIXES.microfrontend} and orders${REPOSITORY_NAME_SUFFIXES.service}.
- template: the slug of one of the listed templates of the same kind, the one whose stack fits the project best; when nothing hints at a stack, the one marked default.
- reason: one sentence, in the language of the request, on what the component does for it.
Follow the project and domain context: it is what the team wrote for AI agents.`

const component = {
    type: "object",
    properties: {
        name: { type: "string" },
        slug: { type: "string" },
        template: { type: "string" },
        repositoryName: { type: "string" },
        reason: { type: "string" }
    },
    required: ["name", "slug", "template", "repositoryName", "reason"],
    additionalProperties: false
}

const PLAN_SCHEMA = {
    type: "object",
    properties: {
        microfrontends: { type: "array", items: component },
        services: { type: "array", items: component }
    },
    required: ["microfrontends", "services"],
    additionalProperties: false
}

type Template = Pick<IMarket, "slug" | "type" | "framework" | "compiler" | "description" | "comingSoon">

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "")

/** A slug the platform accepts, from whatever the model wrote: lowercase kebab case, 2 to 50 characters. */
const toSlug = (value: string, fallback: string) => {
    const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+/, "")
        .slice(0, 50)
        .replace(/-+$/, "")
    return SERVICE_SLUG.test(slug) ? slug : fallback
}

/** The slug itself when free, otherwise the first `slug-2`, `slug-3`... that is: two members of a kind cannot share one. */
const freeSlug = (slug: string, taken: Set<string>) => {
    let candidate = slug
    for (let index = 2; taken.has(candidate); index++) candidate = `${slug.slice(0, 50 - String(index).length - 1)}-${index}`
    taken.add(candidate)
    return candidate
}

const describeTemplate = (template: Template, isDefault: boolean) =>
    `- ${template.slug}${isDefault ? " (default)" : ""}: ${[template.type, template.framework, template.compiler].filter(Boolean).join(", ")}${template.description ? ` — ${template.description}` : ""}`

/**
 * What the model proposed, made safe to show as a starting point: unknown or wrong-kind templates
 * become the default of the kind, slugs and repository names valid and free in the project, at
 * most {@link MAX_PLANNED_PER_KIND} of each kind. The user still reviews it before anything is created.
 */
export const sanitizePlan = (answer: unknown, templates: Template[], taken: Record<RepositoryComponentKind, Set<string>>): DomainPlan => {
    const proposed = (answer ?? {}) as Partial<Record<"microfrontends" | "services", unknown>>
    const sanitize = (items: unknown, kind: RepositoryComponentKind): DomainPlanComponent[] => {
        const ofKind = templates.filter(template => isTemplateOfKind(template, kind))
        const fallbackTemplate = defaultTemplateOf(templates, kind)
        // Without a template of the kind nothing of it can be scaffolded: the plan leaves it out.
        if (!fallbackTemplate || !Array.isArray(items)) return []
        const suffix = REPOSITORY_NAME_SUFFIXES[kind]
        const repositoryNames = new Set<string>()
        return items.slice(0, MAX_PLANNED_PER_KIND).map((item: Record<string, unknown>, index) => {
            const name = text(item?.name, MAX_NAME_LENGTH)
            const askedSlug = text(item?.slug, 100)
            const slug = freeSlug(toSlug(askedSlug || name, `${kind === "service" ? "backend" : "frontend"}-${index + 1}`), taken[kind])
            const template = ofKind.find(candidate => candidate.slug === text(item?.template, 255)) ?? fallbackTemplate
            // The model's name only while its slug survived as is: a renamed slug renames the repository too.
            const asked = text(item?.repositoryName, MAX_REPOSITORY_NAME_LENGTH)
            const base = slug === askedSlug && asked.endsWith(suffix) && isValidRepositoryName(asked) ? asked : slug.endsWith(suffix) ? slug : `${slug}${suffix}`
            let repositoryName = base
            // The stem is cut so that the numbered name still fits the 100 characters every provider accepts
            for (let copy = 2; repositoryNames.has(repositoryName); copy++) {
                repositoryName = `${base.slice(0, -suffix.length).slice(0, MAX_REPOSITORY_NAME_LENGTH - suffix.length - String(copy).length - 1)}-${copy}${suffix}`
            }
            repositoryNames.add(repositoryName)
            return { name: name || slug, slug, template: template.slug, repositoryName, reason: text(item?.reason, MAX_REASON_LENGTH) }
        })
    }
    return { microfrontends: sanitize(proposed.microfrontends, "microfrontend"), services: sanitize(proposed.services, "service") }
}

/**
 * Proposes the microfrontends and services a domain without any should start with, for the change
 * the user asked for: one model call answered with JSON, no agent and no repository. The console
 * shows the plan for review and creates what the user keeps, then starts the domain job on it.
 */
export class DomainPlanService extends AiChangeBaseService {
    async plan(projectId: string, input: DomainPlanInput): Promise<DomainPlan> {
        const projectIdObj = toObjectId(projectId)
        await this.ensureCanChangeProject(projectIdObj)
        const { client } = await this.aiModels().resolveForProject(projectIdObj, input.aiModelId)
        const domain = await Domain.findOne({ _id: toObjectId(input.domainId), projectId: projectIdObj })
        if (!domain) throw new EntityNotFoundError(input.domainId)
        await this.ensureInDomainScope(projectIdObj, domain._id)

        // Members already there are what the job works on: planning new ones would duplicate them.
        const inDomain = { projectId: projectIdObj, domainId: domain._id }
        if ((await Microfrontend.exists(inDomain)) || (await Service.exists(inDomain))) {
            throw createBusinessException({ code: "AI_DOMAIN_PLAN_HAS_MEMBERS", message: `The domain ${domain.name} already has microfrontends or services`, statusCode: 422 })
        }

        const [project, templates, microfrontends, services] = await Promise.all([
            Project.findById(projectIdObj, { name: 1, context: 1 }),
            new MarketService().getAll(),
            Microfrontend.find({ projectId: projectIdObj }, { slug: 1 }),
            Service.find({ projectId: projectIdObj }, { slug: 1 })
        ])
        const taken = { microfrontend: new Set(microfrontends.map(item => item.slug)), service: new Set(services.map(item => item.slug)) }
        const templateList = (kind: RepositoryComponentKind) => {
            const fallback = defaultTemplateOf(templates, kind)
            return templates
                .filter(template => isTemplateOfKind(template, kind))
                .map(template => describeTemplate(template, template.slug === fallback?.slug))
                .join("\n")
        }

        const answer = await client
            .json({
                system: PLAN_SYSTEM_PROMPT,
                user: [
                    `<request>\n${input.prompt}\n</request>`,
                    project?.context ? `<project_context project="${project.name}">\n${project.context}\n</project_context>` : `<project name="${project?.name ?? ""}" />`,
                    [`<domain_context domain="${domain.name}">`, domain.description, domain.context, "</domain_context>"].filter(Boolean).join("\n"),
                    `<microfrontend_templates>\n${templateList("microfrontend")}\n</microfrontend_templates>`,
                    `<service_templates>\n${templateList("service")}\n</service_templates>`,
                    `<taken_slugs>\nmicrofrontends: ${[...taken.microfrontend].join(", ") || "none"}\nservices: ${[...taken.service].join(", ") || "none"}\n</taken_slugs>`
                ].join("\n\n"),
                schema: PLAN_SCHEMA,
                maxTokens: MAX_TOKENS,
                effort: "low"
            })
            .catch(error => {
                // The provider's own message stays in the log: it may quote what the endpoint answered.
                fastify.log.warn({ error: loggable(error), projectId }, "AI domain plan failed")
                throw aiProviderError(error)
            })
        if (!answer) {
            throw createBusinessException({
                code: "AI_DOMAIN_PLAN_FAILED",
                message: "The AI could not propose the components of the domain: try again or describe the request differently",
                statusCode: 502
            })
        }
        return sanitizePlan(answer, templates, taken)
    }
}

export default DomainPlanService
