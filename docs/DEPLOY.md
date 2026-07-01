# AgenticBEAR — Deployment

Two paths:

- **Local prod-mode test** (5 minutes) — verify the image works on your laptop before pushing anywhere.
- **Kubernetes** — the real target.

## Prerequisites

- Docker 20+ (or Podman 4+)
- For Kubernetes: `kubectl`, an ingress controller (nginx-ingress by default), and access to a container registry your cluster can pull from
- 3–5 GB free disk for the image build

The image is a **single container** that serves both the API and the built UI from
`dist/server.js`. Runs as non-root, git available for git-workspace tools,
SQLite by default or Postgres via `DATABASE_URL`.

---

## Path A — Local prod-mode test

```bash
# 1. Prepare secrets
cp .env.example .env
$EDITOR .env                # set POSTGRES_PASSWORD + JWT_SECRET at minimum

# 2. Build + start
docker compose up --build

# → UI at http://localhost:8080
# → Health at http://localhost:8080/api/health
```

Compose spins up:

| Service | Image | Purpose |
|---|---|---|
| `agenticbear` | your local build | app + built UI |
| `postgres` | postgres:16-alpine | database |

Volumes:

- `agb_data` → `/data` inside the app (SQLite fallback + git workspaces mirror)
- `agb_pgdata` → `/var/lib/postgresql/data`

To fall back to SQLite, comment out `DATABASE_URL` in the `agenticbear` service and remove the `postgres` service.

Shut it all down + wipe:

```bash
docker compose down -v      # -v also removes the volumes
```

---

## Path B — Kubernetes

### 1. Build + push the image

Any registry works — GHCR, ECR, GCR, Docker Hub, Harbor. Example with GHCR:

```bash
IMAGE=ghcr.io/ymnberkay/agenticbear:$(git rev-parse --short HEAD)

docker build -t "$IMAGE" .
docker push "$IMAGE"
```

Update `k8s/deployment.yaml`'s `image:` field to point at your tag. If you push
frequently, use a kustomize overlay so you don't touch the base manifests each time.

### 2. Prepare secrets

```bash
cp k8s/secret.example.yaml k8s/secret.yaml
$EDITOR k8s/secret.yaml     # fill in JWT_SECRET, DATABASE_URL, optional provider keys
```

Generate a strong JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Add `k8s/secret.yaml` to `.gitignore` (it already matches `.env.*` via the
existing rules — verify before committing).

Enable the `secret.yaml` line in `k8s/kustomization.yaml`.

### 3. Decide on Postgres

**Option A — Managed DB (recommended for prod).** Put its connection string
in `agenticbear-secrets.DATABASE_URL`. Skip `postgres.yaml`.

**Option B — Bundled in-cluster Postgres (quick start).** Uncomment
`- postgres.yaml` in `k8s/kustomization.yaml`. Edit
`k8s/postgres.yaml`'s `postgres-credentials` Secret with a real password, then
mirror that same password into `agenticbear-secrets.DATABASE_URL`. NOT highly
available — swap for zalando-postgres-operator or CloudNativePG when you
outgrow one replica.

**Option C — Skip Postgres, stay on SQLite.** Delete the `DATABASE_URL`
key from `agenticbear-secrets`. The app will use `/data/.subagent-manager/data.db`
on the PVC. Single-pod only — you're already there because the deployment
declares `replicas: 1`.

### 4. Apply

```bash
kubectl apply -k k8s/
```

That creates:

- Namespace `agenticbear`
- ConfigMap `agenticbear-config` (non-secret env)
- Secret `agenticbear-secrets`
- PVC `agenticbear-data` (10 GiB by default)
- Deployment `agenticbear` (replicas: 1, Recreate strategy)
- Service `agenticbear` (ClusterIP:80 → pod:3001)
- Ingress `agenticbear` (nginx + TLS via cert-manager)
- Optionally: StatefulSet `postgres` + its Service + Secret

Check rollout:

```bash
kubectl -n agenticbear rollout status deploy/agenticbear
kubectl -n agenticbear get pods -w
kubectl -n agenticbear logs -f deploy/agenticbear
```

### 5. Point DNS at your ingress

Edit `k8s/ingress.yaml`:

