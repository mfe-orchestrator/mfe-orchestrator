import { stringify } from "yaml"
import { appProjectName, MANAGED_BY, MANAGED_BY_LABEL } from "./argoCdManifests"

/**
 * How an environment is exposed, through the Gateway API as Traefik implements it: the configuration
 * repository holds, per environment, a Gateway that answers on its host, the cert-manager Certificate of that
 * host and the HTTPRoute sending plain HTTP over to HTTPS. Each application then attaches an HTTPRoute of its
 * own to the Gateway, with only the path it is exposed at: the host is the Gateway's.
 */

/** The GatewayClass Traefik registers when its Gateway provider is on */
export const GATEWAY_CLASS = "traefik"

/**
 * The ports of the listeners when the project sets none. Traefik binds a listener to the entry point listening
 * on the same port inside the pod, not to the one the Service exposes: a Traefik Helm chart left at its
 * defaults has `web` and `websecure` on 8000 and 8443, which the project then has to set.
 */
export const GATEWAY_HTTP_PORT = 80
export const GATEWAY_HTTPS_PORT = 443

export const HTTP_LISTENER = "http"
export const HTTPS_LISTENER = "https"

/** What is exposed of one environment of a project */
export interface EnvironmentGateway {
    /** The Gateway, named after the project: two projects sharing a namespace do not take each other's */
    name: string
    namespace: string
    host: string
    /** The ClusterIssuer the certificate is asked of; without one the Gateway answers in plain HTTP only */
    certificateIssuer?: string
    /** The ports of the listeners, GATEWAY_HTTP_PORT and GATEWAY_HTTPS_PORT when left out */
    httpPort?: number
    httpsPort?: number
}

export const gatewayName = (projectId: string, projectSlug: string) => appProjectName(projectId, projectSlug)

/** The listener the HTTPRoutes of the applications attach to: the HTTP one only when there is no HTTPS */
export const applicationListener = (gateway: Pick<EnvironmentGateway, "certificateIssuer">) => (gateway.certificateIssuer ? HTTPS_LISTENER : HTTP_LISTENER)

const tlsSecretName = (gateway: EnvironmentGateway) => `${gateway.name}-tls`

/** The Gateway of the environment, its Certificate and the redirect to HTTPS, as one multi-document manifest */
export const renderGateway = (gateway: EnvironmentGateway): string => {
    // A cluster without the Gateway API or cert-manager CRDs must not keep the config maps and secrets of the
    // environment from syncing: they share the Application, whose dry run would refuse the unknown kinds
    const metadata = (name: string) => ({
        name,
        namespace: gateway.namespace,
        labels: { [MANAGED_BY_LABEL]: MANAGED_BY },
        annotations: { "argocd.argoproj.io/sync-options": "SkipDryRunOnMissingResource=true" }
    })
    const allowedRoutes = { namespaces: { from: "Same" } }
    const listeners: object[] = [{ name: HTTP_LISTENER, protocol: "HTTP", port: gateway.httpPort ?? GATEWAY_HTTP_PORT, hostname: gateway.host, allowedRoutes }]
    const documents: object[] = []

    if (gateway.certificateIssuer) {
        documents.push({
            apiVersion: "cert-manager.io/v1",
            kind: "Certificate",
            metadata: metadata(tlsSecretName(gateway)),
            spec: {
                secretName: tlsSecretName(gateway),
                issuerRef: { name: gateway.certificateIssuer, kind: "ClusterIssuer" },
                // No commonName: it is capped at 64 characters, a host is not
                dnsNames: [gateway.host]
            }
        })
        listeners.push({
            name: HTTPS_LISTENER,
            protocol: "HTTPS",
            port: gateway.httpsPort ?? GATEWAY_HTTPS_PORT,
            hostname: gateway.host,
            tls: { mode: "Terminate", certificateRefs: [{ kind: "Secret", name: tlsSecretName(gateway) }] },
            allowedRoutes
        })
    }

    documents.push({
        apiVersion: "gateway.networking.k8s.io/v1",
        kind: "Gateway",
        metadata: metadata(gateway.name),
        spec: { gatewayClassName: GATEWAY_CLASS, listeners }
    })

    if (gateway.certificateIssuer) {
        documents.push({
            apiVersion: "gateway.networking.k8s.io/v1",
            kind: "HTTPRoute",
            metadata: metadata(`${gateway.name}-https-redirect`),
            spec: {
                parentRefs: [{ name: gateway.name, sectionName: HTTP_LISTENER }],
                rules: [{ filters: [{ type: "RequestRedirect", requestRedirect: { scheme: "https", statusCode: 301 } }] }]
            }
        })
    }

    // The listeners share allowedRoutes: without this the second one would be a YAML alias of the first
    return documents.map(document => stringify(document, { aliasDuplicateObjects: false })).join("---\n")
}
