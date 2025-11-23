import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { useTranslation } from "react-i18next"

export const EnvironmentVariablesIntegration = ({ environmentId }: { environmentId?: string }) => {
    const { t } = useTranslation()
    const envVarsUrl = environmentId ? `https://${window.location.host}/api/serve/global-variables/${environmentId}` : ""

    return (
        <Card>
            <CardHeader>
                <h2 className="text-xl font-semibold">{t("integration.env_vars_integration_tab.title")}</h2>
                <p>{t("integration.env_vars_integration_tab.description")}</p>
            </CardHeader>

            <CardContent className="pt-4">
                <h3 className="text-lg font-semibold">{t("integration.env_vars_integration_tab.javascript_title")}</h3>
                <p className="mb-4">
                    {t("integration.env_vars_integration_tab.javascript_description")} <code>window.globalConfig</code>:
                </p>
                <pre className="bg-muted p-4 rounded-md overflow-x-auto text-sm mb-4">
                    <code>{`<script src="${envVarsUrl}/index.js"></script>`}</code>
                </pre>
                <h4 className="text-md font-semibold mb-3">{t("integration.env_vars_integration_tab.javascript_example")}</h4>
                <pre className="bg-muted p-4 rounded-md overflow-x-auto text-sm mb-4">
                    <code>
                        {`// Access environment variables like this:
const apiUrl = window.globalConfig?.API_URL;
const featureFlag = window.globalConfig?.ENABLE_FEATURE;

// Use them in your application
if (featureFlag) {
	// Feature is enabled
	fetch(apiUrl + '/data').then(/* ... */);
}`}
                    </code>
                </pre>

                <h3 className="text-lg font-semibold">{t("integration.env_vars_integration_tab.javascript_direct_api_access")}</h3>
                <p className="mb-4">{t("integration.env_vars_integration_tab.javascript_direct_api_access_description")}</p>
                <pre className="bg-muted p-4 rounded-md overflow-x-auto text-sm">
                    <code>
                        {`fetch('${envVarsUrl}')
	.then(response => response.json())
	.then(data => {
	console.log(data);
	});
				`}
                    </code>
                </pre>
            </CardContent>
        </Card>
    )
}

export default EnvironmentVariablesIntegration
