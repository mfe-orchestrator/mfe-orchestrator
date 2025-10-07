import { useTranslation } from 'react-i18next';
import { BadgeCheck, PackageOpen, Upload, UsersRound, History } from "lucide-react"
import { Button } from "@/components/ui/button/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { RefreshCw, CheckCircle2, AlertCircle, Clock, Users } from "lucide-react"
import useDeploymentsApi from "../../hooks/apiClients/useDeploymentsApi"
import { useMutation, useQuery } from "@tanstack/react-query"
import ApiDataFetcher from "@/components/ApiDataFetcher/ApiDataFetcher"
import { useState } from "react"
import { Link } from "react-router-dom"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"

interface DeploymentListProps {
    environmentId: string
}

const DeploymentList: React.FC<DeploymentListProps> = ({ environmentId }) => {
    const { t } = useTranslation("platform")
    const { getDeployments, redeploy } = useDeploymentsApi()
    const [selectedDeploymentId, setSelectedDeploymentId] = useState<string | null>(null)

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

    const selectedDeployment = deployments.find(deployment => deployment._id === selectedDeploymentId)

    return (
        <ApiDataFetcher queries={[dataQuery]}>
            {deployments.length > 0 ? (
                <div>
                    {deployments.filter(deployment => deployment.active) !== null && (
                        <section className="mb-8">
                            <h2 className="text-xl font-medium mb-1 text-foreground-secondary flex items-center gap-2">
                                <BadgeCheck />
                                <span>Active deployment</span>
                            </h2>
                            <div>
                                <Accordion type="single" collapsible>
                                    {deployments
                                        .filter(deployment => deployment.active)
                                        ?.map(deployment => (
                                            <AccordionItem value={deployment._id}>
                                                <AccordionTrigger>
                                                    <div className="flex items-end gap-2">
                                                        <h3 className="font-medium">Deployment {deployment.deploymentId}</h3>
                                                        <span className="text-sm text-foreground-secondary font-normal">{new Date(deployment.deployedAt).toLocaleDateString()}</span>
                                                    </div>
                                                </AccordionTrigger>
                                                <AccordionContent>
                                                    {deployment.microfrontends.length > 0 && (
                                                        <div>
                                                            <h4 className="font-semibold text-primary mb-2">Microfrontends</h4>
                                                            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
                                                                {deployment.microfrontends.map(microfrontend => (
                                                                    <Card key={microfrontend._id}>
                                                                        <CardHeader className="flex-row items-end justify-between flex-wrap-reverse border-0 pb-0">
                                                                            <div>
                                                                                <CardTitle className="mb-0 text-base">{microfrontend.name}</CardTitle>
                                                                                <div className="text-sm text-foreground-secondary">{microfrontend.slug}</div>
                                                                            </div>
                                                                            <Badge>{microfrontend.version}</Badge>
                                                                        </CardHeader>
                                                                    </Card>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {deployment.variables.length > 0 && (
                                                        <div className="mt-4">
                                                            <h4 className="font-semibold text-primary mb-1">Environment variables</h4>
                                                            <ul>
                                                                {deployment.variables.map(variable => (
                                                                    <li key={variable._id} className="mb-1 last-of-type:mb-0">
                                                                        <div className="flex gap-1 items-start flex-wrap">
                                                                            <span className="font-medium text-foreground-secondary">{variable.key} :</span>
                                                                            <span className="hyphens-auto max-w-full">{variable.value}</span>
                                                                        </div>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}
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
                    <section>
                        <h2 className="text-xl font-medium mb-1 text-foreground-secondary flex items-center gap-2">
                            <History />
                            <span>History</span>
                        </h2>
                        <Accordion type="single" collapsible>
                            {deployments
                                .filter(deployment => !deployment.active)
                                ?.map(deployment => (
                                    <AccordionItem value={deployment._id}>
                                        <AccordionTrigger>
                                            <div className="flex items-end gap-2">
                                                <h3>Deployment {deployment.deploymentId}</h3>
                                                <span className="text-sm text-foreground-secondary font-normal">{new Date(deployment.deployedAt).toLocaleDateString()}</span>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent>
                                            {deployment.microfrontends.length > 0 && (
                                                <div>
                                                    <h4 className="font-semibold text-primary mb-2">Microfrontends</h4>
                                                    <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
                                                        {deployment.microfrontends.map(microfrontend => (
                                                            <Card key={microfrontend._id}>
                                                                <CardHeader className="flex-row items-end justify-between flex-wrap-reverse border-0 pb-0">
                                                                    <div>
                                                                        <CardTitle className="mb-0 text-base">{microfrontend.name}</CardTitle>
                                                                        <div className="text-sm text-foreground-secondary">{microfrontend.slug}</div>
                                                                    </div>
                                                                    <Badge>{microfrontend.version}</Badge>
                                                                </CardHeader>
                                                            </Card>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {deployment.variables.length > 0 && (
                                                <div className="mt-4">
                                                    <h4 className="font-semibold text-primary mb-1">Environment variables</h4>
                                                    <ul>
                                                        {deployment.variables.map(variable => (
                                                            <li key={variable._id} className="mb-1 last-of-type:mb-0">
                                                                <div className="flex gap-1 items-start flex-wrap">
                                                                    <span className="font-medium text-foreground-secondary">{variable.key} :</span>
                                                                    <span className="hyphens-auto max-w-full">{variable.value}</span>
                                                                </div>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
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
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                    <PackageOpen className="h-12 w-12 text-muted-foreground" />
                    <div className="text-center space-y-2">
                        <h3 className="text-lg font-medium">{t("deployments.no_deployments")}</h3>
                        <p className="text-sm text-muted-foreground">{t("deployments.no_deployments_description")}</p>
                    </div>
                </div>
            )}
        </ApiDataFetcher>
    )
}

export default DeploymentList;
