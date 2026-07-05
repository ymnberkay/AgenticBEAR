/**
 * Level-based model selection for the L2 router.
 *
 * Each model has a capability level 1–10 (weak/cheap → strong/expensive). Given a request's
 * complexity (also 1–10) and the requested model as a CEILING, pick the CHEAPEST model whose
 * level meets the complexity and does not exceed the requested level. Candidates come from the
 * route pool (gateway: the API key's allowed models; else: the requested model's provider).
 */
import { CLAUDE_MODELS, PROVIDER_SCOPE_PREFIX, isBuiltinProviderId } from '@subagent/shared';
import { detectBuiltinProvider } from '../../llm/provider-registry.js';
import { providerRepo } from '../../db/repositories/provider.repo.js';

export interface Candidate {
  providerId?: string;       // undefined → built-in (resolved by model id)
  model: string;
  catalogId: string;         // gateway id: `${providerId}/${model}` (custom) or `${family}/${model}` (built-in)
  owner: string;             // provider label (custom) or built-in family (anthropic/openai/gemini)
  level: number;             // 1–10
  price: number;             // $/1K in+out (ranking proxy)
}

/** Capability guess from the model name when no explicit level is set. */
export function defaultLevel(model: string): number {
  const m = model.toLowerCase();
  if (/(haiku|nano|lite|tiny|small|\b[78]b)/.test(m)) return 3;
  if (/(opus|ultra|\bpro\b|o1|o3|reason|405b|72b|70b)/.test(m)) return 9;
  if (/(sonnet|gpt-4|flash|medium|mini|deepseek|32b|14b)/.test(m)) return 6;
  return 5;
}

function builtinCandidate(model: string): Candidate {
  const def = CLAUDE_MODELS[model];
  const owner = detectBuiltinProvider(model);
  return {
    providerId: undefined,
    model,
    catalogId: `${owner}/${model}`,
    owner,
    level: defaultLevel(model),
    price: (def?.costPer1kInput ?? 0) + (def?.costPer1kOutput ?? 0),
  };
}

/** Every model the system could route to: built-ins (CLAUDE_MODELS) + enabled custom providers. */
async function universe(): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (const model of Object.keys(CLAUDE_MODELS)) out.push(builtinCandidate(model));
  let customProviders: Awaited<ReturnType<typeof providerRepo.findAll>> = [];
  try {
    customProviders = await providerRepo.findAll();
  } catch {
    customProviders = []; // DB unavailable → built-ins only (still safe to route)
  }
  for (const p of customProviders) {
    if (p.enabled === false) continue;
    for (const m of p.models) {
      out.push({
        providerId: p.id,
        model: m.id,
        catalogId: `${p.id}/${m.id}`,
        owner: p.label,
        level: m.level ?? defaultLevel(m.id),
        price: (m.costPer1kInput ?? 0) + (m.costPer1kOutput ?? 0),
      });
    }
  }
  return out;
}

function inScope(c: Candidate, scope: string[]): boolean {
  // Legacy allowlists stored built-ins bare (`claude-x`); accept both shapes.
  return scope.includes(c.catalogId)
    || (c.providerId === undefined && scope.includes(c.model))
    || scope.includes(`${PROVIDER_SCOPE_PREFIX}${c.owner}`);
}

/** The candidate models for this request (the requested model is always included). */
export async function poolFor(scope: string[] | undefined, requestedProviderId: string | undefined, requestedModel: string): Promise<Candidate[]> {
  const all = await universe();
  let pool: Candidate[];
  if (scope && scope.length > 0) {
    pool = all.filter((c) => inScope(c, scope));
  } else if (requestedProviderId && !isBuiltinProviderId(requestedProviderId)) {
    pool = all.filter((c) => c.providerId === requestedProviderId);          // same custom provider
  } else {
    const fam = detectBuiltinProvider(requestedModel);
    pool = all.filter((c) => c.providerId === undefined && c.owner === fam); // same built-in family
  }
  // Make sure the requested model itself is a candidate (acts as the ceiling + safe fallback).
  if (!pool.some((c) => c.model === requestedModel && c.providerId === requestedProviderId)) {
    pool.push(requestedProviderId && !isBuiltinProviderId(requestedProviderId)
      ? (all.find((c) => c.providerId === requestedProviderId && c.model === requestedModel) ?? builtinCandidate(requestedModel))
      : builtinCandidate(requestedModel));
  }
  return pool;
}

export function levelOf(pool: Candidate[], providerId: string | undefined, model: string): number {
  return pool.find((c) => c.model === model && c.providerId === providerId)?.level ?? defaultLevel(model);
}

/** Blended price ($/1K in+out) of a model in the pool (0 if unknown/free). */
export function priceOf(pool: Candidate[], providerId: string | undefined, model: string): number {
  return pool.find((c) => c.model === model && c.providerId === providerId)?.price ?? 0;
}

/**
 * Pick the cheapest candidate with `complexity ≤ level ≤ requestedLevel`. If none qualify
 * (e.g. task harder than the requested model), keep the requested model.
 */
export function selectForComplexity(
  pool: Candidate[],
  requested: { providerId?: string; model: string },
  complexity: number,
): { providerId?: string; model: string; downgraded: boolean } {
  const ceiling = levelOf(pool, requested.providerId, requested.model);
  const eligible = pool
    .filter((c) => c.level >= complexity && c.level <= ceiling)
    .sort((a, b) => a.price - b.price || a.level - b.level);
  const pick = eligible[0];
  if (!pick) return { ...requested, downgraded: false };
  const downgraded = pick.model !== requested.model || pick.providerId !== requested.providerId;
  return { providerId: pick.providerId, model: pick.model, downgraded };
}

/** The cheapest candidate — used as the classifier model (classify as cheaply as possible). */
export function cheapest(pool: Candidate[]): Candidate | undefined {
  return [...pool].sort((a, b) => a.price - b.price || a.level - b.level)[0];
}

const COMPLEXITY_SYSTEM =
  `Rate how much model capability is needed to answer the user's request, on a scale of 1 to 10.\n` +
  `1-2 = greeting/trivial one-liner. 3-4 = short factual answer. 5-6 = moderate reasoning or a small task.\n` +
  `7-8 = multi-step analysis or code. 9-10 = deep reasoning, long synthesis, hard problem.\n` +
  `Reply with ONLY the single integer (1-10). Nothing else.`;

export const COMPLEXITY_CLASSIFY_SYSTEM = COMPLEXITY_SYSTEM;

/** Parse the classifier's reply into a 1–10 complexity; unparseable → 10 (safe = keep strong model). */
export function parseComplexity(text: string): number {
  const m = text.match(/\d+/);
  if (!m) return 10;
  return Math.max(1, Math.min(10, parseInt(m[0], 10)));
}
