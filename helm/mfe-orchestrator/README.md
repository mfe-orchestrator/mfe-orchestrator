# mfe-orchestrator Helm chart

Deploys [Microfrontend Orchestrator](https://github.com/mfe-orchestrator/mfe-orchestrator) on
Kubernetes. The chart installs the all-in-one image (`lory1990/mfe-orchestrator`), which serves
the frontend and the API behind nginx on port `80`.

MongoDB and Redis are **not** deployed by this chart: point the application at instances you
already run, or install them with their own charts (example below).

## Install

```bash
helm install mfe-orchestrator ./helm/mfe-orchestrator \
  --namespace mfe-orchestrator --create-namespace \
  --set env.NOSQL_DATABASE_URL="mongodb://root:example@mongodb:27017" \
  --set env.REDIS_URL="redis://redis:6379" \
  --set envSecrets.JWT_SECRET="$(openssl rand -hex 32)"
```

Packaging the chart for distribution:

```bash
helm package helm/mfe-orchestrator          # -> mfe-orchestrator-<version>.tgz
helm install mfe-orchestrator mfe-orchestrator-0.1.0.tgz -f my-values.yaml
```

Useful commands:

```bash
helm lint helm/mfe-orchestrator
helm template mfe-orchestrator helm/mfe-orchestrator -f my-values.yaml
helm test mfe-orchestrator                   # hits /api/echo from inside the cluster
helm upgrade mfe-orchestrator ./helm/mfe-orchestrator -f my-values.yaml
```

## Environment variables

Every variable the application understands is set from `values.yaml`, and any variable not
listed there can simply be added to the same maps:

| Values key       | Rendered as                     | Use for                                              |
| ---------------- | ------------------------------- | ---------------------------------------------------- |
| `env`            | ConfigMap `<release>-env`       | plain configuration                                  |
| `envSecrets`     | Secret `<release>-env`          | passwords, client secrets, JWT key                   |
| `existingSecret` | `envFrom.secretRef` list        | secrets managed outside of the chart (sealed, ESO …) |
| `existingConfigMap` | `envFrom.configMapRef` list  | configuration managed outside of the chart           |
| `extraEnv`       | container `env` entries         | `valueFrom` references (secret keys, field refs)     |

Both maps accept native YAML scalars — values are quoted when rendered, so `EMAIL_SMTP_PORT: 587`
and `REGISTRATION_ALLOWED: true` are fine. An **empty or null value is skipped entirely**, so the
variable is not injected and the application keeps its own default.

```yaml
env:
  NODE_ENV: prod
  FRONTEND_URL: https://console.example.com
  BACKEND_URL: https://console.example.com/api
  REGISTRATION_ALLOWED: false
  NOSQL_DATABASE_URL: mongodb://root:example@mongodb:27017
  REDIS_URL: redis://redis:6379
  # anything else the app reads can be added here
  MY_FUTURE_VARIABLE: value

envSecrets:
  JWT_SECRET: a-32-bytes-random-string
  NOSQL_DATABASE_PASSWORD: example

existingSecret:
  - mfe-orchestrator-credentials

extraEnv:
  - name: GOOGLE_CLIENT_SECRET
    valueFrom:
      secretKeyRef:
        name: google-oauth
        key: client-secret
```

Precedence, from lowest to highest: `env` → `envSecrets` → `existingConfigMap` → `existingSecret`
→ `extraEnv` (Kubernetes applies `env` after every `envFrom` source).

### Variables shipped in `values.yaml`

Core: `NODE_ENV`, `PORT`, `HOST`, `LOG_LEVEL`, `FRONTEND_URL`, `BACKEND_URL`, `ALLOWED_ORIGINS`,
`MICROFRONTEND_HOST_FOLDER`, `REGISTRATION_ALLOWED`, `ALLOW_EMBEDDED_LOGIN`

MongoDB: `NOSQL_DATABASE_URL`, `NOSQL_DATABASE_NAME`, `NOSQL_DATABASE_USERNAME`,
`NOSQL_DATABASE_PASSWORD`*, plus the legacy `NOSQL_DB_URL`, `NOSQL_DB_DATABASE`, `NOSQL_DB_PASSWORD`*

Redis: `REDIS_URL`, `REDIS_PASSWORD`*

SMTP: `EMAIL_SMTP_HOST`, `EMAIL_SMTP_PORT`, `EMAIL_SMTP_SECURE`, `EMAIL_SMTP_USER`,
`EMAIL_SMTP_FROM`, `EMAIL_SMTP_PASSWORD`*

Auth: `JWT_SECRET`*, `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_AUDIENCE`, `AUTH0_SCOPE`,
`AZURE_ENTRAID_TENANT_ID`, `AZURE_ENTRAID_CLIENT_ID`, `AZURE_ENTRAID_CLIENT_SECRET`*,
`AZURE_ENTRAID_REDIRECT_URI`, `AZURE_ENTRAID_AUTHORITY`, `AZURE_ENTRAID_SCOPES`,
`AZURE_ENTRAID_API_AUDIENCE`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`*, `GOOGLE_REDIRECT_URI`,
`GOOGLE_AUTH_SCOPE`, `GOOGLE_AUTH_HOSTED_DOMAIN`, `GOOGLE_API_AUDIENCE`

Code repositories: `CODE_REPOSITORY_GITHUB_CLIENT_ID`, `CODE_REPOSITORY_GITHUB_CLIENT_SECRET`*

Observability: `SENTRY_DSN`, `TELEMETRY_ENABLED`, `TELEMETRY_DISABLED`, `TELEMETRY_ENDPOINT`,
`TELEMETRY_INTERVAL_HOURS`, `DO_NOT_TRACK`

`*` lives under `envSecrets`. The meaning and defaults of each variable are documented in the
[root README](../../README.md#environment-variables-) and in the comments of `values.yaml`.

## Storage

Uploaded microfrontends are stored on a PersistentVolumeClaim mounted at
`env.MICROFRONTEND_HOST_FOLDER` (default `/upload-microfrontends`). Setting
`persistence.mountPath` overrides the mount point and the variable is kept in sync automatically.

```yaml
persistence:
  enabled: true
  size: 20Gi
  storageClass: fast-rwo
  # existingClaim: my-claim
```

With `persistence.enabled: false` the microfrontends live in the container filesystem and are
lost at every restart. If you scale beyond one replica, use a `ReadWriteMany` volume, otherwise
keep `replicaCount: 1`.

## Ingress

```yaml
ingress:
  enabled: true
  className: nginx
  annotations:
    nginx.ingress.kubernetes.io/proxy-body-size: 50m
  hosts:
    - host: console.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: mfe-orchestrator-tls
      hosts:
        - console.example.com
```

Remember to align `env.FRONTEND_URL` (and `env.BACKEND_URL`, which defaults to
`<FRONTEND_URL>/api`) with the public hostname.

## MongoDB and Redis

Example with the Bitnami charts, installed alongside this one:

```bash
helm install mongodb oci://registry-1.docker.io/bitnamicharts/mongodb \
  --set auth.rootPassword=example
helm install redis oci://registry-1.docker.io/bitnamicharts/redis \
  --set auth.enabled=false

helm install mfe-orchestrator ./helm/mfe-orchestrator \
  --set env.NOSQL_DATABASE_URL="mongodb://root:example@mongodb:27017" \
  --set env.REDIS_URL="redis://redis-master:6379"
```

## Values reference

| Key                            | Default                  | Description                                              |
| ------------------------------ | ------------------------ | -------------------------------------------------------- |
| `replicaCount`                 | `1`                      | Number of pods (ignored when autoscaling is enabled)     |
| `image.repository`             | `lory1990/mfe-orchestrator` | Image repository                                      |
| `image.tag`                    | `""`                     | Image tag, defaults to the chart `appVersion`            |
| `image.pullPolicy`             | `IfNotPresent`           | Image pull policy                                        |
| `imagePullSecrets`             | `[]`                     | Pull secrets for private registries                      |
| `env`                          | see `values.yaml`        | Plain environment variables                              |
| `envSecrets`                   | see `values.yaml`        | Sensitive environment variables                          |
| `existingSecret`               | `[]`                     | Existing Secrets injected with `envFrom`                 |
| `existingConfigMap`            | `[]`                     | Existing ConfigMaps injected with `envFrom`              |
| `extraEnv`                     | `[]`                     | Raw container `env` entries                              |
| `persistence.enabled`          | `true`                   | Persist uploaded microfrontends on a PVC                 |
| `persistence.existingClaim`    | `""`                     | Use an existing PVC instead of creating one              |
| `persistence.storageClass`     | `""`                     | StorageClass (`-` disables dynamic provisioning)         |
| `persistence.accessModes`      | `[ReadWriteOnce]`        | PVC access modes                                         |
| `persistence.size`             | `8Gi`                    | PVC size                                                 |
| `persistence.mountPath`        | `""`                     | Mount point, defaults to `MICROFRONTEND_HOST_FOLDER`     |
| `service.type`                 | `ClusterIP`              | Service type                                             |
| `service.port`                 | `80`                     | Service port                                             |
| `service.nodePort`             | `""`                     | Node port when `service.type` is `NodePort`              |
| `ingress.enabled`              | `false`                  | Create an Ingress                                        |
| `ingress.className`            | `""`                     | Ingress class                                            |
| `ingress.hosts`                | `mfe-orchestrator.local` | Ingress hosts and paths                                  |
| `ingress.tls`                  | `[]`                     | Ingress TLS configuration                                |
| `serviceAccount.create`        | `true`                   | Create a ServiceAccount                                  |
| `resources`                    | `{}`                     | Container resource requests/limits                       |
| `livenessProbe.enabled`        | `true`                   | HTTP liveness probe on `/api/echo`                       |
| `readinessProbe.enabled`       | `true`                   | HTTP readiness probe on `/api/echo`                      |
| `startupProbe.enabled`         | `false`                  | HTTP startup probe on `/api/echo`                        |
| `autoscaling.enabled`          | `false`                  | Create a HorizontalPodAutoscaler                         |
| `restartOnConfigChange`        | `true`                   | Roll the pods when env ConfigMap/Secret change           |
| `strategy`                     | `RollingUpdate`          | Deployment strategy                                      |
| `podAnnotations` / `podLabels` | `{}`                     | Extra pod metadata                                       |
| `commonLabels` / `commonAnnotations` | `{}`               | Metadata added to every resource                         |
| `podSecurityContext` / `securityContext` | `{}`           | Security contexts                                        |
| `nodeSelector` / `tolerations` / `affinity` | `{}`/`[]`/`{}` | Scheduling constraints                                 |
| `topologySpreadConstraints`    | `[]`                     | Topology spread constraints                              |
| `priorityClassName`            | `""`                     | PriorityClass of the pods                                |
| `terminationGracePeriodSeconds`| `30`                     | Graceful shutdown period                                 |
| `extraVolumes` / `extraVolumeMounts` | `[]`               | Additional volumes and mounts                            |
| `extraInitContainers` / `extraContainers` | `[]`          | Additional containers                                    |
