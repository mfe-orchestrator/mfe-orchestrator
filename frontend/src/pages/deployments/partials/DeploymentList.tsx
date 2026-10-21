import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, DescriptionItem, DescriptionList, EmptyState, SectionHeader } from "@mfe-orchestrator/design-system"
import { useMutation, useQuery } from "@tanstack/react-query"
import { BadgeCheck, History, PackageOpen, RefreshCw, UsersRound } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"
import { ApiStatusHandler } from "@/components/organisms"
import useDeploymentsApi, { DeployedVariableMap, DeploymentDTO } from "../../../hooks/apiClients/useDeploymentsApi"
import DeploymentMicrofrontendCard from "./DeploymentMicrofrontendCard"
import DeploymentServiceCard from "./DeploymentServiceCard"

/** The config maps or the secrets of a deployment, each with the keys it set in the environment */
const DeployedMaps: React.FC<{ title: string; maps: DeployedVariableMap[]; secret?: boolean }> = ({ title, maps, secret }) => {
    const { t } = useTranslation()

    return (
        <div className="mt-4">
            <h4 className="font-semibold text-primary mb-1">{title}</h4>
            {maps.map(map => (
                <div key={map._id} className="mt-2">
                    <p className="text-sm font-medium">{map.name}</p>
                    {map.entries.length > 0 ? (
                        <DescriptionList orientation="inline">
                            {map.entries.map(entry => (
                                <DescriptionItem key={entry.key} label={entry.key}>
                                    {secret ? (
                                        <span title={t("deployments.secret_value_hidden")}>
                                            <span aria-hidden="true">••••••</span>
                                            <span className="sr-only">{t("deployments.secret_value_hidden")}</span>
                                        </span>
                                    ) : (
                                        entry.value
                                    )}
                                </DescriptionItem>
                            ))}
                        </DescriptionList>
                    ) : (
                        <p className="text-sm text-foreground-secondary">{t("deployments.map_no_keys")}</p>
                    )}
                </div>
            ))}
        </div>
    )
}

/** What a deployment shipped: the same summary for the active one and for the history */
const DeploymentSummary: React.FC<{ deployment: DeploymentDTO }> = ({ deployment }) => {
    const { t } = useTranslation()
    const services = deployment.services ?? []
    const configMaps = deployment.configMaps ?? []
    const secrets = deployment.secrets ?? []

    return (
        <>
            {deployment.microfrontends.length > 0 && (
                <div>
                    <h4 className="font-semibold text-primary mb-2">{t("deployments.microfrontends_title")}</h4>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
                        {deployment.microfrontends.map(microfrontend => (
                            <DeploymentMicrofrontendCard key={microfrontend._id} microfrontend={microfrontend} />
                        ))}
                    </div>
                </div>
            )}
            {services.length > 0 && (
                <div className={deployment.microfrontends.length > 0 ? "mt-4" : undefined}>
                    <h4 className="font-semibold text-primary mb-2">{t("deployments.services_title")}</h4>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
                        {services.map(service => (
                            <DeploymentServiceCard key={service._id} service={service} />
                        ))}
                    </div>
                </div>
            )}
            {deployment.variables.length > 0 && (
                <div className="mt-4">
                    <h4 className="font-semibold text-primary mb-1">{t("deployments.env_variables_title")}</h4>
                    <DescriptionList orientation="inline">
                        {deployment.variables.map(variable => (
                            <DescriptionItem key={variable._id} label={variable.key}>
                                {variable.value}
                            </DescriptionItem>
                        ))}
                    </DescriptionList>
                </div>
            )}
            {configMaps.length > 0 && <DeployedMaps title={t("deployments.config_maps_title")} maps={configMaps} />}
            {secrets.length > 0 && <DeployedMaps title={t("deployments.secrets_title")} maps={secrets} secret />}
        </>
    )
}

interface DeploymentListProps {
    environmentId: string
}

