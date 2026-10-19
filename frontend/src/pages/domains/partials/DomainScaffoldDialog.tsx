import {
    Alert,
    AlertDescription,
    AlertTitle,
    Checkbox,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
    Label,
    Select,
    SelectContent,
    SelectControl,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Spinner,
    Switch
} from "@mfe-orchestrator/design-system"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { TFunction } from "i18next"
import { AlertTriangle, CircleCheck, LayoutDashboard, Server, Sparkles } from "lucide-react"
import { useEffect, useId, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import { jobErrorMessage } from "@/components/assistant/AssistantJobThread"
import { Badge, Button } from "@/components/atoms"
import useAiJobsApi, { AiJob } from "@/hooks/apiClients/useAiJobsApi"
import useCodeRepositoriesApi, { CodeRepositoryProvider } from "@/hooks/apiClients/useCodeRepositoriesApi"
import useMarketApi, { Market } from "@/hooks/apiClients/useMarketApi"
import useMicrofrontendsApi from "@/hooks/apiClients/useMicrofrontendsApi"
import useServicesApi from "@/hooks/apiClients/useServicesApi"
import { errorCodeOf } from "@/hooks/useApiClient"
import useProjectStore from "@/store/useProjectStore"

export type ScaffoldKind = "microfrontend" | "service"

/** One row of the dialog: a component to create with its repository, or a member of the domain that only needs the repository. */
export interface ScaffoldItem {
    key: string
    kind: ScaffoldKind
    /** Set for a member of the domain: only its repository is created. */
    memberId?: string
    name: string
    slug: string
    repositoryName: string
    /** Slug of the template; empty picks the default of the kind once the templates are loaded. */
    template: string
    /** Why the AI proposes it. */
    reason?: string
}

type Progress = { status: "creating" | "created" } | { status: "failed"; error: string }

/** Mirror the backend: what a slug and a repository name may be. */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,49}$/
const REPOSITORY_NAME_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9_-])?$/

/** The template the backend falls back to for each kind. */
const DEFAULT_TEMPLATE_SLUGS: Record<ScaffoldKind, string> = { microfrontend: "vite-remote-react", service: "service-node-fastify" }

/** What a repository name ends with: `checkout-fe`, `orders-be`. */
export const repositoryNameFor = (slug: string, kind: ScaffoldKind) => {
    const suffix = kind === "service" ? "-be" : "-fe"
    return slug.endsWith(suffix) ? slug : `${slug}${suffix}`
}

const isServiceTemplate = (template: Market) => template.type?.trim().toLowerCase() === "service"

const templatesOfKind = (templates: Market[], kind: ScaffoldKind) => templates.filter(template => !template.comingSoon && isServiceTemplate(template) === (kind === "service"))

const defaultTemplateOf = (templates: Market[], kind: ScaffoldKind) =>
    templates.find(template => template.slug === DEFAULT_TEMPLATE_SLUGS[kind]) ??
    (kind === "microfrontend" ? templates.find(template => template.type?.trim().toLowerCase() === "remote") : undefined) ??
    templates[0]

/** Codes of the creation endpoints with a message of their own; anything else gets the generic one. */
const CREATE_ERROR_CODES = new Set([
    "MICROFRONTEND_SLUG_TAKEN",
    "SERVICE_SLUG_TAKEN",
    "SERVICE_SLUG_INVALID",
    "INVALID_REPOSITORY_NAME",
    "REPOSITORY_ALREADY_LINKED",
    "REPOSITORY_NAME_TAKEN",
    "REPOSITORY_CREATE_FORBIDDEN",
    "TEMPLATE_NOT_FOUND"
])

const SLUG_TAKEN_CODES = new Set(["MICROFRONTEND_SLUG_TAKEN", "SERVICE_SLUG_TAKEN"])

const createErrorMessage = (t: TFunction, error: unknown) => {
    const code = errorCodeOf(error as Error)
    return t(`domains.ai.scaffold.errors.${code && CREATE_ERROR_CODES.has(code) ? code : "generic"}`)
}

