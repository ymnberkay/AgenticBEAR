import type { ClaudeModel } from './agent.js';

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
  defaultModel: ClaudeModel;
  defaultMaxTokens: number;
  theme: 'dark' | 'light';
  defaultWorkspacePath: string;
  maxConcurrentAgents: number;
  autoSaveInterval: number;
  /** Org-defined DLP patterns, applied (on top of built-in secret/PII rules) at the egress guard. */
  dlpCustomRules: DlpRule[];
  /** Models (served-model ids) for which the DLP egress guard is skipped. */
  dlpDisabledModels: string[];
  /** Per-model rate limits + timeouts, keyed by catalog model id (incl. `providerId/model`). */
  modelLimits: Record<string, ModelLimit>;
}

export interface UpdateSettingsInput {
  apiKey?: string;
  openAiApiKey?: string;
  geminiApiKey?: string;
  defaultModel?: ClaudeModel;
  defaultMaxTokens?: number;
  theme?: 'dark' | 'light';
  defaultWorkspacePath?: string;
  maxConcurrentAgents?: number;
  autoSaveInterval?: number;
  dlpCustomRules?: DlpRule[];
  dlpDisabledModels?: string[];
  modelLimits?: Record<string, ModelLimit>;
}
