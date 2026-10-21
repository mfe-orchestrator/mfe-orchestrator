import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@mfe-orchestrator/design-system"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Rocket } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"
import EnvironmentSelector from "@/components/molecules/EnvironmentSelector"
import useDeploymentsApi from "@/hooks/apiClients/useDeploymentsApi"
import type { Domain } from "@/hooks/apiClients/useDomainsApi"
import { EnvironmentDTO } from "@/hooks/apiClients/useEnvironmentsApi"
import useProjectStore from "@/store/useProjectStore"
import useToastNotificationStore from "@/store/useToastNotificationStore"

/**
 * Deploys one functional domain to the environment picked: only its microfrontends and services move, the
 * other domains keep what the environment serves. Without environments there is nothing to deploy to.
 */
export const DomainDeployButton: React.FC<{ domain: Domain }> = ({ domain }) => {
    const { t } = useTranslation()
    const projectStore = useProjectStore()
    const deploymentsApi = useDeploymentsApi()
    const queryClient = useQueryClient()
    const notifications = useToastNotificationStore()
    const [open, setOpen] = useState(false)
    const [environment, setEnvironment] = useState<EnvironmentDTO | undefined>()

    const environments = projectStore.environments ?? []
    // A pick of an environment deleted since, or of another project, does not stick
    const selected = environments.find(candidate => candidate._id === environment?._id) ?? projectStore.environment

    // With GitOps on the deploy commits to the repositories first, and takes a while
    const deployMutation = useMutation({
        mutationFn: (environmentId: string) => deploymentsApi.createDeployment([environmentId], domain._id),
        onSuccess: async (_deployment, environmentId) => {
            const deployed = environments.find(candidate => candidate._id === environmentId)
            notifications.showSuccessNotification({ message: t("domains.deploy.success", { domain: domain.name, environment: deployed?.name }) })
            setOpen(false)
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["deployments", environmentId] }),
                queryClient.invalidateQueries({ queryKey: ["domain-deployments"] }),
                queryClient.invalidateQueries({ queryKey: ["domain-deployments-matrix"] })
            ])
        }
    })

    if (environments.length === 0) return null

    return (
        <>
            <Button onClick={() => setOpen(true)} dataTestId="domain-deploy">
                <Rocket />
                {t("deployments.deploy_button")}
            </Button>
            <Dialog open={open} onOpenChange={value => !deployMutation.isPending && setOpen(value)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("domains.deploy.title", { domain: domain.name })}</DialogTitle>
                        <DialogDescription>{t("domains.deploy.description")}</DialogDescription>
                    </DialogHeader>
                    <div className={deployMutation.isPending ? "pointer-events-none py-4 opacity-60" : "py-4"}>
                        <EnvironmentSelector selectedEnvironment={selected} environments={environments} onEnvironmentChange={setEnvironment} />
                    </div>
                    <DialogFooter>
                        <Button variant="secondary" type="button" onClick={() => setOpen(false)} disabled={deployMutation.isPending}>
                            {t("common.cancel")}
                        </Button>
                        <Button
                            onClick={() => selected && deployMutation.mutate(selected._id)}
                            disabled={!selected?._id}
                            loading={deployMutation.isPending}
                            loadingLabel={t("deployments.deploying")}
                            dataTestId="domain-deploy-confirm"
                        >
                            <Rocket />
                            {t("deployments.deploy_button")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}

export default DomainDeployButton
