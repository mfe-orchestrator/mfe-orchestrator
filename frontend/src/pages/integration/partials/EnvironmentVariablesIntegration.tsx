import { Card, CardContent, CardHeader } from "@/components/ui/card"

const EnvironmentVariablesIntegration = ({ environmentId }: { environmentId?: string }) => {
    const envVarsUrl = environmentId ? `https://${window.location.host}/api/serve/global-variables/${environmentId}` : ""

    return (
        <Card>
            <CardHeader>
                <h2 className="text-xl font-semibold">Environment Variables Integration</h2>
                <p>Access your environment variables in your microfrontends using the following methods:</p>
            </CardHeader>

            <CardContent className="pt-4">
                <h3 className="text-lg font-semibold">JavaScript Integration</h3>
                <p className="mb-4">
                    Include this script in your HTML to make environment variables available as <code>window.globalConfig</code>:
                </p>
                <pre className="bg-muted p-4 rounded-md overflow-x-auto text-sm mb-4">
                    <code>{`<script src="${envVarsUrl}/index.js"></script>`}</code>
                </pre>
                <h4 className="text-md font-semibold mb-3">Usage Example</h4>
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

                <h3 className="text-lg font-semibold">Direct API Access</h3>
                <p className="mb-4">Fetch variables directly from the API:</p>
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
