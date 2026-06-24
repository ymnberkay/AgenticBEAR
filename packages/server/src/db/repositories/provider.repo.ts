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
  async findAll(): Promise<LLMProvider[]> {
    const db = getDb();
    const rows = await db.prepare('SELECT * FROM llm_providers ORDER BY created_at ASC').all<ProviderRow>();
    return rows.map(rowToProvider);
  },

  async findById(id: string): Promise<LLMProvider | undefined> {
    const db = getDb();
    const row = await db.prepare('SELECT * FROM llm_providers WHERE id = ?').get<ProviderRow>(id);
    return row ? rowToProvider(row) : undefined;
  },

  async create(input: CreateProviderInput): Promise<LLMProvider> {
    const db = getDb();
    const id = generateId();
    const now = new Date().toISOString();
    await db.prepare(`
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
    return (await this.findById(id))!;
  },

  async update(id: string, input: UpdateProviderInput): Promise<LLMProvider | undefined> {
    const db = getDb();
    const current = await this.findById(id);
    if (!current) return undefined;

    const label = input.label ?? current.label;
    const kind = input.kind ?? current.kind;
    const baseUrl = input.baseUrl ?? current.baseUrl ?? '';
    // Empty string clears the key; undefined keeps current.
    const apiKey = input.apiKey !== undefined ? input.apiKey : (current.apiKey ?? '');
    const models = input.models ?? current.models;
    const enabled = input.enabled ?? current.enabled;
    const now = new Date().toISOString();

    await db.prepare(`
      UPDATE llm_providers
      SET label = ?, kind = ?, base_url = ?, api_key = ?, models_json = ?, enabled = ?, updated_at = ?
      WHERE id = ?
    `).run(label, kind, baseUrl, apiKey, JSON.stringify(models), enabled ? 1 : 0, now, id);

    return this.findById(id);
  },

  async remove(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db.prepare('DELETE FROM llm_providers WHERE id = ?').run(id);
    return result.changes > 0;
  },
};
