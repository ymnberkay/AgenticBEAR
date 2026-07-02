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
  /** Successful (billable) requests served that day. Optional on legacy summaries; treat missing as 0. */
  requests?: number;
  /** Non-ok attempts that day (errors + rejections) — for the reliability over-time line. */
  errors?: number;
  /** Requests that were served from the semantic cache. */
  cacheHits?: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  baselineCostUsd: number;
  savedUsd: number;
}

/** Latency distribution (ms) over successful gateway calls. */
export interface GatewayLatency {
  p50: number;
  p95: number;
  p99: number;
  avg: number;
  /** Sample size (successful calls with a recorded latency). */
  count: number;
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
  /** Non-ok attempts (errors + rate-limit/quota/model/DLP rejections) in the range. */
  errorRequests: number;
  /** Count of attempts per status ('ok' | 'error' | 'rate_limited' | 'quota_exceeded' | ...). */
  statusCounts: Record<string, number>;
  /** Latency percentiles over successful calls; null when nothing has a recorded latency. */
  latency: GatewayLatency | null;
  /** L1 cache-hit path breakdown: { exact, semantic, judge }. */
  cacheKindCounts: Record<string, number>;
  /** L2 router tier distribution: { TRIVIAL, SIMPLE, COMPLEX, '(none)' }. */
  routerTierCounts: Record<string, number>;
  byKey: GatewayUsageBucket[];
  byModel: GatewayUsageBucket[];
  /** Per permission-group attribution (group the calling key is linked to). */
  byGroup: GatewayUsageBucket[];
  /** Daily buckets across the selected range (ascending), for the over-time chart. */
  byDate: GatewayUsageDaily[];
}