export const DeploymentList: React.FC<DeploymentListProps> = ({ environmentId }) => {
    const { t } = useTranslation()
    const { getDeployments, redeploy } = useDeploymentsApi()
    const [selectedDeploymentId, _setSelectedDeploymentId] = useState<string | null>(null)

    const dataQuery = useQuery({
        queryKey: ["deployments", environmentId],
        queryFn: () => getDeployments(environmentId)
    })

    const redeployQuery = useMutation({
        mutationFn: redeploy,
        onSuccess: () => dataQuery.refetch()
    })

    const onRedeploy = (deploymentId: string) => {
        redeployQuery.mutate(deploymentId)
    }

    const deployments = dataQuery.data || []

    const _selectedDeployment = deployments.find(deployment => deployment._id === selectedDeploymentId)

    return (
        <ApiStatusHandler queries={[dataQuery]}>
            {deployments.length > 0 ? (
                <div>
                    {deployments.filter(deployment => deployment.active) !== null && (
                        <section className="mb-8">
                            <SectionHeader icon={<BadgeCheck />} title={t("deployments.active_deployments")} />
                            <div>
                                <Accordion type="single" defaultValue={deployments.find(deployment => deployment.active)?._id} collapsible>
                                    {deployments
                                        .filter(deployment => deployment.active)
                                        ?.map(deployment => (
                                            <AccordionItem key={deployment._id} value={deployment._id}>
                                                <AccordionTrigger>
                                                    <div className="flex items-end gap-2">
                                                        <h3 className="font-medium">Deployment {deployment.deploymentId}</h3>
                                                        <span className="text-sm text-foreground-secondary font-normal">{new Date(deployment.deployedAt).toLocaleDateString()}</span>
                                                    </div>
                                                </AccordionTrigger>
                                                <AccordionContent>
                                                    <DeploymentSummary deployment={deployment} />
                                                    <div className="mt-8">
                                                        <Button variant="secondary" href={`/deployments/${deployment._id}/canary-users`}>
                                                            <UsersRound />
                                                            {t("deployments.actions.view_canary_users")}
                                                        </Button>
                                                    </div>
                                                </AccordionContent>
                                            </AccordionItem>
                                        ))}
                                </Accordion>
                            </div>
                        </section>
                    )}

                    {deployments.filter(deployment => !deployment.active) !== null && (
                        <section>
                            <SectionHeader icon={<History />} title={t("deployments.history")} />
                            <Accordion type="single" collapsible>
                                {deployments
                                    .filter(deployment => !deployment.active)
                                    ?.map(deployment => (
                                        <AccordionItem key={deployment._id} value={deployment._id}>
                                            <AccordionTrigger>
                                                <div className="flex items-end gap-2">
                                                    <h3>Deployment {deployment.deploymentId}</h3>
                                                    <span className="text-sm text-foreground-secondary font-normal">{new Date(deployment.deployedAt).toLocaleDateString()}</span>
                                                </div>
                                            </AccordionTrigger>
                                            <AccordionContent>
                                                <DeploymentSummary deployment={deployment} />
                                                <div className="flex gap-2 mt-8">
                                                    <Button variant="secondary" href={`/deployments/${deployment._id}/canary-users`}>
                                                        <UsersRound />
                                                        {t("deployments.actions.view_canary_users")}
                                                    </Button>
                                                    <Button
                                                        variant="primary"
                                                        onClick={e => {
                                                            e.stopPropagation()
                                                            onRedeploy(deployment._id)
                                                        }}
                                                        disabled={redeployQuery.isPending || deployment.active}
                                                        loading={redeployQuery.isPending && redeployQuery.variables === deployment._id}
                                                        loadingLabel={t("deployments.actions.redeploying")}
                                                    >
                                                        <RefreshCw />
                                                        {t("deployments.actions.redeploy")}
                                                    </Button>
                                                </div>
                                            </AccordionContent>
                                        </AccordionItem>
                                    ))}
                            </Accordion>
                        </section>
                    )}
                </div>
            ) : (
                <EmptyState
                    size="default"
                    iconVariant="bare"
                    tone="muted"
                    grow
                    icon={<PackageOpen />}
                    title={t("deployments.no_deployments")}
                    description={t("deployments.no_deployments_description")}
                />
            )}
        </ApiStatusHandler>
    )
}

export default DeploymentList
