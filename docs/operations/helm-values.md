# Helm Values Reference

Every knob in `deploy/helm/agenticbear/values.yaml`, grouped as in the file.
Deploy-specific overrides live in `deploy/helm/values-agb.yaml` — always pass it
with `-f`, and bump `image.tag` **in that file** (a bare `--set` on upgrade drops
every other override).

```bash
helm upgrade agb deploy/helm/agenticbear -n llmhub -f deploy/helm/values-agb.yaml
```

## image

| Key | Default | Meaning |
|---|---|---|
| `image.repository` | `agenticbear` | Image name. Bare name = local image (Docker Desktop); prefix with a registry for ACR etc. |
| `image.tag` | chart `appVersion` | Build tag. Bump on every release. |
| `image.pullPolicy` | `IfNotPresent` | Keep as-is for local images; `Always` when a mutable tag points at a registry. |

## server

| Key | Default | Meaning |
|---|---|---|
| `server.replicaCount` | `1` | Keep at 1 — session registry, MCP transports and login throttling are in hub memory. |
| `server.port` | `3001` | Container port (API + gateway + UI on one port). |
| `server.resources` | 200m/512Mi → 2/2Gi | CPU/memory requests → limits. |
| `server.workspace.persist` | `true` | `/workspace` PVC — git clones + agent file writes survive restarts. |
| `server.workspace.size` / `storageClass` | `10Gi` / cluster default | PVC sizing. |
| `server.extraEnv` | `{}` | Raw env vars merged into the container — escape hatch for anything not templated. |

## uploads

Chat attachment limits, surfaced to the client via `GET /api/config` (no rebuild
needed — takes effect on `helm upgrade`). Base64 inflates files ~1.34×, so keep
`maxVideoMb × 1.34 < bodyLimitMb`.

| Key | Default |
|---|---|
| `uploads.bodyLimitMb` | `64` |
| `uploads.maxImageMb` / `maxAudioMb` / `maxVideoMb` | `20` / `25` / `40` |
| `uploads.maxImages` / `maxAudioClips` / `maxVideos` | `4` / `2` / `1` |

## auth

| Key | Default | Meaning |
|---|---|---|
| `auth.adminUsername` / `adminPassword` | `admin` / `admin` | First admin, seeded once when the users table is empty. Seeding with the default password forces a rotation at first login. |
| `auth.tokenTtlHours` | `168` | Session token lifetime. Sessions slide: past the half-life the server reissues the token transparently. |
| `auth.secret` | `""` (auto) | HMAC secret for tokens + AES key for TOTP secrets at rest. Empty = generated on install and preserved across upgrades. Rotating logs everyone out and invalidates TOTP enrollments. |
| `auth.passwordMinLength` | `8` | Enforced on create, admin reset and self-service change. |
| `auth.local.enabled` | `true` | Username/password form. `false` → SSO-only. |
| `auth.local.adminBreakGlass` | `true` | Admins may still password-login while local auth is off (recovery path when the IdP breaks). `false` = strict SSO-only. |
| `auth.mfa.mode` | `off` | TOTP for password logins: `off` / `optional` (self-enroll from the user menu) / `required` (enrollment forced at next password login). SSO logins delegate MFA to the IdP. |

### auth.sso

