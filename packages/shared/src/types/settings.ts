/** A custom DLP rule: a regex pattern that, when matched in an outgoing prompt, is redacted/blocked. */
export interface DlpRule {
  /** Shown in the [REDACTED:label] marker + the UI. */
  label: string;
  /** JavaScript regex source (compiled with the global flag). */
  pattern: string;
}

/** Per-model throttling. All fields optional; omit/0 = no limit for that dimension. */
export interface ModelLimit {
  /** Max requests per second (token-bucket). */
  requestsPerSecond?: number;
  /** Max in-flight requests for this model (semaphore). */
  maxConcurrent?: number;
  /** Per-request send timeout in milliseconds; the call aborts after this. */
  timeoutMs?: number;
}

export interface Settings {
  apiKey: string;
  openAiApiKey: string;
  geminiApiKey: string;
  theme: 'dark' | 'light';
  /** Organization profile shown in Settings → General. */
  orgName: string;
  orgDescription: string;
  orgContact: string;
  orgWebsite: string;
  /** Org-defined DLP patterns, applied (on top of built-in secret/PII rules) at the egress guard. */
  dlpCustomRules: DlpRule[];
  /** Models (served-model ids) for which the DLP egress guard is skipped. */
  dlpDisabledModels: string[];
  /** Per-model rate limits + timeouts, keyed by catalog model id (incl. `providerId/model`). */
  modelLimits: Record<string, ModelLimit>;
  /** Curated allowlist of catalog model ids to expose in pickers/gateway. Empty = all available. */
  enabledModels: string[];
  /**
   * When true, `enabledModels` is authoritative — only listed models are reachable, so models
   * from a newly-added provider start DISABLED until explicitly enabled. When false (fresh
   * install, never curated), every reachable model is enabled. Flipped on automatically the
   * first time a provider key is added.
   */
  modelCurationEnabled: boolean;
}

export interface UpdateSettingsInput {
  apiKey?: string;
  openAiApiKey?: string;
  geminiApiKey?: string;
  theme?: 'dark' | 'light';
  orgName?: string;
  orgDescription?: string;
  orgContact?: string;
  orgWebsite?: string;
  dlpCustomRules?: DlpRule[];
  dlpDisabledModels?: string[];
  modelLimits?: Record<string, ModelLimit>;
  enabledModels?: string[];
  modelCurationEnabled?: boolean;
}
