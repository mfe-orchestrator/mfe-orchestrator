import { zodResolver } from "@hookform/resolvers/zod"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, ConfirmByTypingDialog, DangerZoneCard } from "@mfe-orchestrator/design-system"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Link, useNavigate, useParams } from "react-router-dom"
import * as z from "zod"
import { Badge, Button } from "@/components/atoms"
import TextareaField from "@/components/input/TextareaField.rhf"
import TextField from "@/components/input/TextField.rhf"
import { ApiStatusHandler } from "@/components/organisms"
import SinglePageLayout from "@/components/SinglePageLayout"
import type { EnvironmentDTO } from "@/hooks/apiClients/useEnvironmentsApi"
import useServicesApi, { Service } from "@/hooks/apiClients/useServicesApi"
import useVariableMapsApi, { VariableMap, VariableMapKind } from "@/hooks/apiClients/useVariableMapsApi"
import useProjectStore from "@/store/useProjectStore"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import { useProjectEnvironmentsQuery } from "../services/partials/serviceVariables"
import VariableEntriesFields from "./partials/VariableEntriesFields"
import { fromFormEntries, toFormEntries, VARIABLE_KEY, VARIABLE_MAP_KINDS, VARIABLE_MAP_NAME } from "./partials/variableMaps"

const createFormSchema = (messages: { name: string; key: string; keyDuplicated: string }) =>
    z
        .object({
            name: z.string().trim().regex(VARIABLE_MAP_NAME, messages.name),
            // Same limit as the backend
            description: z.string().max(2000).optional(),
            entries: z.array(
                z.object({
                    key: z.string().trim().regex(VARIABLE_KEY, messages.key),
                    values: z.array(z.string()),
                    saved: z.boolean().default(false)
                })
            )
        })
        .superRefine((values, context) => {
            const seen = new Set<string>()
            values.entries.forEach((entry, index) => {
                if (seen.has(entry.key)) context.addIssue({ code: "custom", path: ["entries", index, "key"], message: messages.keyDuplicated })
                seen.add(entry.key)
            })
        })

type FormSchema = ReturnType<typeof createFormSchema>

