import { MODEL_GROUPS, CLAUDE_MODELS } from '@subagent/shared';
import { useProviders } from '../api/hooks/use-providers';
import { useModelCatalog } from '../api/hooks/use-gateway';

export interface ModelOption {
  /** <select> value — encodes provider + model (built-ins use bare model id). */
  value: string;
  label: string;
  model: string;
  providerId?: string;
  contextWindow?: number;
  costPer1kInput?: number;
  costPer1kOutput?: number;
}

export interface ModelOptionGroup {
  label: string;
  options: ModelOption[];
}

/** Built-in models keep providerId undefined/null (registry resolves them by id heuristic). */
export function encodeModelValue(model: string, providerId?: string | null): string {
  return providerId ? `${providerId}::${model}` : model;
}

export function decodeModelValue(value: string): { model: string; providerId?: string } {
  const i = value.indexOf('::');
  if (i === -1) return { model: value };
  return { providerId: value.slice(0, i), model: value.slice(i + 2) };
}

function familyLabel(owned: string): string {
  if (owned === 'anthropic') return 'Anthropic';
  if (owned === 'openai') return 'OpenAI';
  if (owned === 'gemini') return 'Gemini';
  return owned;
}

/** Fallback (static MODEL_GROUPS + custom providers) used until the live catalog is available. */
function staticGroups(providers: ReturnType<typeof useProviders>['data']): ModelOptionGroup[] {
  const builtins: ModelOptionGroup[] = MODEL_GROUPS.map((g) => ({
    label: g.label,
    options: g.models.map((m) => {
      const def = CLAUDE_MODELS[m];
      return { value: m, label: def?.label ?? m, model: m, contextWindow: def?.contextWindow, costPer1kInput: def?.costPer1kInput, costPer1kOutput: def?.costPer1kOutput };
    }),
  }));
  const custom: ModelOptionGroup[] = (providers ?? [])
    .filter((p) => p.enabled)
    .map((p) => ({
      label: p.label,
      options: p.models.map((m) => ({
        value: encodeModelValue(m.id, p.id), label: m.label || m.id, model: m.id, providerId: p.id,
        contextWindow: m.contextWindow, costPer1kInput: m.costPer1kInput, costPer1kOutput: m.costPer1kOutput,
      })),
    }))
    .filter((g) => g.options.length > 0);
  return [...builtins, ...custom];
}

/**
 * Model options for the agent picker — sourced from the SAME live catalog as the Models tab
 * (`/api/models`: live-discovered built-ins gated by key + custom providers). Falls back to the
 * static list only until the catalog loads / when nothing is reachable yet.
 */
export function useModelOptions(): ModelOptionGroup[] {
  const { data: providers } = useProviders();
  const { data: catalog } = useModelCatalog();

  if (!catalog || catalog.length === 0) return staticGroups(providers);

  const providerById = new Map((providers ?? []).map((p) => [p.id, p]));
  const groups = new Map<string, ModelOption[]>();

  for (const entry of catalog) {
    // Pickers only show curated-enabled models (disabled = excluded from selection).
    if (entry.enabled === false) continue;
    // Custom-provider model ids are encoded as "<providerId>/<modelId>".
    let providerId: string | undefined;
    let model = entry.id;
    const slash = entry.id.indexOf('/');
    if (slash !== -1) {
      const maybeId = entry.id.slice(0, slash);
      if (providerById.has(maybeId)) {
        providerId = maybeId;
        model = entry.id.slice(slash + 1);
      }
    }

    const provider = providerId ? providerById.get(providerId) : undefined;
    const def = provider ? provider.models.find((m) => m.id === model) : CLAUDE_MODELS[model];
    const groupLabel = provider ? provider.label : familyLabel(entry.owned_by);

    const opt: ModelOption = {
      value: encodeModelValue(model, providerId),
      label: def?.label ?? model,
      model,
      providerId,
      contextWindow: def?.contextWindow,
      costPer1kInput: def?.costPer1kInput,
      costPer1kOutput: def?.costPer1kOutput,
    };
    if (!groups.has(groupLabel)) groups.set(groupLabel, []);
    groups.get(groupLabel)!.push(opt);
  }

  return [...groups.entries()].map(([label, options]) => ({ label, options }));
}
