/**
 * L4 — Output minimization.
 *
 * A system-prompt directive that steers coding agents toward minimal, non-over-engineered output,
 * cutting OUTPUT tokens (the expensive ones for code generation). It is NOT a runtime transform —
 * it shapes what the model produces. Complements L0 (input) / L1-L3 (cache+routing).
 *
 * Adapted from the "ponytail" lazy-senior-dev ruleset (github.com/DietrichGebert/ponytail),
 * which reports ~22% fewer tokens / ~20% lower cost on agentic coding benchmarks.
 *
 * Savings are counterfactual (no per-call baseline), so they are NOT recorded as "$ saved" —
 * the win shows up as lower output-token counts over time.
 */
import { costConfig } from '../config.js';

const LITE =
  `## Output discipline\n` +
  `Write the minimum that fully solves the request. Prefer built-ins/stdlib and existing ` +
  `dependencies over new code; avoid unnecessary abstractions, files, and boilerplate. Don't add ` +
  `features that weren't asked for. Never cut input validation, error handling, security, or ` +
  `explicitly-requested behavior. Be concise in prose too.`;

const FULL =
  `## Output discipline — "laziest senior dev"\n` +
  `Before writing code, walk this ladder (first match wins):\n` +
  `1. Is it necessary at all? (YAGNI — don't build it)\n` +
  `2. Is it in the standard library?\n` +
  `3. Is it a native platform/framework feature?\n` +
  `4. Is it already an installed dependency?\n` +
  `5. Can it be one line?\n` +
  `6. Only then: minimal working code.\n` +
  `Prefer deletions over additions; minimize files, abstractions, and new dependencies; keep prose short.\n` +
  `NON-NEGOTIABLE (never skip): input validation at trust boundaries, error handling that prevents ` +
  `data loss, security, accessibility, and anything the user explicitly requested.\n` +
  `Flag intentional simplifications with a short \`minimal:\` comment noting the known limit.`;

/** The output-minimization directive for the current config level, or '' when off. */
export function minimizeDirective(level: 'off' | 'lite' | 'full' = costConfig.outputMinimize): string {
  if (level === 'lite') return LITE;
  if (level === 'full') return FULL;
  return '';
}