interface DomainScaffoldDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    domainId: string
    domainName: string
    /** The request the job starts with once everything is created. */
    prompt: string
    /** Proposed by the AI for an empty domain, or the members of the domain without a repository. */
    items: ScaffoldItem[]
    /**
     * Repositories one job works on. No member of the domain has one when the dialog opens, so what
     * is selected here is the whole job.
     */
    maxRepositories: number
    onCreated: (job: AiJob) => void
}

/**
 * Before a domain job can start, what it needs to work on: the components the AI proposes for an
 * empty domain, or the repositories of members that have none. The user reviews and edits them, then
 * they are created one by one (each repository scaffolded from its template) and the job starts on
 * them. A failed row stays in the dialog: confirming again retries only what is not created yet.
 */
const DomainScaffoldDialog: React.FC<DomainScaffoldDialogProps> = ({ open, onOpenChange, domainId, domainName, prompt, items: proposed, maxRepositories, onCreated }) => {
    const { t } = useTranslation()
    const id = useId()
    const queryClient = useQueryClient()
    const projectId = useProjectStore(state => state.project?._id)
    const codeRepositoriesApi = useCodeRepositoriesApi()
    const marketApi = useMarketApi()
    const microfrontendsApi = useMicrofrontendsApi()
    const servicesApi = useServicesApi()
    const aiJobsApi = useAiJobsApi()
    // Existing members only miss their repository: their name and slug are not edited here.
    const forMembers = proposed.some(item => item.memberId)

    const connectionsQuery = useQuery({
        queryKey: ["repositories", projectId],
        queryFn: () => codeRepositoriesApi.getRepositoriesByProjectId(projectId!),
        enabled: open && !!projectId
    })
    const templatesQuery = useQuery({ queryKey: ["markets"], queryFn: marketApi.getMarkets, enabled: open })
    const connections = connectionsQuery.data ?? []
    const templates = templatesQuery.data ?? []

    const [items, setItems] = useState<ScaffoldItem[]>(proposed)
    const [selected, setSelected] = useState<string[]>([])
    const [progress, setProgress] = useState<Record<string, Progress>>({})
    const [codeRepositoryId, setCodeRepositoryId] = useState<string>()
    const [isPrivate, setIsPrivate] = useState(true)

    // The dialog is kept mounted by the composer: every opening starts from what was just proposed.
    useEffect(() => {
        if (!open) return
        setItems(proposed)
        setSelected(proposed.slice(0, maxRepositories).map(item => item.key))
        setProgress({})
        setIsPrivate(true)
    }, [open, proposed, maxRepositories])

    // As when adding a microfrontend: the only connection, or the default one.
    useEffect(() => {
        if (!open || !connectionsQuery.data) return
        const connections = connectionsQuery.data
        setCodeRepositoryId(connections.length === 1 ? connections[0]._id : connections.find(connection => connection.default)?._id)
    }, [open, connectionsQuery.data])

    const connection = connections.find(candidate => candidate._id === codeRepositoryId)
    const templateOf = (item: ScaffoldItem) => {
        const ofKind = templatesOfKind(templates, item.kind)
        return ofKind.find(template => template.slug === item.template) ?? defaultTemplateOf(ofKind, item.kind)
    }
    const update = (key: string, changes: Partial<ScaffoldItem>) => setItems(current => current.map(item => (item.key === key ? { ...item, ...changes } : item)))

    const invalidFields = (item: ScaffoldItem) => ({
        name: !forMembers && !item.name.trim(),
        slug: !forMembers && !SLUG_PATTERN.test(item.slug),
        repositoryName: !REPOSITORY_NAME_PATTERN.test(item.repositoryName) || /\.(git|atom)$/i.test(item.repositoryName)
    })
    const toCreate = items.filter(item => selected.includes(item.key))
    const invalid = toCreate.some(item => Object.values(invalidFields(item)).some(Boolean))
    const tooMany = toCreate.length > maxRepositories

    /**
     * A new component refused because its slug is taken may be the one an earlier attempt created
     * before failing on something else: found in this domain, it counts as created.
     */
    const createdEarlier = async (item: ScaffoldItem) => {
        const members = item.kind === "service" ? await servicesApi.getAll() : ((await microfrontendsApi.getByProjectId(projectId!)) ?? [])
        return members.some(member => member.slug === item.slug && member.domainId === domainId)
    }

    const createOne = async (item: ScaffoldItem) => {
        const template = templateOf(item)?.slug
        const repository = { codeRepositoryId: codeRepositoryId!, repositoryName: item.repositoryName.trim(), template, private: isPrivate }
        // Every row tells its own outcome: no toast per failure.
        const metadata = { silent: true }
        if (item.memberId) {
            await (item.kind === "service" ? servicesApi.createRepository(item.memberId, repository, metadata) : microfrontendsApi.createRepository(item.memberId, repository, metadata))
            return
        }
        const fields = { name: item.name.trim(), slug: item.slug, domainId }
        const codeRepository = {
            enabled: true,
            codeRepositoryId: repository.codeRepositoryId,
            repositoryId: "",
            name: repository.repositoryName,
            createData: { name: repository.repositoryName, private: isPrivate, template }
        }
        if (item.kind === "service") await servicesApi.create({ ...fields, env: [], codeRepository }, metadata)
        else await microfrontendsApi.create({ ...fields, version: "1.0.0", codeRepository }, metadata)
    }

    const runMutation = useMutation({
        mutationFn: async (): Promise<AiJob | undefined> => {
            let failed = false
            // One at a time: each one is a repository created at the provider, and the order is the one shown.
            for (const item of toCreate) {
                if (progress[item.key]?.status === "created") continue
                setProgress(current => ({ ...current, [item.key]: { status: "creating" } }))
                try {
                    await createOne(item)
                    setProgress(current => ({ ...current, [item.key]: { status: "created" } }))
                } catch (error) {
                    const code = errorCodeOf(error as Error)
                    if (!item.memberId && code && SLUG_TAKEN_CODES.has(code) && (await createdEarlier(item).catch(() => false))) {
                        setProgress(current => ({ ...current, [item.key]: { status: "created" } }))
                        continue
                    }
                    failed = true
                    setProgress(current => ({ ...current, [item.key]: { status: "failed", error: createErrorMessage(t, error) } }))
                }
            }
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["microfrontends-by-project-id", projectId] }),
                queryClient.invalidateQueries({ queryKey: ["services", projectId] }),
                queryClient.invalidateQueries({ queryKey: ["domains"] })
            ])
            if (failed) return undefined
            return aiJobsApi.create({ prompt, scope: "domain", domainId }, { customErrorMessage: error => jobErrorMessage(t, error, "create") })
        },
        onSuccess: job => {
            if (!job) return
            onOpenChange(false)
            onCreated(job)
        }
    })

    const busy = runMutation.isPending
    const noConnection = connectionsQuery.isSuccess && connections.length === 0
    const loading = connectionsQuery.isPending || templatesQuery.isPending
    const groups = (["microfrontend", "service"] as const).map(kind => ({ kind, items: items.filter(item => item.kind === kind) })).filter(group => group.items.length > 0)

    return (
        <Dialog open={open} onOpenChange={next => !busy && onOpenChange(next)}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>{t(forMembers ? "domains.ai.scaffold.repositories_title" : "domains.ai.scaffold.plan_title", { name: domainName })}</DialogTitle>
                    <DialogDescription>{t(forMembers ? "domains.ai.scaffold.repositories_description" : "domains.ai.scaffold.plan_description", { name: domainName })}</DialogDescription>
                </DialogHeader>

                <div className="mt-2 flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
                    {loading ? (
                        <Spinner size={24} centerScreen={false} label={t("common.loading")} />
                    ) : noConnection ? (
                        <Alert variant="destructive">
                            <AlertTriangle className="size-4" aria-hidden="true" />
                            <AlertTitle>{t("domains.ai.scaffold.no_connection_title")}</AlertTitle>
                            <AlertDescription>
                                {t("domains.ai.scaffold.no_connection_description")}{" "}
                                <Link to="/code-repositories" className="font-medium underline">
                                    {t("domains.ai.scaffold.no_connection_link")}
                                </Link>
                            </AlertDescription>
                        </Alert>
                    ) : (
                        <div className="flex flex-wrap items-end gap-4">
                            {connections.length > 1 && (
                                <SelectControl label={t("domains.ai.scaffold.connection")} className="min-w-56 flex-1">
                                    <Select value={codeRepositoryId} onValueChange={setCodeRepositoryId} disabled={busy}>
                                        <SelectTrigger>
                                            <SelectValue placeholder={t("domains.ai.scaffold.connection_placeholder")}>{connection?.name}</SelectValue>
                                        </SelectTrigger>
                                        <SelectContent>
                                            {connections.map(candidate => (
                                                <SelectItem key={candidate._id} value={candidate._id}>
                                                    {candidate.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </SelectControl>
                            )}
                            {/* Azure DevOps repositories take the visibility of their project */}
                            {connection && connection.provider !== CodeRepositoryProvider.AZURE_DEV_OPS && (
                                <div className="flex items-center gap-2 pb-2">
                                    <Switch id={`${id}-private`} checked={isPrivate} disabled={busy} onCheckedChange={setIsPrivate} />
                                    <Label htmlFor={`${id}-private`}>{t("domains.ai.scaffold.private")}</Label>
                                </div>
                            )}
                        </div>
                    )}

                    {tooMany && (
                        <Alert variant="destructive">
                            <AlertTriangle className="size-4" aria-hidden="true" />
                            <AlertTitle>{t("domains.ai.too_many_title")}</AlertTitle>
                            <AlertDescription>{t("domains.ai.scaffold.too_many_description", { count: toCreate.length, max: maxRepositories })}</AlertDescription>
                        </Alert>
                    )}

                    {items.length === 0 && <p className="text-sm text-foreground-secondary">{t("domains.ai.scaffold.plan_empty")}</p>}

                    {groups.map(group => (
                        <section key={group.kind} aria-labelledby={`${id}-${group.kind}`} className="flex flex-col gap-2">
                            <h3 id={`${id}-${group.kind}`} className="flex items-center gap-2 text-sm font-medium">
                                {group.kind === "service" ? <Server className="size-4" aria-hidden="true" /> : <LayoutDashboard className="size-4" aria-hidden="true" />}
                                {t(group.kind === "service" ? "domains.ai.scaffold.backends" : "domains.ai.scaffold.frontends")}
                            </h3>
                            <ul className="flex flex-col gap-2">
                                {group.items.map(item => {
                                    const rowId = `${id}-${item.key}`
                                    const checked = selected.includes(item.key)
                                    const state = progress[item.key]
                                    const locked = busy || state?.status === "created"
                                    const errors = checked ? invalidFields(item) : { name: false, slug: false, repositoryName: false }
                                    const ofKind = templatesOfKind(templates, item.kind)
                                    const template = templateOf(item)
                                    return (
                                        <li key={item.key} className="rounded-md border border-divider p-3">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Checkbox
                                                    id={`${rowId}-include`}
                                                    checked={checked}
                                                    disabled={locked}
                                                    onCheckedChange={value => setSelected(current => (value === true ? [...current, item.key] : current.filter(key => key !== item.key)))}
                                                />
                                                <Label htmlFor={`${rowId}-include`} className="font-medium">
                                                    {t("domains.ai.scaffold.include", { name: item.name || item.slug })}
                                                </Label>
                                                {state?.status === "creating" && <Spinner size={14} centerScreen={false} label={t("domains.ai.scaffold.status_creating")} />}
                                                {state?.status === "created" && (
                                                    <Badge variant="accent">
                                                        <CircleCheck className="size-3" aria-hidden="true" />
                                                        {t("domains.ai.scaffold.status_created")}
                                                    </Badge>
                                                )}
                                                {state?.status === "failed" && <Badge variant="destructive">{t("domains.ai.scaffold.status_failed")}</Badge>}
                                            </div>
                                            {item.reason && <p className="mt-1 text-xs text-foreground-secondary">{item.reason}</p>}
                                            {state?.status === "failed" && (
                                                <p role="alert" className="mt-1 text-sm text-destructive">
                                                    {state.error}
                                                </p>
                                            )}
                                            {checked && (
                                                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                                    {!forMembers && (
                                                        <>
                                                            <div className="flex flex-col gap-1">
                                                                <Label htmlFor={`${rowId}-name`}>{t("domains.ai.scaffold.field_name")}</Label>
                                                                <Input
                                                                    id={`${rowId}-name`}
                                                                    value={item.name}
                                                                    disabled={locked}
                                                                    aria-invalid={errors.name}
                                                                    onChange={event => update(item.key, { name: event.target.value })}
                                                                    fullWidth
                                                                />
                                                            </div>
                                                            <div className="flex flex-col gap-1">
                                                                <Label htmlFor={`${rowId}-slug`}>{t("domains.ai.scaffold.field_slug")}</Label>
                                                                <Input
                                                                    id={`${rowId}-slug`}
                                                                    value={item.slug}
                                                                    disabled={locked}
                                                                    aria-invalid={errors.slug}
                                                                    aria-describedby={errors.slug ? `${rowId}-slug-error` : undefined}
                                                                    // The repository follows the slug while nobody named it otherwise
                                                                    onChange={event => {
                                                                        const slug = event.target.value.toLowerCase()
                                                                        update(item.key, {
                                                                            slug,
                                                                            ...(item.repositoryName === repositoryNameFor(item.slug, item.kind)
                                                                                ? { repositoryName: repositoryNameFor(slug, item.kind) }
                                                                                : {})
                                                                        })
                                                                    }}
                                                                    fullWidth
                                                                />
                                                                {errors.slug && (
                                                                    <span id={`${rowId}-slug-error`} className="text-xs text-destructive">
                                                                        {t("domains.ai.scaffold.slug_invalid")}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </>
                                                    )}
                                                    <div className="flex flex-col gap-1">
                                                        <Label htmlFor={`${rowId}-repository`}>{t("domains.ai.scaffold.field_repository")}</Label>
                                                        <Input
                                                            id={`${rowId}-repository`}
                                                            value={item.repositoryName}
                                                            disabled={locked}
                                                            aria-invalid={errors.repositoryName}
                                                            aria-describedby={`${rowId}-repository-hint`}
                                                            onChange={event => update(item.key, { repositoryName: event.target.value })}
                                                            fullWidth
                                                        />
                                                        <span id={`${rowId}-repository-hint`} className={errors.repositoryName ? "text-xs text-destructive" : "text-xs text-foreground-secondary"}>
                                                            {t(errors.repositoryName ? "domains.ai.scaffold.repository_invalid" : "domains.ai.scaffold.repository_hint")}
                                                        </span>
                                                    </div>
                                                    <SelectControl label={t("domains.ai.scaffold.field_template")}>
                                                        <Select value={template?.slug} onValueChange={value => update(item.key, { template: value })} disabled={locked || ofKind.length === 0}>
                                                            <SelectTrigger>
                                                                <SelectValue>{template?.name}</SelectValue>
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {ofKind.map(candidate => (
                                                                    <SelectItem key={candidate.slug} value={candidate.slug}>
                                                                        {candidate.name}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </SelectControl>
                                                </div>
                                            )}
                                        </li>
                                    )
                                })}
                            </ul>
                        </section>
                    ))}
                </div>

                <DialogFooter>
                    <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
                        {t("common.cancel")}
                    </Button>
                    <Button
                        type="button"
                        onClick={() => runMutation.mutate()}
                        loading={busy}
                        loadingLabel={t("domains.ai.scaffold.creating")}
                        disabled={busy || !codeRepositoryId || toCreate.length === 0 || invalid || tooMany || loading}
                        dataTestId="domain-ai-scaffold-confirm"
                    >
                        {!busy && <Sparkles aria-hidden="true" />}
                        {t(forMembers ? "domains.ai.scaffold.confirm_repositories" : "domains.ai.scaffold.confirm_plan", { count: toCreate.length })}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export default DomainScaffoldDialog
