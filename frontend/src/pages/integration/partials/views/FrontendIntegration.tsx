import { Card, CardContent, CardHeader, CodeBlock, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Tabs, TabsContent, TabsList, TabsTrigger } from "@mfe-orchestrator/design-system"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"
import { DeploymentDTO } from "@/hooks/apiClients/useDeploymentsApi"
import { Microfrontend } from "@/hooks/apiClients/useMicrofrontendsApi"
import { MicrofrontendCompiler, MicrofrontendFramework } from "@/hooks/apiClients/useServeApi"
import IntegrateMicrofrontendsDialog from "@/pages/integration/partials/components/IntegrateMicrofrontendsDialog"
import MicrofrontendSelector from "@/pages/integration/partials/components/MicrofrontendSelector"
import { CodeIntegration } from "../index"

const AUTO = "AUTO"

const FRAMEWORK_OPTIONS: { value: MicrofrontendFramework; label: string }[] = [
    { value: "REACT", label: "React" },
    { value: "VUE", label: "Vue" },
    { value: "ANGULAR", label: "Angular" }
]

const COMPILER_OPTIONS: { value: MicrofrontendCompiler; label: string }[] = [
    { value: "VITE", label: "Vite" },
    { value: "WEBPACK", label: "Webpack" },
    { value: "WEBCOMPONENT", label: "Web Component" }
]

export const FrontendIntegration = ({ deployment }: { deployment: DeploymentDTO }) => {
    const { t } = useTranslation()
    const [activeTab, setActiveTab] = useState("federation")
    const activeDeployment = deployment instanceof Array ? deployment.find(d => d.active) : deployment

    const curlExample = `# Example CURL request to fetch a remote module
  curl -X GET https://${window.location.host}/api/serve/all/${activeDeployment.environmentId}`

    const [selectedMicrofrontend, setSelectedMicrofrontend] = useState<Microfrontend>(activeDeployment.microfrontends[0])
    // Undefined means "use the stack stored on the microfrontend", which is the normal case:
    // these are here for when detection got it wrong, or for reading another stack's instructions
    const [framework, setFramework] = useState<MicrofrontendFramework | undefined>()
    const [compiler, setCompiler] = useState<MicrofrontendCompiler | undefined>()
    // Undefined opens the dialog on the whole project, an id narrows it to one microfrontend
    const [integrateOnly, setIntegrateOnly] = useState<string | undefined>()
    const [isIntegrateDialogOpen, setIsIntegrateDialogOpen] = useState(false)

    const openIntegrateDialog = (onlyMicrofrontendId?: string) => {
        setIntegrateOnly(onlyMicrofrontendId)
        setIsIntegrateDialogOpen(true)
    }

    return (
        <Card>
            <CardHeader className="border-none">
                <h2 className="text-xl font-semibold">{t("integration.fe_integration_tab.title")}</h2>
                <p>{t("integration.fe_integration_tab.description")}</p>
            </CardHeader>

            <CardContent>
                <div className="flex gap-2 flex-wrap items-end mb-4">
                    <MicrofrontendSelector microfrontends={activeDeployment.microfrontends} selectedMicrofrontend={selectedMicrofrontend} onSelect={setSelectedMicrofrontend} />
                    <Button onClick={() => openIntegrateDialog()}>{t("integration.fe_integration_tab.integrate_all_button")}</Button>
                    <Button variant="secondary" onClick={() => openIntegrateDialog(selectedMicrofrontend?._id)} disabled={!selectedMicrofrontend}>
                        {t("integration.fe_integration_tab.integrate_one_button")}
                    </Button>
                </div>

                <IntegrateMicrofrontendsDialog isOpen={isIntegrateDialogOpen} onOpenChange={setIsIntegrateDialogOpen} onlyMicrofrontendId={integrateOnly} />

                {selectedMicrofrontend ? (
                    <Tabs value={activeTab} onValueChange={setActiveTab} tabsListPosition="fullWidth">
                        <TabsList>
                            <TabsTrigger className="flex-[1_1_120px]" value="federation">
                                {t("integration.fe_integration_tab.federation_tab")}
                            </TabsTrigger>
                            <TabsTrigger className="flex-[1_1_120px]" value="curl">
                                {t("integration.fe_integration_tab.curl.title")}
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="federation">
                            <div className="flex gap-2 flex-wrap items-end mb-4">
                                <div className="flex flex-col gap-1 w-full max-w-60">
                                    <span className="text-sm font-medium text-foreground-secondary">{t("integration.fe_integration_tab.framework_label")}:</span>
                                    <Select value={framework ?? AUTO} onValueChange={value => setFramework(value === AUTO ? undefined : (value as MicrofrontendFramework))}>
                                        <SelectTrigger className="w-full">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={AUTO}>{t("integration.fe_integration_tab.stack_auto")}</SelectItem>
                                            {FRAMEWORK_OPTIONS.map(option => (
                                                <SelectItem key={option.value} value={option.value}>
                                                    {option.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="flex flex-col gap-1 w-full max-w-60">
                                    <span className="text-sm font-medium text-foreground-secondary">{t("integration.fe_integration_tab.compiler_label")}:</span>
                                    <Select value={compiler ?? AUTO} onValueChange={value => setCompiler(value === AUTO ? undefined : (value as MicrofrontendCompiler))}>
                                        <SelectTrigger className="w-full">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={AUTO}>{t("integration.fe_integration_tab.stack_auto")}</SelectItem>
                                            {COMPILER_OPTIONS.map(option => (
                                                <SelectItem key={option.value} value={option.value}>
                                                    {option.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <CodeIntegration microfrontendId={selectedMicrofrontend._id} deploymentId={activeDeployment._id} framework={framework} compiler={compiler} />
                        </TabsContent>

                        <TabsContent value="curl">
                            <h3 className="text-lg font-semibold">{t("integration.fe_integration_tab.curl.title")}</h3>
                            <p className="mb-4">{t("integration.fe_integration_tab.curl.description")}</p>
                            <CodeBlock code={curlExample} copyable copyLabel={t("common.copy")} copiedLabel={t("common.copied")} wrapperClassName="mb-4" />
                            <p className="mb-4">{t("integration.fe_integration_tab.curl.step2")}</p>
                            <div className="border-2 border-border rounded-md overflow-hidden">
                                <iframe src={`https://${window.location.host}/api/serve/all/${activeDeployment.environmentId}`} className="w-full h-[500px] border-0" title="API Response Preview" />
                            </div>
                        </TabsContent>
                    </Tabs>
                ) : (
                    <p>{t("integration.microfrontend_select_placeholder")}</p>
                )}
            </CardContent>
        </Card>
    )
}

export default FrontendIntegration
