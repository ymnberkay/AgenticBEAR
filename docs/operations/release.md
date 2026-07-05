# LLMHub — Release Runbook

End-to-end: build the image → push to ACR → helm release. Every command here has
been run against the real environment (`znggeneric.azurecr.io`, namespace
`llmhub`). Generic deployment background lives in [deployment.md](deployment.md);
this file is the exact recipe.

**Environment at a glance**

| Thing | Value |
|---|---|
| Registry | `znggeneric.azurecr.io` |
| App image | `znggeneric.azurecr.io/llmhub:<version>` |
| Namespace | `llmhub` |
| Helm release | `llmhub` (chart: `deploy/helm/agenticbear`, overlay: `values-production.yaml`) |
| Resources | `llmhub-server` (Deployment), `llmhub-postgres`, `llmhub-qdrant` (StatefulSets) |
| Pull secret | `acr-pull` in namespace `llmhub` |

---

## 0. One-time setup (already done — repeat only for a new cluster/registry)

```bash
# Login
az login
az acr login --name znggeneric

# Namespace
kubectl create namespace llmhub

# Pull-only ACR token + pull secret in the namespace
az acr token create --name llmhub-pull --registry znggeneric --scope-map _repositories_pull
#   → copy passwords[0].value from the output

kubectl create secret docker-registry acr-pull \
  --namespace llmhub \
  --docker-server=znggeneric.azurecr.io \
  --docker-username=llmhub-pull \
  --docker-password='<TOKEN-PASSWORD>'

# Optional: mirror the stock images if the cluster has no Docker Hub egress.
# (values-production.yaml then needs postgres.image / qdrant.image overrides.)
az acr import --name znggeneric --source docker.io/library/postgres:16-alpine -t llmhub/postgres:16-alpine
az acr import --name znggeneric --source docker.io/qdrant/qdrant:v1.12.4      -t llmhub/qdrant:v1.12.4
```

Release secrets: generate **once**, store in your secret manager, reuse on every
upgrade (a changed `PG_PW` will lock the app out of the existing database; a
changed `AUTH_SECRET` logs every user out):

```bash
export ADMIN_PW='<strong-admin-password>'
export AUTH_SECRET="$(openssl rand -base64 48)"
export PG_PW="$(openssl rand -base64 24)"
```

---

## 1. Build the image

```bash
VERSION=0.0.2                      # bump per release; never reuse a pushed tag
docker build -t znggeneric.azurecr.io/llmhub:$VERSION .
```

Optional local smoke test before pushing:

```bash
docker run -d --name llmhub-smoke -e JWT_SECRET=smoke-$(openssl rand -hex 16) \
  -p 3199:3001 znggeneric.azurecr.io/llmhub:$VERSION
sleep 5 && curl -s http://127.0.0.1:3199/api/health   # expect {"status":"ok",…}
docker rm -f llmhub-smoke
```

## 2. Push to ACR

```bash
az acr login --name znggeneric     # token expires after ~3h — re-run if push says unauthorized
docker push znggeneric.azurecr.io/llmhub:$VERSION
```

## 3. Helm release

```bash
helm upgrade --install llmhub deploy/helm/agenticbear \
  -f deploy/helm/agenticbear/values-production.yaml \
  --namespace llmhub --create-namespace \
  --set image.tag=$VERSION \
  --set-string auth.adminPassword="$ADMIN_PW" \
  --set-string auth.secret="$AUTH_SECRET" \
  --set-string postgres.password="$PG_PW"
```

## 4. Verify

```bash
kubectl -n llmhub get pvc                                  # all Bound
kubectl -n llmhub rollout status deploy/llmhub-server      # "successfully rolled out"
kubectl -n llmhub get pods                                 # all Running

# No ingress yet → port-forward:
kubectl -n llmhub port-forward svc/llmhub-server 8080:80
# → http://localhost:8080  (login: admin / $ADMIN_PW)
curl -s http://localhost:8080/api/health
```

## 5. Rollback

```bash
helm -n llmhub history llmhub          # pick a revision
helm -n llmhub rollback llmhub <rev>
```

Note: rollback restores manifests (image tag included), **not** database
contents — schema migrations that already ran stay run.

## 6. Uninstall

```bash
helm -n llmhub uninstall llmhub
```

This removes the Deployment/StatefulSets/Services/ConfigMap/Secret, but **data
survives on purpose**: StatefulSet PVCs (`data-llmhub-postgres-0`,
`storage-llmhub-qdrant-0`) are never touched by helm, and the `acr-pull` secret
+ namespace were created by hand. A later `helm install` with the same names
picks the old data right back up. For a full wipe:

```bash
kubectl -n llmhub delete pvc --all     # ⚠ irreversible — deletes DB + cache data
kubectl delete namespace llmhub        # also removes acr-pull and anything left
```

---

## Using an existing Postgres / Qdrant

The bundled StatefulSets are optional. In `values-production.yaml`:

```yaml
# External Postgres — bundled one is not installed at all:
postgres:
  enabled: false
externalDatabase:
  url: "postgres://user:pass@your-postgres.internal:5432/llmhub?sslmode=require"

# External Qdrant:
qdrant:
  enabled: false
  externalUrl: "http://your-qdrant.internal:6333"
  collection: llmhub_llm_cache
```

Pass the DB URL on the command line instead of committing credentials:
`--set-string externalDatabase.url="postgres://…"`. Switching an existing
release from bundled → external leaves the old StatefulSet PVCs behind; delete
them once you've confirmed the migration (`kubectl -n llmhub delete pvc …`).

---

## CI (azure-pipelines.yml)

The pipeline automates steps 1–4 on every push to `master`:
build & push `znggeneric.azurecr.io/llmhub:$(Build.BuildId)` → sync `acr-pull`
secret → `helm upgrade` with the chart artifact → rollout gate.

One-time Azure DevOps setup (details in the header of `azure-pipelines.yml`):
service connections `agb-registry` (ACR) + `agb-k8s` (cluster), environment
`agenticbear-prod` (add approvals there), secret variables `ADMIN_PASSWORD`,
`AUTH_SECRET`, `POSTGRES_PASSWORD` — same stability rule as §0.

---

## Field notes (lessons already paid for)

- **`storageClass` must exist on the cluster.** `standard-rwo` (GKE) left PVCs
  `Pending` and pods unschedulable on AKS. `""` = cluster default, always safe.
  PVC storageClass is immutable — fixing it means deleting the PVC + the owning
  StatefulSet and re-running helm.
- **Watch node headroom.** `Insufficient cpu` + autoscaler at max meant the
  server's 500m CPU request never fit; requests are trimmed to 200m in the
  overlay. Raise them when the pool grows.
- **Keep `postgres.password` stable across upgrades** — the data volume is
  initialized with the first password; a new one breaks the app's DB login.
- **Renaming resources (`fullnameOverride`) orphans StatefulSet PVCs.** Helm
  deletes/creates the renamed STS but leaves old `data-*`/`storage-*` PVCs
  behind — delete them manually after a rename to stop paying for the disks.
