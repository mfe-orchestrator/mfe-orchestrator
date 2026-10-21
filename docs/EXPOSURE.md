# Exposing environments through the Gateway API

With GitOps on, each environment of a project is exposed on a host of its own and each application under a
path of that host, through the Kubernetes Gateway API as Traefik implements it. No API gateway sits between
Traefik and the applications.

- **Project** (Settings → Exposure): the `domain`, e.g. `example.com`, optionally the cert-manager
  `ClusterIssuer` the TLS certificates are asked of, and the ports of the HTTP and HTTPS listeners, `80` and
  `443` by default. Without an issuer the environments answer in plain HTTP.
- **Environment**: the `subdomain`, e.g. `dev`. The host is `dev.example.com`. Left empty, a production
  environment takes the domain itself and any other its slug in lowercase, so `UAT` lands on
  `uat.example.com`. Two environments of the project cannot share a host: the deploy is refused.
- **Service or frontend**: the `exposurePath`, e.g. `/api/orders`, the same in every environment. The prefix is
  stripped before the request reaches the container, so it answers at its root. Without one, the application
  gets no route.

## What each deploy commits

| Repository | File | Content |
|---|---|---|
| Configuration | `<environment>/gateway.yaml` | The `Gateway` of the environment, on its host: an `http` listener and, with an issuer, an `https` one, the `Certificate` it serves and an `HTTPRoute` redirecting `http` to `https` |
| Applications, branch of the environment | `<application>.yaml` | `route:` with the Gateway, the listener and the path |
| Applications, branch of the environment | `microservice-chart/templates/httproute.yaml` | The `HTTPRoute` of an application, written once like the rest of the chart |

Removing the domain takes the Gateway of each environment away on its next deploy. A redeploy of an earlier deployment
commits nothing, the Gateway included: it serves that snapshot again, GitOps is not involved.

## What the cluster needs

1. The Gateway API CRDs (`gateway.networking.k8s.io/v1`).
2. Traefik with its Gateway provider on, which registers the `traefik` GatewayClass:

   ```yaml
   providers:
     kubernetesGateway:
       enabled: true
   ```

   Traefik attaches a listener to the entry point that listens on the same port inside the pod, not on the
   one its Service exposes. The listeners default to `80` and `443`, so the entry points have to listen there:

   ```yaml
   ports:
     web:
       port: 80
     websecure:
       port: 443
   securityContext:
     capabilities:
       add: [NET_BIND_SERVICE]
   ```

   A Traefik Helm chart left at its defaults listens on `8000` and `8443` instead: write those in the
   project settings rather than changing Traefik.
3. With TLS, cert-manager and the `ClusterIssuer` set on the project. An issuer solving HTTP-01 through an
   Ingress class (`http01.ingress.class: traefik`) keeps working as long as the Ingress provider of Traefik
   stays on: the challenge route, host and token path, is longer than the redirect to HTTPS. An issuer solving
   it through `gatewayHTTPRoute` would have to name the Gateway of each project, so prefer DNS-01 there.
4. A Traefik v3 whose Gateway provider supports the `URLRewrite` and `ResponseHeaderModifier` filters of
   HTTPRoute: check the provider page of the Traefik docs for the version installed.

The Gateway manifests carry `SkipDryRunOnMissingResource=true`: on a cluster still without the CRDs, the
config maps and secrets of the environment, which share the Argo CD Application, keep syncing.

Two applications of the project at the same path, `/api` and `/api/` included, refuse the deploy. HTTPS
answers carry `Strict-Transport-Security: max-age=31536000`, without `includeSubDomains`, as an environment
on the domain itself would otherwise force HTTPS on every host under it.

The Application Argo CD has for each environment syncs its whole folder, so the Gateway is applied with the
rest: nothing to set up again.

## Moving off one Kong per environment

Traefik orders its routers by priority, by default the length of the rule, so a `Host + PathPrefix` route
should win over the old `Host` → Kong one and the applications can move over one at a time while Kong still
catches the rest. Check it in the first environment before going on:

1. Turn the Gateway provider on and set the domain and the subdomains.
2. Give an application its exposure path and deploy: check that its path now reaches it, not Kong.
3. Once no Ingress of class `kong` is left in the namespace, delete the Kong route and uninstall Kong.

Two things Kong did that the routes do not: the 10 MB request body limit (`nginx_http_client_max_body_size`),
to be set again with the Traefik `buffering` middleware, and the rate limit and IP allowlist middlewares,
which attach to a route with an `ExtensionRef` filter.
