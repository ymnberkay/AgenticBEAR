# CI/CD

Two equivalent pipelines exist — use whichever platform hosts the repo. Both do:
**test → docker build & push to ACR → helm release** with a manual-approval gate
before deploy. Only one should be active for a given cluster at a time.

| | GitHub Actions | Azure DevOps |
|---|---|---|
| File | [`.github/workflows/ci-cd.yml`](../../.github/workflows/ci-cd.yml) | [`azure-pipelines.yml`](../../azure-pipelines.yml) |
| PR validation | ✅ typecheck + tests + build | ❌ (release pipeline only) |
| Image tag | `<run>-<short-sha>` + `latest` | `$(Build.BuildId)` + `latest` |
| Approval gate | `production` Environment | `agenticbear-prod` Environment |

## GitHub Actions

Jobs:

1. **test** — every PR and push: `npm ci`, `npm run typecheck`, server unit
   tests, full build.
2. **build-push** — master only: buildx with GHA layer cache, pushes to
   `$ACR_LOGIN_SERVER/llmhub`.
3. **deploy** — master only, gated by the `production` environment: writes the
   kubeconfig, syncs the `acr-pull` secret idempotently, `helm upgrade --install`
   with `values-production.yaml`, then a `rollout status` gate.

One-time setup:

- **Secrets** (repo → Settings → Secrets → Actions): `ACR_LOGIN_SERVER`,
  `ACR_USERNAME`, `ACR_PASSWORD` (push-rights token from
  `az acr token create`/service principal), `KUBE_CONFIG` (base64 kubeconfig),
  `ADMIN_PASSWORD`, `AUTH_SECRET`, `POSTGRES_PASSWORD`.
- **Environment**: create `production` and add required reviewers for manual
  approval before each release.

`AUTH_SECRET` and `POSTGRES_PASSWORD` must stay **stable across deploys** — see
the field notes in [release.md](release.md).

## Azure DevOps

Stages:

1. **Build** — `Docker@2 buildAndPush` to the `agb-registry` service connection;
   publishes the helm chart as a pipeline artifact (deploys use the exact chart
   the build was cut from).
2. **Deploy** — deployment job against the `agenticbear-prod` Environment:
   syncs the `acr-pull` secret, `HelmDeploy@1 upgrade` with
   `values-production.yaml` + image overrides, then a rollout gate on
   `deployment/llmhub-server`.

One-time setup (also in the header of `azure-pipelines.yml`): service
connections `agb-registry` (Docker Registry → ACR) and `agb-k8s` (Kubernetes),
Environment `agenticbear-prod`, secret variables `ADMIN_PASSWORD`,
`AUTH_SECRET`, `POSTGRES_PASSWORD`.

## Shared conventions

- Chart + overlay: `deploy/helm/agenticbear` + `values-production.yaml`
  (`fullnameOverride: llmhub` → resources are `llmhub-server` etc.).
- Namespace `llmhub`, release name `llmhub`, pull secret `acr-pull` — the same
  names the manual runbook ([release.md](release.md)) uses, so manual and
  pipeline releases are interchangeable.
- A release is "done" only when `kubectl rollout status` succeeds; a failed
  rollout fails the pipeline so bad images don't silently linger.
