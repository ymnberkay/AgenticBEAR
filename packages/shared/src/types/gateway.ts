/**
 * Gateway types — API keys issued to internal apps that call the OpenAI-compatible
 * gateway, and per-call usage rows for cost attribution.
 */

export interface GatewayKey {
  id: string;
  name: string;
  /** First chars of the key (e.g. "agb_live_ab12"), for display. */
  keyPrefix: string;
  /**
   * What this key may call. Each entry is either an exact catalog model id, or a parent
   * provider wildcard `owner:<provider>` (e.g. `owner:anthropic`) granting every model under
   * that provider — including ones added later. Empty = all reachable models.
   */
  allowedModels: string[];
  enabled: boolean;
  createdAt: string;
  /** ISO timestamp after which the key is rejected. null = never expires. */
  expiresAt: string | null;
  /**
   * L1 cache scope: 'conversation' (default; keys on the whole message history) or 'lastUser'
   * ("FAQ mode" — keys on the last question only, so a repeated question hits even as the
   * chatbot's conversation history grows).
   */
  cacheScope: 'conversation' | 'lastUser';
  /** Permission group this key counts against (token quota + per-principal usage). null = none. */
  groupId: string | null;
  /** Max requests per minute for this key (sliding window). null = unlimited. */
  rateLimitPerMin: number | null;
  /** Hard spend cap for the current calendar month, in USD. Calls past it are rejected. null = unlimited. */
  monthlyBudgetUsd: number | null;
  lastUsedAt: string | null;
}

export interface CreateGatewayKeyInput {
  name?: string;
  /** Exact model ids and/or `owner:<provider>` wildcards. Empty/omitted = all models. */
  allowedModels?: string[];
  /** ISO timestamp; omit/null for a key that never expires. */
  expiresAt?: string | null;
  /** 'lastUser' = FAQ mode (cache by question only, ignore history). Default 'conversation'. */
  cacheScope?: 'conversation' | 'lastUser';
  /** Permission group this key counts against. null/omitted = none. */
  groupId?: string | null;
  /** Max requests per minute. null/omitted = unlimited. */
  rateLimitPerMin?: number | null;
  /** Monthly spend cap in USD. null/omitted = unlimited. */
  monthlyBudgetUsd?: number | null;
}

/** Prefix marking a parent-provider wildcard entry in `allowedModels`. */
export const PROVIDER_SCOPE_PREFIX = 'owner:';

/** Returned ONCE on creation — includes the full secret. */
export interface GatewayKeyCreated extends GatewayKey {
  key: string;
}

export interface GatewayUsageRow {
  id: string;
  keyId: string | null;
  model: string;
  providerId: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  baselineUsd: number;
  cacheHit: boolean;
  routerTier: string | null;
  createdAt: string;
}

export interface GatewayUsageBucket {
  key: string;
  label: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  baselineUsd: number;
}

/** One day of gateway usage (shape matches the client DateUsage so it feeds the daily chart). */
export interface GatewayUsageDaily {
  date: string;
  /** Total requests served that day. Optional on legacy summaries; treat missing as 0. */
  requests?: number;
  /** Requests that were served from the semantic cache. */
  cacheHits?: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  baselineCostUsd: number;
  savedUsd: number;
}

export interface GatewayUsageSummary {
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  totalBaselineUsd: number;
  savedUsd: number;
  /** Number of requests served from the L1 semantic cache (for hit-rate). */
  cacheHits: number;
  byKey: GatewayUsageBucket[];
  byModel: GatewayUsageBucket[];
  /** Daily buckets across the selected range (ascending), for the over-time chart. */
  byDate: GatewayUsageDaily[];
}
