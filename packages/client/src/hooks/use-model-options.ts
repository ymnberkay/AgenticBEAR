import { MODEL_GROUPS, CLAUDE_MODELS } from '@subagent/shared';
import { useProviders } from '../api/hooks/use-providers';

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

/** Built-in models keep providerId undefined (registry resolves them by id heuristic). */
export function encodeModelValue(model: string, providerId?: string): string {
  return providerId ? `${providerId}::${model}` : model;
}

export function decodeModelValue(value: string): { model: string; providerId?: string } {
  const i = value.indexOf('::');
  if (i === -1) return { model: value };
  return { providerId: value.slice(0, i), model: value.slice(i + 2) };
}

/** Merge built-in MODEL_GROUPS with the user's enabled custom providers. */
export function useModelOptions(): ModelOptionGroup[] {
  const { data: providers } = useProviders();

  const builtins: ModelOptionGroup[] = MODEL_GROUPS.map((g) => ({
    label: g.label,
    options: g.models.map((m) => {
      const def = CLAUDE_MODELS[m];
      return {
        value: m,
        label: def?.label ?? m,
        model: m,
        contextWindow: def?.contextWindow,
        costPer1kInput: def?.costPer1kInput,
        costPer1kOutput: def?.costPer1kOutput,
      };
    }),
  }));

  const custom: ModelOptionGroup[] = (providers ?? [])
    .filter((p) => p.enabled)
    .map((p) => ({
      label: p.label,
      options: p.models.map((m) => ({
        value: encodeModelValue(m.id, p.id),
        label: m.label || m.id,
        model: m.id,
        providerId: p.id,
        contextWindow: m.contextWindow,
        costPer1kInput: m.costPer1kInput,
        costPer1kOutput: m.costPer1kOutput,
      })),
    }))
    .filter((g) => g.options.length > 0);

  return [...builtins, ...custom];
}