- Replace both `agenticbear.example.com` occurrences with your hostname.
- Set `spec.ingressClassName` to match your controller (nginx / traefik / gce).
- If you use cert-manager, uncomment the `cert-manager.io/cluster-issuer` annotation and set it to your issuer's name.

Re-apply:

```bash
kubectl apply -f k8s/ingress.yaml
```

Point an A/CNAME record at your ingress load-balancer IP and give cert-manager
a minute to issue the cert.

### 6. First-time login

```bash
kubectl -n agenticbear logs deploy/agenticbear | grep -i "admin\|initial\|password"
```

Or run the seed-admin command inline if you have one. From the UI: go to
`Settings → Users` to invite teammates.

---

## Sizing + tuning

| Load | CPU request | CPU limit | Memory limit | PVC | Notes |
|---|---|---|---|---|---|
| Solo / demo | 250m | 1 | 1Gi | 5Gi | fine on a t3.small |
| Small team (~5 users) | 500m | 2 | 2Gi | 20Gi | default in `deployment.yaml` |
| Larger team (~20 users) | 1 | 4 | 4Gi | 50Gi | switch to managed Postgres |

Beyond that: split the app in two (stateless API/UI behind an LB + a small
"workspace" statefulset that owns git-clone state on a per-project basis).
That is a v2 refactor.

Ingress notes:

- Set **`proxy-buffering: off`** (already in `ingress.yaml`) — SSE streams from
  the chat and gateway need this.
- Bump **`proxy-body-size`** if you rely on external agents that accept large
  images / PDFs. Default nginx is 1MB.
- Bump **`proxy-read-timeout`** past 60s if the orchestrator does long turns.

---

## Upgrades

```bash
NEW=ghcr.io/ymnberkay/agenticbear:1.2.3

docker build -t "$NEW" .
docker push "$NEW"

kubectl -n agenticbear set image deploy/agenticbear agenticbear="$NEW"
kubectl -n agenticbear rollout status deploy/agenticbear
```

Migrations are idempotent (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ADD COLUMN`
with defaults) and run automatically at startup — no separate step needed.

If a migration fails, the pod exits — check `kubectl logs -p deploy/agenticbear`.
Roll back with `kubectl rollout undo deploy/agenticbear` and open a bug.

---

## Backups

**SQLite mode** — snapshot the PVC. Or:

```bash
kubectl -n agenticbear exec deploy/agenticbear -- \
  sqlite3 /data/.subagent-manager/data.db ".backup /data/backup.db"
kubectl -n agenticbear cp deploy/agenticbear:/data/backup.db ./backup.db
```

**Postgres mode** — whatever your managed DB provides. Or for the bundled
StatefulSet:

```bash
kubectl -n agenticbear exec statefulset/postgres -- \
  pg_dump -U agenticbear agenticbear | gzip > ./agenticbear-$(date +%F).sql.gz
```

Workspaces (git clones) are recoverable from origin — no need to back these up.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `CrashLoopBackOff` right after apply | Wrong `DATABASE_URL` in the Secret. `kubectl logs -p` |
| Health probe never passes | Migration is stuck; look at logs for `Failed to start` |
| Ingress 502 | The app is up but SSE gets buffered — check `proxy-buffering: off` |
| Empty `dist/public` at boot | Build failed; rerun `docker build` locally to see the error |
| `git-workspace: git is not installed` | You built against an older Dockerfile before git was added — rebuild |
| Chat requests time out | Ingress read-timeout too low; bump `nginx.ingress.kubernetes.io/proxy-read-timeout` |

Debug shell in the running pod:

```bash
kubectl -n agenticbear exec -it deploy/agenticbear -- /bin/bash
```

## Migrating an existing SQLite install to Postgres

You already have data in `~/.subagent-manager/data.db` and want to move to
Postgres before the K8s rollout:

```bash
# 1. Point at the target Postgres
export DATABASE_URL="postgres://..."

# 2. Run the built-in migration script (locally, one-shot)
cd packages/server
npm run db:migrate-pg

# 3. Verify a few tables
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM projects;"

# 4. Build + push image, set DATABASE_URL in the k8s Secret, apply.
```