/** Who receives the values of this map: each service attaching it, linked */
const UsedBySection: React.FC<{ services: Service[] }> = ({ services }) => {
    const { t } = useTranslation()

    return (
        <Card>
            <CardHeader>
                <CardTitle className="mb-0">{t("variableMaps.used_by.title")}</CardTitle>
                <CardDescription>{t("variableMaps.used_by.description")}</CardDescription>
            </CardHeader>
            <CardContent className="pt-3">
                {services.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {services.map(service => (
                            <Link key={service._id} to={`/service/${service._id}`}>
                                <Badge variant="outline">{service.name}</Badge>
                            </Link>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-foreground-secondary">{t("variableMaps.used_by.none")}</p>
                )}
            </CardContent>
        </Card>
    )
}

const VariableMapDangerZone: React.FC<{ kind: VariableMapKind; map: VariableMap; inUse: boolean }> = ({ kind, map, inUse }) => {
    const { t } = useTranslation()
    const [opened, setOpened] = useState(false)
    const { deleteSingle } = useVariableMapsApi(kind)
    const notifications = useToastNotificationStore()
    const queryClient = useQueryClient()
    const navigate = useNavigate()

    const deleteMutation = useMutation({
        mutationFn: () => deleteSingle(map._id!),
        onSuccess: async () => {
            notifications.showSuccessNotification({ message: t("variableMaps.danger_zone.success") })
            await queryClient.invalidateQueries({ queryKey: ["variable-maps", kind] })
            navigate(VARIABLE_MAP_KINDS[kind].listPath)
        }
    })

    return (
        <DangerZoneCard
            title={t("variableMaps.danger_zone.title")}
            description={t("variableMaps.danger_zone.subtitle")}
            actionTitle={t("variableMaps.danger_zone.action_title")}
            // The backend refuses it too: the button only says so before the user tries
            actionDescription={inUse ? t("variableMaps.danger_zone.in_use") : t("variableMaps.danger_zone.action_description")}
            actionLabel={t("variableMaps.danger_zone.button")}
            actionIcon={<Trash2 />}
            disabled={inUse}
            onAction={() => setOpened(true)}
        >
            <ConfirmByTypingDialog
                open={opened}
                onOpenChange={setOpened}
                expectedText={map.name}
                onConfirm={async () => {
                    await deleteMutation.mutateAsync()
                }}
                isPending={deleteMutation.isPending}
                title={t("variableMaps.danger_zone.dialog.title")}
                warningTitle={t("variableMaps.danger_zone.dialog.warning")}
                warningDescription={t("variableMaps.danger_zone.dialog.description", { name: map.name })}
                confirmationHint={t("variableMaps.danger_zone.dialog.confirmation", { name: map.name })}
                placeholder={map.name}
                confirmLabel={t("variableMaps.danger_zone.button")}
                confirmingLabel={t("common.deleting")}
                cancelLabel={t("common.cancel")}
                closeLabel={t("common.close")}
            />
        </DangerZoneCard>
    )
}

interface VariableMapFormContentProps {
    kind: VariableMapKind
    environments: EnvironmentDTO[]
    services: Service[]
    map?: VariableMap
}

const VariableMapFormContent: React.FC<VariableMapFormContentProps> = ({ kind, environments, services, map }) => {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const notifications = useToastNotificationStore()
    const api = useVariableMapsApi(kind)
    const { listPath, detailPath, i18n: prefix } = VARIABLE_MAP_KINDS[kind]
    const attaching = services.filter(service => (kind === "configMap" ? service.configMapIds : service.secretIds)?.includes(map?._id ?? ""))

    const formSchema = useMemo(
        () =>
            createFormSchema({
                name: t("variableMaps.name_invalid"),
                key: t("variableMaps.entries.key_invalid"),
                keyDuplicated: t("variableMaps.entries.key_duplicated")
            }),
        [t]
    )
    const form = useForm<z.input<FormSchema>, unknown, z.output<FormSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: map?.name ?? "",
            description: map?.description ?? "",
            entries: toFormEntries(map?.entries, environments, kind === "secret")
        }
    })

    const onSubmit = async (data: z.output<FormSchema>) => {
        const dto = { name: data.name, description: data.description, entries: fromFormEntries(data.entries, environments) }
        if (map) {
            await api.update(map._id!, dto)
            notifications.showSuccessNotification({ message: t(`${prefix}.updated`) })
            await queryClient.invalidateQueries({ queryKey: ["variable-map", kind, map._id] })
        } else {
            const created = await api.create(dto)
            notifications.showSuccessNotification({ message: t(`${prefix}.created`) })
            navigate(detailPath(created._id!), { replace: true })
        }
        await queryClient.invalidateQueries({ queryKey: ["variable-maps", kind] })
    }

    return (
        <SinglePageLayout title={map ? map.name : t(`${prefix}.add_new`)} description={t(`${prefix}.form_description`)}>
            <FormProvider {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="mb-0">{t("variableMaps.general_information")}</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-2 pt-3">
                            <TextField
                                name="name"
                                label={t("variableMaps.name")}
                                placeholder={kind === "configMap" ? "orders-config" : "orders-database"}
                                description={t("variableMaps.name_hint")}
                                textTransform={value => value.toLowerCase().replace(/[^a-z0-9-]/g, "-")}
                                required
                            />
                            <TextareaField name="description" label={t("variableMaps.description")} placeholder={t("variableMaps.description_placeholder")} />
                        </CardContent>
                    </Card>

                    <VariableEntriesFields kind={kind} environments={environments} />

                    {map && <UsedBySection services={attaching} />}

                    {map && <VariableMapDangerZone kind={kind} map={map} inUse={attaching.length > 0} />}

                    <div className="flex justify-end gap-2">
                        <Button disabled={form.formState.isSubmitting} type="button" variant="secondary" onClick={() => navigate(listPath)}>
                            {t("common.cancel")}
                        </Button>
                        <Button disabled={form.formState.isSubmitting} type="submit">
                            {t("common.save")}
                        </Button>
                    </div>
                </form>
            </FormProvider>
        </SinglePageLayout>
    )
}

/** Creates a config map or a secret, or edits one: `/config-map/new`, `/config-map/:id` and the same under `/secret` */
const VariableMapForm: React.FC<{ kind: VariableMapKind }> = ({ kind }) => {
    const { id } = useParams<{ id: string }>()
    const isEdit = Boolean(id) && id !== "new"
    const projectId = useProjectStore(state => state.project?._id)
    const api = useVariableMapsApi(kind)
    const servicesApi = useServicesApi()

    const mapQuery = useQuery({ queryKey: ["variable-map", kind, id], queryFn: () => api.getSingle(id!), enabled: isEdit })
    const servicesQuery = useQuery({ queryKey: ["services", projectId], queryFn: servicesApi.getAll, enabled: !!projectId })
    // Before the form mounts: its default values hold one value per environment
    const environmentsQuery = useProjectEnvironmentsQuery()

    return (
        <ApiStatusHandler queries={[mapQuery, servicesQuery, environmentsQuery]} interceptEmpty={false}>
            {/* Keyed: going from one map to another reuses the route, and the form must start over */}
            <VariableMapFormContent key={mapQuery.data?._id ?? "new"} kind={kind} environments={environmentsQuery.data ?? []} services={servicesQuery.data ?? []} map={mapQuery.data} />
        </ApiStatusHandler>
    )
}

export default VariableMapForm
