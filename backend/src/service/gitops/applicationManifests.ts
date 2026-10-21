import { stringify } from "yaml"

/**
 * The applications repository of GitOps, laid out as an `applications-infra` repository: one branch per
 * environment, a Helm values file `<application>.yaml` at the root for each application, and the chart every
 * one of them is installed with in `microservice-chart/`. An Argo CD Application per application and
 * environment points at the chart, with the values file of the application, on the branch of the environment.
 */

export const APPLICATIONS_CHART_FOLDER = "microservice-chart"

/** In the first line of every values file the console writes: what tells it from one someone else put there */
export const MANAGED_VALUES_MARKER = "# app.kubernetes.io/managed-by: mfe-orchestrator"

/** What a values file is made from: a backend service, or a FRONTEND, which runs as a container the same way */
export interface GitOpsApplication {
    slug: string
    /** The latest version the CI registered: the tag of the image */
    version?: string
    image?: { repository?: string }
    port?: number
    /** The path it is exposed at on the host of every environment */
    exposurePath?: string | null
    livenessPath?: string
    readinessPath?: string
    urls?: Array<{ environmentId: unknown; url: string }>
    configMapIds?: unknown[]
    secretIds?: unknown[]
}

/** The values file of an application, at the root of the branch of each environment */
export const applicationValuesPath = (application: Pick<GitOpsApplication, "slug">) => `${application.slug}.yaml`

/** Only what has an image and a version can be installed: the others are left out of the deploy */
export const isDeployable = (application: GitOpsApplication): application is GitOpsApplication & { version: string; image: { repository: string } } =>
    Boolean(application.version && application.image?.repository)

/** `ghcr.io/acme/orders-api` as the chart takes it: the registry, then the rest. An image of Docker Hub has no registry in front */
export const splitImage = (repository: string): { host: string; name: string } => {
    const [first, ...rest] = repository.split("/")
    const isRegistry = rest.length > 0 && (first.includes(".") || first.includes(":") || first === "localhost")
    return isRegistry ? { host: first, name: rest.join("/") } : { host: "docker.io", name: repository }
}

/** The Ingress of the environment, from the URL the application answers at there; none when it has no URL there */
const ingressOf = (application: GitOpsApplication, environmentId: string) => {
    const url = application.urls?.find(candidate => String(candidate.environmentId) === environmentId)?.url
    if (!url) return undefined
    try {
        const { hostname, pathname } = new URL(url)
        return { host: hostname, path: pathname || "/" }
    } catch {
        return undefined
    }
}

/** The Gateway of the environment the HTTPRoute of an application attaches to, and the listener it attaches to */
export interface ApplicationGateway {
    name: string
    listener: string
    /** HTTPS: every answer tells the browser to stay on it */
    hsts: boolean
}

/**
 * The values of one application in one environment. The config maps and the secrets go by name: the
 * configuration repository holds them, as manifests in the namespace of the environment. With a Gateway in
 * the environment, an application with an exposure path gets a route on it.
 */
export const renderApplicationValues = (
    application: GitOpsApplication & { version: string; image: { repository: string } },
    environment: { _id: unknown; slug: string },
    mapNames: { configMaps: Map<string, string>; secrets: Map<string, string> },
    gateway?: ApplicationGateway
): string => {
    const names = (ids: unknown[] | undefined, byId: Map<string, string>) => (ids ?? []).map(id => byId.get(String(id))).filter((name): name is string => Boolean(name))
    const ingress = ingressOf(application, String(environment._id))
    const route = gateway && application.exposurePath ? { gateway: gateway.name, listener: gateway.listener, path: application.exposurePath, hsts: gateway.hsts } : undefined
    const values = {
        replicas: 1,
        image: { ...splitImage(application.image.repository), tag: application.version },
        containerPort: application.port ?? 8080,
        probes: {
            liveness: { active: Boolean(application.livenessPath), path: application.livenessPath ?? "/" },
            readiness: { active: Boolean(application.readinessPath), path: application.readinessPath ?? "/" }
        },
        environmentMaps: names(application.configMapIds, mapNames.configMaps),
        secrets: names(application.secretIds, mapNames.secrets),
        ...(ingress ? { ingress } : {}),
        ...(route ? { route } : {})
    }
    return `${MANAGED_VALUES_MARKER}\n# Written by every deploy of ${environment.slug}: a change made here is overwritten.\n${stringify(values)}`
}

const CHART_YAML = `apiVersion: v2
name: microservice-chart
description: Helm chart the applications deployed by MFE Orchestrator are installed with
version: 0.1.0
type: application
`

const CHART_VALUES = `replicas: 1

resources:
  requests:
    cpu: 25m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi

image:
  host: docker.io

probes:
  liveness:
    active: true
    path: /health/live
    initialDelaySeconds: 30
  readiness:
    active: true
    path: /health/ready
    initialDelaySeconds: 30

containerPort: 8080

expose:
  service: true

# ingress:
#   className: nginx
#   host: orders.example.com
#   path: /
#   annotations: {}

# An HTTPRoute on the Gateway of the environment, which owns the host: the prefix is stripped
# route:
#   gateway: mfe-shop-1a2b3c
#   listener: https
#   path: /api/orders
#   hsts: true
`

