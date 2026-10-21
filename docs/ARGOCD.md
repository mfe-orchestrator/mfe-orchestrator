# Argo CD

With GitOps turned on, every deploy commits what it ships to the repositories of the project: the
Namespace, the config maps and the secrets of each environment to the configuration repository, and
the Helm values of each application to the applications repository. **Initialize Argo CD**, in the
settings of the project, hands those repositories to an Argo CD you already run, so that what is
committed is what the cluster runs. Only an owner of the project, or an administrator of its
organization, initializes it; the other members see its status.

Argo CD stays where it is, on its own cluster. The console never touches that cluster: it talks to the
Argo CD API, `https://<argocd>/api/v1`, with the token of an account made for it, and every
environment is deployed to the cluster Argo CD runs in (`https://kubernetes.default.svc`).

## Requirements

- **Argo CD 2.8 or later** is required: the ApplicationSets use Go templates, a sync policy of their
  own, and a matrix generator whose git generator takes its revision from the list generator before it.
- The ApplicationSet controller allows a policy per ApplicationSet (see
  [the applications are never deleted](#the-applications-are-never-deleted-by-their-applicationset)).

## What it creates

All of it is labelled `app.kubernetes.io/managed-by: mfe-orchestrator` and
`mfe-orchestrator/project-id: <project id>`. `<project>` below is `mfe-<project slug>-<hash of the
project id>`, so two projects with the same slug, in two organizations, never meet.

| Object | Name | What it does |
| --- | --- | --- |
| AppProject | `<project>` | Lets the applications of the project read its two repositories only, and write only to the namespaces of its environments. Namespace is the one cluster-wide kind it may create. |
| Repository credentials | one per repository | Read-only, over HTTPS. Those of the configuration repository, which holds the secrets in plaintext, are scoped to the AppProject. Those of the applications repository, which holds Helm values only, are global: the git generator of an ApplicationSet reads the repository outside of any AppProject. |
| ApplicationSet | `<project>.environments` | Lists the environments of the project. Argo CD makes from it an Application per environment, `<project>.<environment>`, syncing the folder `<environment>/` (its `namespace.yaml`, `configMaps/*.yaml` and `secrets/*.yaml`) from the default branch of the configuration repository into the namespace of the environment. Automated, with prune and self-heal. The environments are listed rather than found in the repository: a git generator would read the configuration repository outside of the AppProject, and it holds the secrets. |
| ApplicationSet | `<project>.<application>` | Only with an applications repository, one per backend service and per frontend that runs as a container, once it has an image and a version. Makes an Application per environment, `<project>.<application>-<environment>`, for every environment whose branch holds `<application>.yaml`, installed with `microservice-chart/` of that branch and `../<application>.yaml` as values file. An environment whose branch does not exist yet is left out of the list: Argo CD fails an ApplicationSet that names a revision it cannot find. Labelled `mfe-orchestrator/application: <application>`. |

> **Never put a secret in the Helm values.** The applications repository is registered globally, so
> every AppProject of the Argo CD instance may read it. Secrets belong in the secrets of the project,
> committed to the configuration repository.

Every name fits 63 characters, as Argo CD tracks resources with it in a label: a part that would not fit
is cut and ends with a hash. The Helm release of an application is its slug, and Helm refuses a release
name longer than **53 characters**: an application with a longer slug fails to sync, with that error in
Argo CD. Keep the slugs of services and frontends shorter.

Before writing anything, the console checks that every name it is about to take is free or already its
own, and that no repository it registers is already registered in Argo CD by someone else. An object
the account of the token may not read counts as taken. Anything taken stops the initialization with
nothing changed: rename or remove it in Argo CD, then initialize again. Two objects of the project
that would take the same name stop it too: `orders-api` in `dev` and `orders` in `api-dev` are both
`<project>.orders-api-dev`, and a service named `environments` would take the ApplicationSet of the
environments. Rename one of them.

### The Namespace is never pruned

The Namespace manifest the console commits carries
`argocd.argoproj.io/sync-options: Prune=false,Delete=false`: the applications of the environment run in
it, and a configuration repository emptied by mistake, or the Application of an environment deleted, must
not take them down with it.

### The applications are never deleted by their ApplicationSet

Each ApplicationSet carries `syncPolicy.applicationsSync: create-update`: it creates and updates its
applications, and never deletes one. Were the values file of a service wiped from a branch by mistake,
its application in that environment would otherwise go with it, and its workloads with it. An
application whose values file is gone for good is deleted by hand in Argo CD.

Argo CD honours that field only when the ApplicationSet controller allows a policy per ApplicationSet.
Set it in `argocd-cmd-params-cm`, or set the same policy for the whole controller:

```yaml
data:
  applicationsetcontroller.enable.policy.override: "true"
  # or, for every ApplicationSet:
  # applicationsetcontroller.policy: create-update
```

### Re-running it

Initializing again re-aligns Argo CD with the project: **after adding or deleting an environment, or
changing the GitOps repositories, initialize again.** Between two initializations every deploy upserts
the ApplicationSet of each service and frontend, so a service deployed for the first time gets its
Applications without one. A deploy that cannot align Argo CD still goes through, and why shows in the
settings, apart from the errors of the initialization; the next deploy that aligns it clears it. A deploy
does not align while an initialization runs, nor when Argo CD was handed another applications repository
or ApplicationSets per environment by an earlier version: it asks for an initialization instead. A new
environment waits for an initialization too: its namespace joins the AppProject only then, and until
then the deploys leave it out of the ApplicationSets. One
initialization of a project runs at a time. One that has not saved anything for five minutes is taken
for dead and the next may start; should the first come back, it stops instead of overwriting what the
second stored.

- The new environments join the list of `<project>.environments` and of the ApplicationSet of every
  service and frontend, once their branch exists.
- Those of the environments that no longer exist leave the lists, and Argo CD deletes the Application of
  each: `<project>.environments` has `preserveResourcesOnDeletion`, so what it deployed stays in the
  cluster until you remove it; the Applications of the services were never deleted by their ApplicationSet
  and are left, to delete by hand.
- The ApplicationSet of a service or frontend that no longer exists is deleted, and with it, through their
  owner references, the Applications it generated; their workloads stay, as the generated Applications
  carry no finalizer.
- The ApplicationSets an earlier version of the console made per environment,
  `<project>.<environment>.applications`, are deleted the same way once those of the services are in. Only
  an initialization does it: until then, a deploy leaves Argo CD as it is. Their
  workloads stay, and the new Applications take them over: the Helm release and the namespace are the same.
- The Applications an earlier version of the console made itself per environment,
  `<project>.<environment>.config`, are deleted without cascade: the Applications of
  `<project>.environments` take their place.
- The credentials of a repository no longer linked, or linked at another URL, are deleted from Argo CD,
  and its GitLab deploy token is revoked through the connection that created it. A deletion Argo CD
  refuses is remembered, without the credentials, and tried again by the next initialization.

### Moving to another Argo CD

Pointing the project at another URL asks for the Argo CD token and the repository token again: the
stored ones never go to another server. What the console created on the old instance is left there,
because the console no longer trusts an instance it was moved away from: remove the AppProject, the
Applications, the ApplicationSets and the repository credentials by hand. The GitLab deploy tokens the
old instance read with are revoked anyway, on GitLab, so the old instance can no longer clone; a GitHub
or Azure DevOps token you pasted is yours to revoke.

## Network

The backend of the orchestrator opens HTTPS connections to the Argo CD API. Nothing goes the other way:
Argo CD reads the repositories from the Git provider, not from the orchestrator.

- The URL must be reachable from the pods of the orchestrator: through an Ingress, a load balancer or a
  private link between the clusters.
- It must be https. `ARGOCD_ALLOW_INSECURE_HTTP=true` on the backend allows http, for a local cluster
  only: the token and the repository credentials would cross the network in the clear.
- Redirects are not followed: use the URL Argo CD answers at, not one that redirects to it.
- The certificate must be one Node trusts. A private CA goes in `NODE_EXTRA_CA_CERTS` of the backend.
- The URL is the one of the Argo CD server, without `/api/v1`: `https://argocd.example.com`.

## The Argo CD account

The console acts as a local account of Argo CD, with an API key and no password. Add it to
`argocd-cm`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-cm
  namespace: argocd
data:
  accounts.orchestrator: apiKey
```

Give it only what it needs, in `argocd-rbac-cm`. Everything the console creates starts with `mfe-`, so
the AppProjects, the Applications and the ApplicationSets it may touch are only its own:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-rbac-cm
  namespace: argocd
data:
  policy.csv: |
    p, role:orchestrator, projects, *, mfe-*, allow
    p, role:orchestrator, applications, *, mfe-*/*, allow
    p, role:orchestrator, applicationsets, *, mfe-*/*, allow
    p, role:orchestrator, repositories, *, *, allow
    g, orchestrator, role:orchestrator
```

The repositories cannot be narrowed the same way: the RBAC object of a global repository is its URL,
and the applications repository is registered globally.

Then generate its token, and paste it in the settings of the project:

```bash
argocd account generate-token --account orchestrator
```

The token is checked against `/api/v1/session/userinfo` before anything is written. It is stored
encrypted (see [SECRETS.md](SECRETS.md)) and never sent back to the browser.

## Repository credentials

Argo CD reads the repositories with credentials of its own, read-only, never with the token of the
connection of the project, which can write.

| Provider | What to do |
| --- | --- |
| GitLab | Nothing. The console creates a project deploy token with the `read_repository` scope on each repository, and on every initialization creates a new one, hands it to Argo CD, and only then revokes the one before. The token of the connection needs the **Maintainer** role on the repositories and the `api` scope. |
| GitHub | A fine-grained personal access token with **Contents: Read-only** on the two repositories. |
| Azure DevOps | A personal access token with **Code: Read**. |

GitHub and Azure DevOps cannot create a token through their API, so the settings ask for one, used for
every repository that is not on GitLab. It is required on the first initialization and whenever the URL
changes; otherwise, leave it empty to keep the stored one. Like the Argo CD token, it is stored encrypted
and never returned.

## When it fails

The error is shown in the settings and kept on the project until an initialization goes through. What
it says to check:

| Error | What to check |
| --- | --- |
| Not reachable | The URL, the DNS name, and that the orchestrator cluster can reach the Argo CD API. |
| Certificate not trusted | The certificate of Argo CD, or `NODE_EXTRA_CA_CERTS`. |
| Token not accepted | That it is a token of the `orchestrator` account, not expired or revoked. |
| Not allowed | The policy in `argocd-rbac-cm` above. |
| Name taken | An AppProject, Application or ApplicationSet of that name not created by this project. |
| Repository already registered | A registration of the repository made by hand, or by another project. |
| Deploy token not created | The role and the scopes of the GitLab connection. |
| Already running | Another initialization of the project: wait for it to end. |
