/**
 * LLM DLP (Data Loss Prevention) — egress guard.
 *
 * Scans outgoing prompt text for secrets (API keys, tokens, private keys) and PII (email, IBAN,
 * TC kimlik, credit card, TR phone) and REDACTS matches before the request leaves to the provider.
 * Deterministic (regex + Luhn + TC checksum) — NO data is sent anywhere to classify it.
 * Used at the gateway choke-point; gated by costConfig.dlp.
 */
import { costConfig } from '../cost/config.js';
import { settingsRepo } from '../db/repositories/settings.repo.js';

export type DlpType =
  | 'private_key' | 'anthropic_key' | 'openai_key' | 'agb_key' | 'aws_key'
  | 'github_token' | 'google_key' | 'slack_token' | 'jwt'
  | 'email' | 'iban' | 'tc_kimlik' | 'tr_phone' | 'credit_card';

interface Rule {
  type: DlpType;
  category: 'secret' | 'pii';
  re: RegExp;
  /** Optional extra check to cut false positives (Luhn for cards, checksum for TC kimlik). */
  validate?: (match: string) => boolean;
}

/** Luhn check for credit-card candidates (filters random digit runs / phone numbers). */
function luhnValid(s: string): boolean {
  const d = s.replace(/\D/g, '');
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = d.charCodeAt(i) - 48;
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/** Turkish national ID (TC kimlik no) checksum — avoids flagging arbitrary 11-digit numbers. */
function tcValid(s: string): boolean {
  if (!/^[1-9]\d{10}$/.test(s)) return false;
  const d = [...s].map(Number);
  const oddSum = d[0] + d[2] + d[4] + d[6] + d[8];
  const evenSum = d[1] + d[3] + d[5] + d[7];
  const c10 = (oddSum * 7 - evenSum) % 10;
  if ((c10 + 10) % 10 !== d[9]) return false;
  const c11 = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  return c11 === d[10];
}

// Order matters: private key block first; anthropic (sk-ant-) before generic openai (sk-); IBAN before card.
const SECRET_RULES: Rule[] = [
  { type: 'private_key', category: 'secret', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { type: 'anthropic_key', category: 'secret', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { type: 'openai_key', category: 'secret', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/g },
  { type: 'agb_key', category: 'secret', re: /\bagb_live_[A-Za-z0-9]{16,}/g },
  { type: 'aws_key', category: 'secret', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { type: 'github_token', category: 'secret', re: /\bgh[pousr]_[A-Za-z0-9]{36,}/g },
  { type: 'google_key', category: 'secret', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { type: 'slack_token', category: 'secret', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g },
  { type: 'jwt', category: 'secret', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
];
const PII_RULES: Rule[] = [
  { type: 'email', category: 'pii', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { type: 'iban', category: 'pii', re: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g },
  { type: 'tc_kimlik', category: 'pii', re: /\b[1-9]\d{10}\b/g, validate: tcValid },
  { type: 'tr_phone', category: 'pii', re: /(?:\+90[ -]?|0)5\d{2}[ -]?\d{3}[ -]?\d{2}[ -]?\d{2}\b/g },
  { type: 'credit_card', category: 'pii', re: /\b(?:\d[ -]?){13,19}\b/g, validate: luhnValid },
];

// Org-defined custom rules (from Settings) — compiled + cached on their JSON so we don't recompile
// every scan, and a bad/invalid regex is skipped rather than throwing.
let customCacheKey = '';
let customCompiled: Rule[] = [];
async function customRules(): Promise<Rule[]> {
  let rules: { label: string; pattern: string }[] = [];
  try {
    rules = (await settingsRepo.getSettings()).dlpCustomRules ?? [];
  } catch {
    return []; // DB not ready
  }
  const key = JSON.stringify(rules);
  if (key === customCacheKey) return customCompiled;
  customCacheKey = key;
  customCompiled = [];
  for (const r of rules) {
    if (!r.pattern) continue;
    try {
      customCompiled.push({ type: (r.label || 'custom') as DlpType, category: 'secret', re: new RegExp(r.pattern, 'g') });
    } catch {
      // invalid regex → skip (don't break the whole scan)
    }
  }
  return customCompiled;
}

/** Whether the DLP guard should run for a given served model (global flag + per-model opt-out). */
export async function dlpActiveForModel(model: string | undefined): Promise<boolean> {
  if (!costConfig.dlp.enabled) return false;
  try {
    return !(await settingsRepo.getSettings()).dlpDisabledModels.includes(model ?? '');
  } catch {
    return true; // settings unavailable → fail safe (guard ON)
  }
}

export interface DlpResult {
  text: string;
  /** type → number of redactions. Empty when nothing matched. */
  findings: Record<string, number>;
  total: number;
}

/** Scan text and redact secrets/PII per config. Returns redacted text + what was found. */
export async function scanAndRedact(text: string): Promise<DlpResult> {
  const findings: Record<string, number> = {};
  let out = text;
  const rules: Rule[] = [
    ...(costConfig.dlp.secrets ? SECRET_RULES : []),
    ...(costConfig.dlp.pii ? PII_RULES : []),
    ...(await customRules()), // org-defined patterns from Settings
  ];
  for (const rule of rules) {
    out = out.replace(rule.re, (m) => {
      if (rule.validate && !rule.validate(m)) return m; // failed validation → leave as-is
      findings[rule.type] = (findings[rule.type] ?? 0) + 1;
      return `[REDACTED:${rule.type}]`;
    });
  }
  const total = Object.values(findings).reduce((a, b) => a + b, 0);
  return { text: out, findings, total };
}
