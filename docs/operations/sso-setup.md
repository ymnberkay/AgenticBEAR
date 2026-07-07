# SSO Setup — Entra ID, generic OIDC, GitHub

How to wire each identity provider into AgenticBEAR, what to register on the IdP
side, and how to debug the usual failures. Chart keys live under `auth:` in
values — see [helm-values.md](helm-values.md) for the full reference.

## The one rule about redirect URIs

The server builds its OAuth redirect URI as:

```
<auth.sso.publicUrl>/api/auth/sso/<provider>/callback
```

`publicUrl` must be the URL users type into the browser (the ingress host), and
the **exact same string** must be registered at the IdP. Every AADSTS50011-style
error is a mismatch between these two.

| Deployment | `auth.sso.publicUrl` | Register at the IdP |
|---|---|---|
| Local Docker Desktop + nginx ingress | `http://localhost` | `http://localhost/api/auth/sso/entra/callback` |
| Real cluster behind TLS | `https://agb.example.com` | `https://agb.example.com/api/auth/sso/entra/callback` |

Notes:
- `http://` is only accepted by IdPs for `localhost`; anything else must be `https://`.
- No trailing slash, no port on `localhost` (Entra ignores ports for localhost, others may not), full path included.
- In production the server **refuses to boot** with SSO enabled and `publicUrl` empty — deriving redirect URIs from request headers is a host-header-injection risk.

## Microsoft Entra ID

### App registration (portal.azure.com → Entra ID → App registrations)

1. **New registration** — name it (e.g. `agenticbear`), single tenant is fine.
2. **Authentication → Add a platform → Web** → redirect URI
   `<publicUrl>/api/auth/sso/entra/callback`. It must be under the **Web**
   platform, not SPA.
3. **Certificates & secrets → New client secret** — copy the **Value** column
   immediately (shown once). This is `clientSecret`.
4. From **Overview**: `Directory (tenant) ID` → `tenantId`,
   `Application (client) ID` → `clientId`.

### Values

```yaml
auth:
  sso:
    publicUrl: "http://localhost"        # or https://agb.example.com
    autoProvision: false                 # strict: only admin-added users sign in
    autoLink: false
    entra:
      enabled: true
      tenantId: "<Directory (tenant) ID>"
      clientId: "<Application (client) ID>"
      clientSecret: "<secret Value>"     # better: --set on upgrade, or existingSecret
```

With `autoProvision: false`, add people via **Settings → Users → Add user →
Microsoft Entra ID tab**: search the directory by name/email, pick a hit, done.
The account is created with username = mail local-part (`jane.doe@contoso.com`
→ `jane.doe`) and pre-linked to the directory object id, so their first Entra
sign-in lands directly in the right account. With `autoProvision: true`, anyone
in the tenant can sign in and is created on the fly with `defaultRole`.

### Directory search permission (the Users → Entra tab)

The directory picker calls Microsoft Graph with the app's own credentials, which
needs an **Application** permission:

1. App registration → **API permissions → Add a permission → Microsoft Graph →
   Application permissions** → `User.Read.All`.
2. Click **Grant admin consent for `<tenant>`** — the status column must show a
   green check. Without consent the search box shows a clear "grant
   User.Read.All" error; sign-in itself is unaffected.

### Group claims (optional, for `groupMapping`)

Entra does not send groups by default:

1. App registration → **Token configuration → Add groups claim** → Security
   groups (ID token).
2. Entra emits group **object IDs**, so mapping keys are GUIDs:

```yaml
auth:
  sso:
    groupsClaim: "groups"
    groupMapping:
      "9a1b2c3d-....-object-id": "Engineering"   # → permission-group NAME
```

Create the target permission groups first (Settings → Groups). When the mapping
is non-empty the IdP is the source of truth — the user's permission groups are
replaced at every SSO login.

### Common Entra errors

| Error | Cause / fix |
|---|---|
| `AADSTS500113: No reply address is registered` | No redirect URI on the app at all — add it under Authentication → Web. |
| `AADSTS50011: redirect URI ... does not match` | Registered URI differs from `<publicUrl>/api/auth/sso/entra/callback` — check scheme, path, trailing slash, platform type (Web vs SPA). |
| `AADSTS7000215: Invalid client secret` | Wrong value copied (Secret **ID** instead of **Value**) or expired secret. |
| "No account for this identity" (AgenticBEAR page) | `autoProvision: false` and the user wasn't added — add them from Settings → Users. |
| Directory search: "grant User.Read.All" | Graph application permission missing or admin consent not granted. |

## Generic OIDC (Okta, Keycloak, Auth0, …)

Any IdP exposing `/.well-known/openid-configuration`. Flows use PKCE (S256)
automatically.

1. Create a **Web** application at the IdP; grant type: authorization code.
2. Redirect URI: `<publicUrl>/api/auth/sso/oidc/callback`.
3. Values:

```yaml
auth:
  sso:
    oidc:
      enabled: true
      displayName: "Okta"                     # login-button label
      issuer: "https://acme.okta.com"         # discovery lives under this
      clientId: "..."
      clientSecret: "..."
      scopes: "openid profile email"          # add "groups" if the IdP scopes it
```

Group mapping works the same way — put whatever your IdP emits in the groups
claim (names for Keycloak/Okta) as `groupMapping` keys.

## GitHub (github.com or GitHub Enterprise)

1. GitHub → Settings → Developer settings → **OAuth Apps → New OAuth App**.
2. Authorization callback URL: `<publicUrl>/api/auth/sso/github/callback`.
3. Values:

```yaml
auth:
  sso:
    github:
      enabled: true
      clientId: "..."
      clientSecret: "..."
      org: "acme-inc"        # optional: only ACTIVE members of this org may sign in
      # baseUrl: "https://github.corp.example"   # GitHub Enterprise Server
```

Usernames come from the GitHub login. Team-based `groupMapping` keys are
`org/team-slug`; the app requests `read:org` automatically when an org gate or a
mapping is configured.

## MFA, SSO-only mode, and other switches

```yaml
auth:
  mfa:
    mode: "required"      # off | optional | required — TOTP for PASSWORD logins only
  local:
    enabled: false        # SSO-only: hides the password form
    adminBreakGlass: true # admins keep a password door (…/?login=local) until the IdP is proven
```

SSO sign-ins intentionally skip local TOTP — enforce MFA at the IdP (Entra
Conditional Access etc.), which is where enterprise deployments expect it.

With exactly one provider and local auth off, the login page skips the button
and redirects straight to the IdP; `<publicUrl>/?login=local` keeps the
break-glass form reachable.

## Secrets hygiene

`values-agb.yaml` is tracked in git — don't commit real client secrets in it.
Either pass them at upgrade time:

```bash
helm upgrade agb deploy/helm/agenticbear -n llmhub -f deploy/helm/values-agb.yaml \
  --set auth.sso.entra.clientSecret="$ENTRA_SECRET"
```

or point `auth.sso.existingSecret` at a pre-created Secret (ExternalSecrets /
Vault) carrying `AUTH_ENTRA_CLIENT_SECRET` / `AUTH_OIDC_CLIENT_SECRET` /
`AUTH_GITHUB_CLIENT_SECRET`.
