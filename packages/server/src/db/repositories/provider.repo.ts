import { getDb } from '../client.js';
import { generateId } from '@subagent/shared';
import type { CreateProviderInput, LLMProvider, LLMModelDef, ProviderKind, UpdateProviderInput } from '@subagent/shared';

interface ProviderRow {
  id: string;
  label: string;
  kind: string;
  base_url: string;
  api_key: string;
  models_json: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

function rowToProvider(row: ProviderRow): LLMProvider {
  let models: LLMModelDef[] = [];
  try {
    models = JSON.parse(row.models_json) as LLMModelDef[];
  } catch {
    models = [];
  }
  return {
    id: row.id,
    label: row.label,
    kind: row.kind as ProviderKind,
    baseUrl: row.base_url || undefined,
    apiKey: row.api_key || undefined,
    models,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const providerRepo = {
  findAll(): LLMProvider[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM llm_providers ORDER BY created_at ASC').all() as ProviderRow[];
    return rows.map(rowToProvider);
  },

  findById(id: string): LLMProvider | undefined {
    const db = getDb();
    const row = db.prepare('SELECT * FROM llm_providers WHERE id = ?').get(id) as ProviderRow | undefined;
    return row ? rowToProvider(row) : undefined;
  },

  create(input: CreateProviderInput): LLMProvider {
    const db = getDb();
    const id = generateId();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO llm_providers (id, label, kind, base_url, api_key, models_json, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.label,
      input.kind,
      input.baseUrl ?? '',
      input.apiKey ?? '',
      JSON.stringify(input.models ?? []),
      input.enabled === false ? 0 : 1,
      now,
      now,
    );
    return this.findById(id)!;
  },

  update(id: string, input: UpdateProviderInput): LLMProvider | undefined {
    const db = getDb();
    const current = this.findById(id);
    if (!current) return undefined;

    const label = input.label ?? current.label;
    const kind = input.kind ?? current.kind;
    const baseUrl = input.baseUrl ?? current.baseUrl ?? '';
    // Empty string clears the key; undefined keeps current.
    const apiKey = input.apiKey !== undefined ? input.apiKey : (current.apiKey ?? '');
    const models = input.models ?? current.models;
    const enabled = input.enabled ?? current.enabled;
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE llm_providers
      SET label = ?, kind = ?, base_url = ?, api_key = ?, models_json = ?, enabled = ?, updated_at = ?
      WHERE id = ?
    `).run(label, kind, baseUrl, apiKey, JSON.stringify(models), enabled ? 1 : 0, now, id);

    return this.findById(id);
  },

  remove(id: string): boolean {
    const db = getDb();
    const result = db.prepare('DELETE FROM llm_providers WHERE id = ?').run(id);
    return result.changes > 0;
  },
};