| Key | Default | Meaning |
|---|---|---|
| `auth.sso.publicUrl` | `""` | External base URL (`https://agb.example.com`, or `http://localhost` behind the local ingress). **Required in production once any provider is enabled** — OAuth redirect URIs are built from it, never from request headers. |
| `auth.sso.autoProvision` | `true` | Create users on first SSO login (JIT). `false` → only users an admin added (e.g. Settings → Users → Add user → Entra tab) may sign in. |
| `auth.sso.autoLink` | `true` | Attach an SSO identity to an existing user whose username matches the IdP handle/email. Turn off together with `autoProvision` for strict pre-created-users-only mode. |
| `auth.sso.defaultRole` | `contributor` | Role for JIT-provisioned users. |
| `auth.sso.existingSecret` | `""` | Name of a pre-created Secret carrying `AUTH_ENTRA_CLIENT_SECRET` / `AUTH_OIDC_CLIENT_SECRET` / `AUTH_GITHUB_CLIENT_SECRET` (ExternalSecrets / Vault). When set, the chart Secret omits them. |
| `auth.sso.groupsClaim` | `groups` | Token claim carrying IdP group memberships. |
| `auth.sso.groupMapping` | `{}` | IdP group → permission-group **name**. Non-empty = the IdP is the source of truth: a user's permission groups are replaced from this map at every SSO login. GitHub keys are `org/team-slug`. |
| `auth.sso.entra.*` | disabled | Microsoft Entra ID — see [sso-setup.md](sso-setup.md). |
| `auth.sso.oidc.*` | disabled | Any OIDC IdP (Okta, Keycloak, Auth0…) via issuer discovery. |
| `auth.sso.github.*` | disabled | GitHub OAuth (github.com or GHE via `baseUrl`); `org` gates sign-in to active members. |

Usernames for SSO users derive from the mail local-part (`jane.doe@contoso.com`
→ `jane.doe`) — usernames feed session-pod names (`agb-session-<slug>`), so the
full email would produce unwieldy pod names.

## providerKeys

Org-wide fallback LLM keys (`anthropic`, `openai`, `gemini`, `voyage`). Optional —
keys can also be set later in the UI. Prefer `--set-file providerKeys.anthropic=./key`
over committing values.

## cost

The cost-optimization pipeline. All layers independently toggleable
(`"true"`/`"false"` strings):

| Key | Layer |
|---|---|
| `cost.layers.compression` | L0 — deterministic context compression |
| `cost.layers.semanticCache` | L1 — Qdrant semantic cache (`embeddingProvider`, `semanticThreshold`, `semanticTtlSeconds` tune it) |
| `cost.layers.router` | L2 — cheap-model routing (`routerCheapModel`) |
| `cost.layers.promptCache` | L3 — provider prompt cache (`promptCacheTtl`: `5m`/`1h` for Anthropic) |
| `cost.layers.outputMin` | L4 — "be brief" output directive |

## dlp

Egress data-loss prevention: `dlp.enabled`, `dlp.secrets`, `dlp.pii` scan &
redact; `dlp.block: "true"` returns 422 instead of redacting.

## security

`security.ssrfAllowedHosts` — hostnames external agents may call even though they
resolve to private/cluster IPs (exact names or `*.suffix` wildcards; literal IPs
never accepted).

## issuePull / agent

`issuePull.intervalMs` — issue-tracker poll interval (0 disables).
`agent.shell` — `"off"` removes the `run_command` tool from agents.

## postgres / externalDatabase / qdrant

Bundled Postgres and Qdrant, each with `enabled: false` + external URL
alternatives (`externalDatabase.url`, `qdrant.externalUrl`). Passwords under
`postgres.*` — change for anything real.

## service / ingress

ClusterIP service on port 80 → server port. Ingress ships SSE-safe nginx
annotations (proxy buffering off, long read timeouts) — merge yours instead of
replacing. `ingress.host` must agree with `auth.sso.publicUrl`.

## hub / session

| Key | Default | Meaning |
|---|---|---|
| `hub.enabled` | `false` | `true` → hub topology: the server pod becomes the control plane and creates one session pod per logged-in user (RBAC in `hub-rbac.yaml`). |
| `session.image` | chart image | Session-pod image (same build, `AGB_MODE=session`). |
| `session.ttlSeconds` | `1800` | Idle TTL before a session pod is reaped (never mid-run). |
| `session.readyTimeoutSeconds` | `120` | How long login waits for a pod before reporting "starting". |
| `session.basePrefix` | `/u` | Public path prefix for per-user ingress rules. |
| `session.workspace.nfs.*` | disabled | Shared NFS for session workspaces — clones survive pod reaps, one subdirectory per user. |
| `session.networkPolicy.enabled` | `false` | Restrict session-pod ingress to the ingress controller + hub. |
| `session.resources` | 250m/512Mi → 1/2Gi | Per-session-pod sizing. |
