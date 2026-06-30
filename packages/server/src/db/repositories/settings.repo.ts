import { getDb } from '../client.js';
import { DEFAULT_SETTINGS } from '@subagent/shared';
import type { Settings, UpdateSettingsInput, DlpRule, ModelLimit } from '@subagent/shared';

interface SettingsRow {
  id: number;
  api_key: string;
  openai_api_key: string;
  gemini_api_key: string;
  theme: string;
  dlp_custom_rules: string | null;
  dlp_disabled_models: string | null;
  model_limits_json: string | null;
}

function parseStrArray(json: string | null): string[] {
  try {
    const v = JSON.parse(json ?? '[]') as string[];
    return Array.isArray(v) ? v.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

function parseRules(json: string | null): DlpRule[] {
  try {
    const v = JSON.parse(json ?? '[]') as DlpRule[];
    return Array.isArray(v) ? v.filter((r) => r && typeof r.pattern === 'string') : [];
  } catch {
    return [];
  }
}

function parseModelLimits(json: string | null): Record<string, ModelLimit> {
  try {
    const v = JSON.parse(json ?? '{}') as Record<string, ModelLimit>;
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

function rowToSettings(row: SettingsRow): Settings {
  return {
    apiKey: row.api_key,
    openAiApiKey: row.openai_api_key ?? '',
    geminiApiKey: row.gemini_api_key ?? '',
    theme: row.theme as Settings['theme'],
    dlpCustomRules: parseRules(row.dlp_custom_rules),
    dlpDisabledModels: parseStrArray(row.dlp_disabled_models),
    modelLimits: parseModelLimits(row.model_limits_json),
  };
}

export const settingsRepo = {
  async getSettings(): Promise<Settings> {
    const db = getDb();
    const row = await db.prepare('SELECT * FROM settings WHERE id = 1').get<SettingsRow>();

    if (!row) {
      // Removed/dormant columns (default_model, default_max_tokens, default_workspace_path,
      // max_concurrent_agents, auto_save_interval) keep their NOT NULL DB defaults.
      await db.prepare(`
        INSERT INTO settings (id, api_key, openai_api_key, gemini_api_key, theme)
        VALUES (1, ?, ?, ?, ?)
      `).run(
        DEFAULT_SETTINGS.apiKey,
        DEFAULT_SETTINGS.openAiApiKey,
        DEFAULT_SETTINGS.geminiApiKey,
        DEFAULT_SETTINGS.theme,
      );

      return { ...DEFAULT_SETTINGS };
    }

    return rowToSettings(row);
  },

  async updateSettings(input: UpdateSettingsInput): Promise<Settings> {
    const db = getDb();
    const current = await this.getSettings();

    const apiKey = input.apiKey ?? current.apiKey;
    const openAiApiKey = input.openAiApiKey ?? current.openAiApiKey;
    const geminiApiKey = input.geminiApiKey ?? current.geminiApiKey;
    const theme = input.theme ?? current.theme;
    const dlpCustomRules = input.dlpCustomRules ?? current.dlpCustomRules;
    const dlpDisabledModels = input.dlpDisabledModels ?? current.dlpDisabledModels;
    const modelLimits = input.modelLimits ?? current.modelLimits;

    await db.prepare(`
      UPDATE settings
      SET api_key = ?, openai_api_key = ?, gemini_api_key = ?, theme = ?,
          dlp_custom_rules = ?, dlp_disabled_models = ?, model_limits_json = ?
      WHERE id = 1
    `).run(
      apiKey, openAiApiKey, geminiApiKey, theme,
      JSON.stringify(dlpCustomRules ?? []), JSON.stringify(dlpDisabledModels ?? []),
      JSON.stringify(modelLimits ?? {}),
    );

    return this.getSettings();
  },
};
