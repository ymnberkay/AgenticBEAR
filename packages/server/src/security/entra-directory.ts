/**
 * Entra directory search for the admin user-picker (Settings → Users → Add from Entra).
 * Client-credentials token against Microsoft Graph — requires the app registration to hold
 * the APPLICATION permission `User.Read.All` with admin consent (portal → API permissions).
 */
import type { EntraDirectoryUser } from '@subagent/shared';
import { config } from '../config.js';
import { SsoError } from './sso.js';

let cached: { token: string; exp: number } | undefined;

async function graphToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cached && Date.now() < cached.exp - 60_000) return cached.token;
  const { tenantId, clientId, clientSecret } = config.auth.sso.entra;
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
    }),
  });
  if (!res.ok) throw new Error(`Graph token request failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error('Graph token request returned no access_token');
  cached = { token: body.access_token, exp: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return cached.token;
}

async function graphGet(url: string, forceRefresh = false): Promise<Response> {
  return fetch(url, {
    headers: {
      authorization: `Bearer ${await graphToken(forceRefresh)}`,
      // Advanced query — some tenants require it for OR across properties / mail filtering.
      ConsistencyLevel: 'eventual',
    },
  });
}

/** Search directory users by name/UPN/mail prefix (top 10). */
export async function searchEntraUsers(query: string): Promise<EntraDirectoryUser[]> {
  const q = query.trim().replace(/'/g, "''"); // OData single-quote escaping
  if (!q) return [];
  const filter = `startswith(displayName,'${q}') or startswith(userPrincipalName,'${q}') or startswith(mail,'${q}')`;
  const url = `https://graph.microsoft.com/v1.0/users?$filter=${encodeURIComponent(filter)}&$select=id,displayName,mail,userPrincipalName&$count=true&$top=10`;

  let res = await graphGet(url);
  // A cached token issued before admin consent lacks the role claim → 403. Consent may also have
  // just propagated. Force a fresh token and retry once before surfacing the error.
  if (res.status === 403) res = await graphGet(url, true);
  if (res.status === 403) {
    throw new SsoError('Microsoft Graph denied the request — grant the app the APPLICATION permission "User.Read.All" and click "Grant admin consent" (portal → App registrations → API permissions). If you just granted it, wait a minute and retry.');
  }
  if (!res.ok) throw new Error(`Graph user search failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { value?: { id: string; displayName?: string; mail?: string | null; userPrincipalName?: string }[] };
  return (body.value ?? []).map((u) => ({
    id: u.id,
    displayName: u.displayName ?? '',
    email: emailFromGraphUser(u.mail, u.userPrincipalName),
  }));
}

/**
 * Best email for a directory user. Guest (B2B) accounts often have `mail: null` and a mangled
 * UPN like `jane_contoso.com#EXT#@tenant.onmicrosoft.com` — reconstruct the real address
 * (`jane@contoso.com`) so the derived username is clean.
 */
function emailFromGraphUser(mail: string | null | undefined, upn: string | undefined): string {
  if (mail) return mail;
  const raw = upn ?? '';
  const ext = raw.indexOf('#EXT#');
  if (ext === -1) return raw;
  const local = raw.slice(0, ext);               // jane_contoso.com
  const cut = local.lastIndexOf('_');            // last '_' splits local-part from domain
  return cut === -1 ? local : `${local.slice(0, cut)}@${local.slice(cut + 1)}`;
}
