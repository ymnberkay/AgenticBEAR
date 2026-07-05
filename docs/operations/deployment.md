# Deployment

Three paths, in order of preference:

- **A — Local prod-mode test** (5 minutes): verify the image on your laptop before pushing anywhere.
- **B — Kubernetes via Helm** (the real target): app + Postgres + Qdrant in one install.
- **C — Raw manifests** (`k8s/`): kustomize alternative if you can't run Helm.

For the environment-specific, copy-paste release recipe (ACR + `llmhub` namespace) see
[release.md](release.md). For CI/CD automation see [ci-cd.md](ci-cd.md).

The image is a **single container** serving both the API and the built UI from
`dist/server.js`. Non-root, git available for git-workspace tools, SQLite by
default or Postgres via `DATABASE_URL`.

---

## Path A — Local prod-mode test (docker compose)

```bash
cp .env.example .env
$EDITOR .env                # set POSTGRES_PASSWORD + JWT_SECRET at minimum

docker compose up --build
# → UI  at http://localhost:8080
# → API at http://localhost:8080/api/health
```

Compose runs the app image + `postgres:16-alpine`. Volumes: `agb_data` → `/data`
(SQLite fallback + git workspace mirrors), `agb_pgdata` → Postgres data. To fall
back to SQLite, comment out `DATABASE_URL` in the compose file and drop the
`postgres` service.

Tear down (including volumes): `docker compose down -v`

---

## Path B — Kubernetes via Helm (recommended)

Chart: [`deploy/helm/agenticbear`](../../deploy/helm/agenticbear/). One install brings up:

| Component | Kind | Persistence |
|---|---|---|
| **server** | Deployment (Recreate) | `workspace` PVC (git clones + agent-written files) |
| **postgres** | StatefulSet (opt-out) | own PVC |
| **qdrant** | StatefulSet (opt-out) | own PVC (L1 semantic-cache vectors) |
| **service** | ClusterIP | — |
| **ingress** | opt-in | — |

### Install

```bash
# 1. Build + push the image somewhere the cluster can pull from
IMG=<registry>/llmhub:0.0.1
docker build -t "$IMG" . && docker push "$IMG"

# 2. Install
helm upgrade --install llmhub deploy/helm/agenticbear \
  -f deploy/helm/agenticbear/values-production.yaml \
  --namespace llmhub --create-namespace \
  --set image.repository=<registry>/llmhub \
  --set image.tag=0.0.1 \
  --set-string auth.adminPassword='<strong-password>' \
  --set-string auth.secret="$(openssl rand -base64 48)" \
  --set-string postgres.password="$(openssl rand -base64 24)"
```

Keep `auth.secret` and `postgres.password` **stable across upgrades** — a new
auth secret logs everyone out; a new DB password locks the app out of the
already-initialized data volume.

### Reach the app

```bash
kubectl -n llmhub port-forward svc/llmhub-server 8080:80
open http://localhost:8080
```

For real use enable the Ingress in `values-production.yaml` (`ingress.enabled`,
`host`, `tls`). The chart ships SSE-safe defaults (proxy-buffering off, 600s
read timeout, 25MB body) so chat streaming works out of the box.

### First login

`admin` / whatever you set in `auth.adminPassword`. Recover the auth secret later:

```bash
kubectl -n llmhub get secret llmhub-secret -o jsonpath='{.data.AUTH_SECRET}' | base64 -d
```

### Common overrides

```yaml
# Managed Postgres instead of the bundled one:
postgres: { enabled: false }
externalDatabase: { url: "postgres://user:pass@db.internal:5432/llmhub?sslmode=require" }

# Existing Qdrant:
qdrant: { enabled: false, externalUrl: "http://qdrant.shared:6333" }

# Storage class / sizes (leave "" for cluster default — see field notes in release.md):
server:  { workspace:  { size: 100Gi, storageClass: "" } }
postgres: { persistence: { size: 50Gi } }

# Toggle a cost layer:
cost: { layers: { outputMin: "false" } }
```

Provider API keys can ship via `--set-file providerKeys.anthropic=./key` (never
enters git) or be entered later in UI → Settings.

### Upgrade / rollback / uninstall

