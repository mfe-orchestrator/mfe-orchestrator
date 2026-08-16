import { Card, CardContent, CardHeader, CodeBlock } from "@mfe-orchestrator/design-system"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"
import IntegrateMicrofrontendsDialog from "@/pages/integration/partials/components/IntegrateMicrofrontendsDialog"

/**
 * The url is addressed by project, not by environment: the backend resolves which environment
 * answers from the domain the page asking is served on, so the very same `index.html` can be
 * promoted from one environment to the next without being edited. Naming an environment here
 * would bake it into the artifact.
 */
export const EnvironmentVariablesIntegration = ({ projectId }: { projectId?: string }) => {
    const { t } = useTranslation()
    const envVarsUrl = projectId ? `https://${window.location.host}/api/serve/global-variables/auto/${projectId}` : ""

    const [isIntegrateDialogOpen, setIsIntegrateDialogOpen] = useState(false)

    return (
        <Card>
            <CardHeader>
                <h2 className="text-xl font-semibold">{t("integration.env_vars_integration_tab.title")}</h2>
                <p>{t("integration.env_vars_integration_tab.description")}</p>
            </CardHeader>

            <CardContent className="pt-4">
                {/* The same tag, written into the document of every host by us instead of by hand. */}
                <div className="mb-4">
                    <Button onClick={() => setIsIntegrateDialogOpen(true)}>{t("integration.env_vars_integration_tab.integrate_button")}</Button>
                </div>

                <IntegrateMicrofrontendsDialog isOpen={isIntegrateDialogOpen} onOpenChange={setIsIntegrateDialogOpen} scope="GLOBAL_VARIABLES" />

                <h3 className="text-lg font-semibold">{t("integration.env_vars_integration_tab.javascript_title")}</h3>
                <CodeBlock
                    label={
                        <>
                            {t("integration.env_vars_integration_tab.javascript_description")} <code>window.globalConfig</code>:
                        </>
                    }
                    code={`<script src="${envVarsUrl}/index.js"></script>`}
                    wrapperClassName="mb-4"
                />
                <p className="mb-4 text-sm text-foreground-secondary">{t("integration.env_vars_integration_tab.javascript_auto_note")}</p>
                <h4 className="text-md font-semibold mb-3">{t("integration.env_vars_integration_tab.javascript_example")}</h4>
                <CodeBlock
                    code={`// Access environment variables like this:
const apiUrl = window.globalConfig?.API_URL;
const featureFlag = window.globalConfig?.ENABLE_FEATURE;

// Use them in your application
if (featureFlag) {
	// Feature is enabled
	fetch(apiUrl + '/data').then(/* ... */);
}`}
                    wrapperClassName="mb-4"
                />

                <h3 className="text-lg font-semibold">{t("integration.env_vars_integration_tab.javascript_direct_api_access")}</h3>
                <p className="mb-4">{t("integration.env_vars_integration_tab.javascript_direct_api_access_description")}</p>
                <CodeBlock
                    code={`fetch('${envVarsUrl}')
	.then(response => response.json())
	.then(data => {
	console.log(data);
	});
				`}
                />
            </CardContent>
        </Card>
    )
}

export default EnvironmentVariablesIntegration
