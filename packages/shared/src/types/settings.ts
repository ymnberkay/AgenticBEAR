import type { ClaudeModel } from './agent.js';

/** A custom DLP rule: a regex pattern that, when matched in an outgoing prompt, is redacted/blocked. */
export interface DlpRule {
  /** Shown in the [REDACTED:label] marker + the UI. */
  label: string;
  /** JavaScript regex source (compiled with the global flag). */
  pattern: string;
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
}