```bash
helm upgrade llmhub deploy/helm/agenticbear -n llmhub --reuse-values --set image.tag=<new>
kubectl -n llmhub rollout status deploy/llmhub-server

helm -n llmhub history llmhub && helm -n llmhub rollback llmhub <rev>
helm -n llmhub uninstall llmhub        # PVCs + namespace survive; see release.md §6
```

DB migrations run automatically at pod start and are idempotent. A failed
migration keeps the pod not-ready — check `kubectl -n llmhub logs deploy/llmhub-server`.

### Why `replicaCount: 1`?

- PVCs are **ReadWriteOnce** — one pod attaches at a time.
- Git-workspace tools keep per-project **local clones**; two pods would diverge.
- SQLite mode is single-writer; the approval registry + gateway rate limiter are in-memory.

If you outgrow one replica, the v2 shape is a stateless API/UI tier + a small
"workspace" StatefulSet owning git state.

---

## Path C — Raw manifests (`k8s/`)

Kustomize-based alternative when Helm isn't available:

```bash
cp k8s/secret.example.yaml k8s/secret.yaml   # fill JWT_SECRET, DATABASE_URL, provider keys
$EDITOR k8s/kustomization.yaml               # enable secret.yaml (+ postgres.yaml if bundled DB)
kubectl apply -k k8s/
```

Creates namespace `agenticbear`, ConfigMap, Secret, PVC, Deployment (replicas: 1),
Service, Ingress. Postgres choice mirrors the Helm chart: managed DB URL in the
Secret / bundled `postgres.yaml` / no `DATABASE_URL` → SQLite on the PVC.
Edit `k8s/ingress.yaml` for your hostname + class + cert-manager issuer.

> The Helm chart is the maintained path; `k8s/` is kept for clusters where Helm
> is not an option and may lag behind chart features.

---

## Sizing

| Load | CPU request | CPU limit | Memory limit | PVC |
|---|---|---|---|---|
| Solo / demo | 200m | 1 | 1Gi | 5Gi |
| Small team (~5) | 500m | 2 | 2Gi | 20Gi |
| Larger team (~20) | 1 | 4 | 4Gi | 50Gi + managed Postgres |

Ingress notes: keep `proxy-buffering: off` (SSE), bump `proxy-body-size` for
external-agent image uploads, bump `proxy-read-timeout` past 60s for long
orchestrator turns.

---

## Backups

**SQLite mode** — snapshot the PVC, or:

```bash
kubectl -n llmhub exec deploy/llmhub-server -- \
  sqlite3 /data/.subagent-manager/data.db ".backup /data/backup.db"
kubectl -n llmhub cp llmhub-server-<pod>:/data/backup.db ./backup.db
```

**Postgres mode** — managed-DB snapshots, or for the bundled StatefulSet:

```bash
kubectl -n llmhub exec statefulset/llmhub-postgres -- \
  pg_dump -U agb agenticbear | gzip > ./llmhub-$(date +%F).sql.gz
```

Workspaces (git clones) are recoverable from origin — no backup needed.

Migrating an existing SQLite install to Postgres: see
[architecture/database.md](../architecture/database.md) (`npm run db:migrate-pg`).

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `CrashLoopBackOff` right after install | Wrong `externalDatabase.url` / Postgres not up. `kubectl logs -p` |
| Pod `Pending`: "unbound PersistentVolumeClaims" | `storageClass` doesn't exist on the cluster. Use `""` (default). PVC class is immutable — delete PVC + owning STS, re-run helm |
| Pod `Pending`: "Insufficient cpu" | Node pool full; lower `server.resources.requests` or grow the pool |
| Startup probe never passes | Cold migrations take 30–60s (3-min budget). Beyond that: migration failure, check logs |
| Chat hangs ~30s then flushes at once | Ingress buffering — ensure `proxy-buffering: "off"` annotation |
| External-agent image upload rejected | Raise `proxy-body-size` above 25m |
| Git clone disappears after restart | Chart < 0.2.0 mounted `/data` as emptyDir. Upgrade or set `AGB_WORKSPACES_ROOT=/workspace` |
| Qdrant OOMKilled | Raise `qdrant.resources.limits.memory` (RAM ∝ collection size) |

Debug shell: `kubectl -n llmhub exec -it deploy/llmhub-server -- /bin/bash`

Render without applying: `helm template llmhub deploy/helm/agenticbear -f … --debug | less`