const DEPLOYMENT_TEMPLATE = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Release.Name }}
  labels:
    app: {{ .Release.Name }}
    app.kubernetes.io/component: app
    app.kubernetes.io/name: {{ .Release.Name }}
spec:
  replicas: {{ .Values.replicas }}
  selector:
    matchLabels:
      app: {{ .Release.Name }}
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 25%
      maxSurge: 25%
  revisionHistoryLimit: 1
  template:
    metadata:
      labels:
        app: {{ .Release.Name }}
    spec:
      containers:
        - name: {{ .Release.Name }}
          image: {{ .Values.image.host }}/{{ .Values.image.name }}:{{ .Values.image.tag }}
          {{- if .Values.probes.liveness.active }}
          livenessProbe:
            httpGet:
              path: {{ .Values.probes.liveness.path }}
              port: http
            initialDelaySeconds: {{ .Values.probes.liveness.initialDelaySeconds }}
            periodSeconds: 30
          {{- end }}
          {{- if .Values.probes.readiness.active }}
          readinessProbe:
            httpGet:
              path: {{ .Values.probes.readiness.path }}
              port: http
            initialDelaySeconds: {{ .Values.probes.readiness.initialDelaySeconds }}
            periodSeconds: 30
          {{- end }}
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
          ports:
            - name: http
              containerPort: {{ .Values.containerPort }}
              protocol: TCP
          env:
            - name: HTTP_PORT
              value: "{{ .Values.containerPort }}"
            {{- range .Values.env }}
            - name: {{ .name }}
              value: {{ .value | quote }}
            {{- end }}
          envFrom:
            {{- range .Values.environmentMaps }}
            - configMapRef:
                name: {{ . }}
            {{- end }}
            {{- range .Values.secrets }}
            - secretRef:
                name: {{ . }}
            {{- end }}
          volumeMounts:
            {{- range .Values.configMapVolumes }}
            - name: {{ .name }}
              mountPath: {{ .mountPath }}
              {{- if .subPath }}
              subPath: {{ .subPath }}
              {{- end }}
              readOnly: true
            {{- end }}
      volumes:
        {{- range .Values.configMapVolumes }}
        - name: {{ .name }}
          configMap:
            name: {{ .name }}
        {{- end }}
`

const SERVICE_TEMPLATE = `{{- if .Values.expose.service }}
apiVersion: v1
kind: Service
metadata:
  name: {{ .Release.Name }}
spec:
  type: ClusterIP
  selector:
    app: {{ .Release.Name }}
  ports:
    - name: http
      protocol: TCP
      port: 80
      targetPort: {{ .Values.containerPort }}
{{- end }}
`

const INGRESS_TEMPLATE = `{{- if and .Values.ingress (gt (int .Values.replicas) 0) }}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ .Release.Name }}
  {{- with .Values.ingress.annotations }}
  annotations:
    {{- toYaml . | nindent 4 }}
  {{- end }}
spec:
  {{- with .Values.ingress.className }}
  ingressClassName: {{ . }}
  {{- end }}
  rules:
    - http:
        paths:
          - path: {{ .Values.ingress.path | default "/" }}
            pathType: Prefix
            backend:
              service:
                name: {{ .Release.Name }}
                port:
                  number: 80
      {{- with .Values.ingress.host }}
      host: {{ . }}
      {{- end }}
{{- end }}
`

/**
 * The application on the Gateway of the environment, under its path. The path is stripped, so that the
 * container answers at its root whatever it is exposed at; `/` leaves it as it is.
 */
const HTTPROUTE_TEMPLATE = `{{- if and .Values.route (gt (int .Values.replicas) 0) }}
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: {{ .Release.Name }}
spec:
  parentRefs:
    - name: {{ .Values.route.gateway }}
      {{- with .Values.route.listener }}
      sectionName: {{ . }}
      {{- end }}
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: {{ .Values.route.path | quote }}
      {{- if or (ne .Values.route.path "/") .Values.route.hsts }}
      filters:
        {{- if ne .Values.route.path "/" }}
        - type: URLRewrite
          urlRewrite:
            path:
              type: ReplacePrefixMatch
              replacePrefixMatch: /
        {{- end }}
        {{- if .Values.route.hsts }}
        - type: ResponseHeaderModifier
          responseHeaderModifier:
            set:
              - name: Strict-Transport-Security
                value: "max-age=31536000"
        {{- end }}
      {{- end }}
      backendRefs:
        - name: {{ .Release.Name }}
          port: 80
{{- end }}
`

/** Written on a branch only when it is not there yet: the chart is the team's to change afterwards */
export const CHART_FILES: Array<{ path: string; content: string }> = [
    { path: `${APPLICATIONS_CHART_FOLDER}/Chart.yaml`, content: CHART_YAML },
    { path: `${APPLICATIONS_CHART_FOLDER}/values.yaml`, content: CHART_VALUES },
    { path: `${APPLICATIONS_CHART_FOLDER}/templates/deployment.yaml`, content: DEPLOYMENT_TEMPLATE },
    { path: `${APPLICATIONS_CHART_FOLDER}/templates/service.yaml`, content: SERVICE_TEMPLATE },
    { path: `${APPLICATIONS_CHART_FOLDER}/templates/ingress.yaml`, content: INGRESS_TEMPLATE },
    { path: `${APPLICATIONS_CHART_FOLDER}/templates/httproute.yaml`, content: HTTPROUTE_TEMPLATE }
]
