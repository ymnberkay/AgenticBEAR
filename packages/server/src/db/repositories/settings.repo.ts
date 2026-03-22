import { getDb } from '../client.js';
import { DEFAULT_SETTINGS } from '@subagent/shared';
import type { Settings, UpdateSettingsInput } from '@subagent/shared';

interface SettingsRow {
  id: number;
  api_key: string;
  default_model: string;
  default_max_tokens: number;
  theme: string;
  default_workspace_path: string;
  max_concurrent_agents: number;
  auto_save_interval: number;
}

function rowToSettings(row: SettingsRow): Settings {
  return {
    apiKey: row.api_key,
    defaultModel: row.default_model as Settings['defaultModel'],
    defaultMaxTokens: row.default_max_tokens,
    theme: row.theme as Settings['theme'],
    defaultWorkspacePath: row.default_workspace_path,
    maxConcurrentAgents: row.max_concurrent_agents,
    autoSaveInterval: row.auto_save_interval,
  };
}

export const settingsRepo = {
  getSettings(): Settings {
    const db = getDb();
    const row = db.prepare('SELECT * FROM settings WHERE id = 1').get() as SettingsRow | undefined;

    if (!row) {
      // Insert default settings
      db.prepare(`
        INSERT INTO settings (id, api_key, default_model, default_max_tokens, theme, default_workspace_path, max_concurrent_agents, auto_save_interval)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        DEFAULT_SETTINGS.apiKey,
        DEFAULT_SETTINGS.defaultModel,
        DEFAULT_SETTINGS.defaultMaxTokens,
        DEFAULT_SETTINGS.theme,
        DEFAULT_SETTINGS.defaultWorkspacePath,
        DEFAULT_SETTINGS.maxConcurrentAgents,
        DEFAULT_SETTINGS.autoSaveInterval,
      );

      return { ...DEFAULT_SETTINGS };
    }

    return rowToSettings(row);
  },

  updateSettings(input: UpdateSettingsInput): Settings {
    const db = getDb();
    const current = this.getSettings();

    const apiKey = input.apiKey ?? current.apiKey;
    const defaultModel = input.defaultModel ?? current.defaultModel;
    const defaultMaxTokens = input.defaultMaxTokens ?? current.defaultMaxTokens;
    const theme = input.theme ?? current.theme;
    const defaultWorkspacePath = input.defaultWorkspacePath ?? current.defaultWorkspacePath;
    const maxConcurrentAgents = input.maxConcurrentAgents ?? current.maxConcurrentAgents;
    const autoSaveInterval = input.autoSaveInterval ?? current.autoSaveInterval;

    db.prepare(`
      UPDATE settings SET api_key = ?, default_model = ?, default_max_tokens = ?, theme = ?, default_workspace_path = ?, max_concurrent_agents = ?, auto_save_interval = ?
      WHERE id = 1
    `).run(apiKey, defaultModel, defaultMaxTokens, theme, defaultWorkspacePath, maxConcurrentAgents, autoSaveInterval);

    return this.getSettings();
  },
};
