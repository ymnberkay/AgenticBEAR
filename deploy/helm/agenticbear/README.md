# AgenticBEAR — Helm chart

Single-command install:

```bash
# Build + push the app image somewhere your cluster can pull from.
IMG=ghcr.io/ymnberkay/agenticbear:0.2.0
docker build -t "$IMG" ../..
docker push "$IMG"

# Install the whole stack (app + Postgres + Qdrant) into a fresh namespace.
helm upgrade --install agb . \
  --namespace agb --create-namespace \
  --set image.repository=ghcr.io/ymnberkay/agenticbear \
  --set image.tag=0.2.0
```

That brings up:

| Component | Kind | Persistence |
|---|---|---|
| **server** | Deployment (Recreate) | `workspace` PVC (git clones + agent-written files) |
| **postgres** | StatefulSet | own PVC |
| **qdrant** | StatefulSet | own PVC (L1 semantic cache vector store) |
| **service** | ClusterIP | — |
| **ingress** | opt-in via `ingress.enabled=true` | — |

## Reach the app

Without an Ingress (default):

```bash
kubectl -n agb port-forward svc/agb-agenticbear-server 8080:80
open http://localhost:8080
```

With an Ingress (recommended for real use — see `values-production.yaml`):

```yaml
ingress:
  enabled: true
  className: nginx
  host: agenticbear.your-company.com
  tls:
    - secretName: agenticbear-tls
      hosts: [agenticbear.your-company.com]
```

The chart adds SSE-safe defaults (proxy-buffering off, 600s read timeout, 25MB
body limit) automatically — chat streaming works out of the box.

## First login

- User: `admin`
- Password: `admin` (default — change immediately)

The auth secret is auto-generated on install and preserved across upgrades.
Recover it later with:

```bash
kubectl -n agb get secret agb-agenticbear-secret \
  -o jsonpath='{.data.AUTH_SECRET}' | base64 -d
```

## Common overrides

### Swap the bundled Postgres for a managed one

```yaml
postgres:
  enabled: false
externalDatabase:
  url: "postgres://user:pass@db.internal:5432/agb?sslmode=require"
```

### Use an existing Qdrant

```yaml
qdrant:
  enabled: false
  externalUrl: "http://qdrant.shared:6333"
```

### Turn off any cost layer

```yaml
cost:
  layers:
    outputMin: "false"
```

### Point at a bigger PVC + a specific storage class

```yaml
server:
  workspace:
    size: 100Gi
    storageClass: standard-rwo
postgres:
  persistence:
    size: 50Gi
    storageClass: standard-rwo
qdrant:
  persistence:
    size: 50Gi
    storageClass: standard-rwo
```

### Ship provider API keys via the chart

Only useful for org-wide fallback keys; per-user keys are set in the UI.

```yaml
providerKeys:
  anthropic: "sk-ant-..."
  openai:    "sk-..."
  gemini:    "AIza..."
```

Better: use `--set-file providerKeys.anthropic=./anthropic.key` so the file
never enters your git history.

## Upgrade

Migrations run automatically on pod start — they're idempotent
(`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ADD COLUMN` with defaults). Just:

```bash
docker build -t "$IMG" ../.. && docker push "$IMG"
helm upgrade agb . -n agb --set image.tag=<new-sha>
kubectl -n agb rollout status deploy/agb-agenticbear-server
```

If a migration fails, the pod stays not-ready — check
`kubectl -n agb logs deploy/agb-agenticbear-server`. Roll back with
`helm rollback agb`.

## Uninstall

```bash
helm uninstall agb -n agb
```

⚠️ **PVCs are NOT deleted automatically.** To purge everything:

```bash
kubectl -n agb delete pvc --all
kubectl delete ns agb
```

## Why `replicaCount: 1`?

- The chart uses **ReadWriteOnce** PVCs — only one pod can attach at a time.
- The git-workspace tools maintain per-project **local clones** on disk. Two
  pods each with their own clone diverge; commits from one aren't visible to
  the other.
- SQLite (when Postgres is disabled) is inherently single-writer.

If you outgrow one replica, split the app into (a) a stateless API/UI tier
behind an LB and (b) a small "workspace" statefulset owning per-project git
state. That's a v2 refactor — file an issue if you want to help design it.

## Chart values reference

Full list in [`values.yaml`](values.yaml). Notable sections:

- `image` — where to pull the container from
- `server` — resources, workspace PVC, extra env
- `auth` — first-boot admin + JWT secret
- `providerKeys` — org-wide fallback API keys
- `cost` — L0-L4 middleware toggles + tuning
- `dlp` — secret / PII scan behavior
- `issuePull` — inbound tracker sync interval
- `agent` — runtime toggles (`AGENT_SHELL`)
- `postgres` — bundled DB config, opt-out via `postgres.enabled=false`
- `qdrant` — bundled vector store, opt-out via `qdrant.enabled=false`
- `service`, `ingress` — networking
- `podSecurityContext` — pod-level `fsGroup`, etc.

## Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| `CrashLoopBackOff` right after install | Wrong `externalDatabase.url` or Postgres not up yet. Check `kubectl logs`. |
| Startup probe never passes | Cold migrations take ~30-60s on first boot; the probe has a 3-minute budget. Beyond that, migration failure — check logs. |
| Chat responses hang for 30s and then flush | Ingress buffering. Ensure `nginx.ingress.kubernetes.io/proxy-buffering: "off"` is on your Ingress annotations. |
| External-agent image upload rejected | Bump `nginx.ingress.kubernetes.io/proxy-body-size` higher than 25m. |
| Git clone succeeds locally but disappears after restart | Older chart version (< 0.2.0) mounted `/data` as emptyDir. Upgrade or manually set `AGB_WORKSPACES_ROOT=/workspace`. |
| Postgres pod pending | PVC binding — likely `storageClass` doesn't exist. Set `postgres.persistence.storageClass` to a real class name. |
| Qdrant OOMKilled | Increase `qdrant.resources.limits.memory`. L1 cache uses vector RAM proportional to collection size. |

## Local dry run

Render the templates without applying:

```bash
helm template agb . -n agb \
  --set image.repository=agenticbear \
  --set image.tag=local \
  --debug | less
```

Diff the current release against uncommitted changes:

```bash
helm diff upgrade agb . -n agb   # requires helm-diff plugin
```
