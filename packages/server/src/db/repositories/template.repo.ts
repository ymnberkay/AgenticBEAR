import { getDb } from '../client.js';
import { generateId } from '@subagent/shared';
import type { PromptTemplate, TemplateCategory, CreateTemplateInput, ModelConfig, AgentPermissions } from '@subagent/shared';

interface TemplateRow {
  id: string;
  name: string;
  category: string;
  description: string;
  system_prompt: string;
  default_model_config: string;
  default_permissions: string;
  suggested_icon: string;
  suggested_color: string;
  is_built_in: number;
  created_at: string;
  updated_at: string;
}

function rowToTemplate(row: TemplateRow): PromptTemplate {
  return {
    id: row.id,
    name: row.name,
    category: row.category as TemplateCategory,
    description: row.description,
    systemPrompt: row.system_prompt,
    defaultModelConfig: JSON.parse(row.default_model_config) as ModelConfig,
    defaultPermissions: JSON.parse(row.default_permissions) as AgentPermissions,
    suggestedIcon: row.suggested_icon,
    suggestedColor: row.suggested_color,
    isBuiltIn: row.is_built_in === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const templateRepo = {
  findAll(): PromptTemplate[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM templates ORDER BY is_built_in DESC, name ASC')
      .all() as TemplateRow[];
    return rows.map(rowToTemplate);
  },

  findById(id: string): PromptTemplate | undefined {
    const db = getDb();
    const row = db.prepare('SELECT * FROM templates WHERE id = ?').get(id) as TemplateRow | undefined;
    return row ? rowToTemplate(row) : undefined;
  },

  findByCategory(category: TemplateCategory): PromptTemplate[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM templates WHERE category = ? ORDER BY name ASC')
      .all(category) as TemplateRow[];
    return rows.map(rowToTemplate);
  },

  create(input: CreateTemplateInput): PromptTemplate {
    const db = getDb();
    const id = generateId();
    const now = new Date().toISOString();

    const defaultModelConfig: ModelConfig = {
      model: 'claude-sonnet-4-20250514',
      maxTokens: 8192,
      temperature: 0.7,
      ...input.defaultModelConfig,
    };

    const defaultPermissions: AgentPermissions = {
      canReadFiles: true,
      canWriteFiles: true,
      canCreateFiles: true,
      canDeleteFiles: false,
      allowedPaths: ['**/*'],
      deniedPaths: ['node_modules/**', '.git/**', '.env*'],
      ...input.defaultPermissions,
    };

    db.prepare(`
      INSERT INTO templates (id, name, category, description, system_prompt, default_model_config, default_permissions, suggested_icon, suggested_color, is_built_in, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
      id,
      input.name,
      input.category,
      input.description,
      input.systemPrompt,
      JSON.stringify(defaultModelConfig),
      JSON.stringify(defaultPermissions),
      input.suggestedIcon ?? 'Bot',
      input.suggestedColor ?? '#71717a',
      now,
      now,
    );

    return this.findById(id)!;
  },

  update(id: string, input: Partial<CreateTemplateInput>): PromptTemplate | undefined {
    const db = getDb();
    const existing = this.findById(id);
    if (!existing) return undefined;

    const now = new Date().toISOString();
    const name = input.name ?? existing.name;
    const category = input.category ?? existing.category;
    const description = input.description ?? existing.description;
    const systemPrompt = input.systemPrompt ?? existing.systemPrompt;
    const suggestedIcon = input.suggestedIcon ?? existing.suggestedIcon;
    const suggestedColor = input.suggestedColor ?? existing.suggestedColor;

    const defaultModelConfig: ModelConfig = input.defaultModelConfig
      ? { ...existing.defaultModelConfig, ...input.defaultModelConfig }
      : existing.defaultModelConfig;

    const defaultPermissions: AgentPermissions = input.defaultPermissions
      ? { ...existing.defaultPermissions, ...input.defaultPermissions }
      : existing.defaultPermissions;

    db.prepare(`
      UPDATE templates SET name = ?, category = ?, description = ?, system_prompt = ?, default_model_config = ?, default_permissions = ?, suggested_icon = ?, suggested_color = ?, updated_at = ?
      WHERE id = ?
    `).run(
      name, category, description, systemPrompt,
      JSON.stringify(defaultModelConfig), JSON.stringify(defaultPermissions),
      suggestedIcon, suggestedColor, now, id,
    );

    return this.findById(id)!;
  },

  remove(id: string): boolean {
    const db = getDb();
    // Don't allow deleting built-in templates
    const existing = this.findById(id);
    if (!existing || existing.isBuiltIn) return false;

    const result = db.prepare('DELETE FROM templates WHERE id = ?').run(id);
    return result.changes > 0;
  },

  seedBuiltInTemplates(templates: Array<Omit<PromptTemplate, 'createdAt' | 'updatedAt'>>): void {
    const db = getDb();
    const now = new Date().toISOString();

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO templates (id, name, category, description, system_prompt, default_model_config, default_permissions, suggested_icon, suggested_color, is_built_in, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);

    const seedTransaction = db.transaction(() => {
      for (const t of templates) {
        insertStmt.run(
          t.id,
          t.name,
          t.category,
          t.description,
          t.systemPrompt,
          JSON.stringify(t.defaultModelConfig),
          JSON.stringify(t.defaultPermissions),
          t.suggestedIcon,
          t.suggestedColor,
          now,
          now,
        );
      }
    });

    seedTransaction();
  },
};
