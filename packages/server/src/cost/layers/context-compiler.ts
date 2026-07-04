import { getEmbedder } from '../embedding.js';
import { createLogger } from '../../utils/logger.js';
import { costConfig } from '../config.js';
import type { AgentMemory } from '@subagent/shared';

const log = createLogger('context-compiler');

export type QueryIntent =
  | 'bug_fix'
  | 'code_gen'
  | 'explanation'
  | 'analysis'
  | 'documentation'
  | 'generic';

const INTENT_KEYWORDS: Record<Exclude<QueryIntent, 'generic'>, string[]> = {
  bug_fix: ['fix', 'bug', 'error', 'broken', 'crash', 'fail', 'issue', 'wrong', 'incorrect', 'exception'],
  code_gen: ['create', 'build', 'write', 'implement', 'add', 'generate', 'make', 'develop'],
  explanation: ['explain', 'what', 'how', 'why', 'describe', 'understand', 'clarify'],
  analysis: ['analyze', 'review', 'check', 'audit', 'examine', 'investigate', 'assess'],
  documentation: ['document', 'readme', 'docs', 'comment', 'jsdoc', 'docstring'],
};

export interface CompileInput {
  query: string;
  memories: AgentMemory[];
  dependencyOutputs: Array<{ taskTitle: string; output: string }>;
  relevantFiles: Array<{ path: string; content: string }>;
}

export interface CompileResult {
  memories: AgentMemory[];
  dependencyOutputs: Array<{ taskTitle: string; output: string }>;
  relevantFiles: Array<{ path: string; content: string }>;
  savedTokenEstimate: number;
  intent: QueryIntent;
}

function analyzeIntent(query: string): QueryIntent {
  const lower = query.toLowerCase();
  let best: QueryIntent = 'generic';
  let bestScore = 0;
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS) as [QueryIntent, string[]][]) {
    const score = keywords.filter(kw => lower.includes(kw)).length;
    if (score > bestScore) { bestScore = score; best = intent; }
  }
  return best;
}

function keywordScore(query: string, text: string): number {
  const qWords = new Set(query.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  if (qWords.size === 0) return 0.5;
  const tWords = text.toLowerCase().split(/\W+/);
  let hits = 0;
  for (const w of tWords) { if (qWords.has(w)) hits++; }
  return Math.min(1, hits / qWords.size);
}

function cosineSim(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

async function scoreItems(query: string, texts: string[]): Promise<number[]> {
  const embedder = getEmbedder();
  if (!embedder.available()) {
    return texts.map(t => keywordScore(query, t));
  }
  try {
    const qVec = await embedder.embed(query.slice(0, 512));
    const scores: number[] = [];
    for (const text of texts) {
      const vec = await embedder.embed(text.slice(0, 512));
      scores.push(cosineSim(qVec, vec));
    }
    return scores;
  } catch (err) {
    log.warn('Embedding failed, falling back to keyword scoring', err);
    return texts.map(t => keywordScore(query, t));
  }
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export async function compileContext(input: CompileInput): Promise<CompileResult> {
  const { query, memories, dependencyOutputs, relevantFiles } = input;
  const cfg = costConfig.contextCompiler;

  if (!cfg.enabled) {
    return { memories, dependencyOutputs, relevantFiles, savedTokenEstimate: 0, intent: 'generic' };
  }

  const intent = analyzeIntent(query);
  let savedTokens = 0;

  // --- Filter memories by relevance ---
  let compiledMemories = memories;
  if (memories.length > cfg.maxMemories) {
    const texts = memories.map(m => `${m.query} ${m.response.slice(0, 300)}`);
    const scores = await scoreItems(query, texts);

    // Keep most recent entry always; sort rest by score
    const last = memories[memories.length - 1];
    const rest = memories.slice(0, -1).map((m, i) => ({ m, s: scores[i] }));
    rest.sort((a, b) => b.s - a.s);

    compiledMemories = [
      ...rest.slice(0, cfg.maxMemories - 1).map(x => x.m),
      last,
    ];

    const kept = new Set(compiledMemories);
    const droppedTokens = memories
      .filter(m => !kept.has(m))
      .reduce((acc, m) => acc + estimateTokens(m.query + m.response), 0);

    savedTokens += droppedTokens;
    log.info(`Memories: ${memories.length} → ${compiledMemories.length}, saved ~${droppedTokens}t`);
  }

  // --- Truncate dependency outputs ---
  const compiledDeps = dependencyOutputs.map(dep => {
    if (dep.output.length <= cfg.maxDepOutputChars) return dep;
    const truncated = dep.output.slice(0, cfg.maxDepOutputChars) + '\n...[truncated]';
    savedTokens += estimateTokens(dep.output) - estimateTokens(truncated);
    return { ...dep, output: truncated };
  });

  // --- Filter files by relevance ---
  let compiledFiles = relevantFiles;
  if (relevantFiles.length > 2) {
    const texts = relevantFiles.map(f => `${f.path}\n${f.content.slice(0, 500)}`);
    const scores = await scoreItems(query, texts);

    const filtered = relevantFiles.filter((_, i) => scores[i] >= cfg.fileRelevanceThreshold);
    compiledFiles = filtered.length > 0 ? filtered : relevantFiles.slice(0, 1);

    const dropped = relevantFiles.filter(f => !compiledFiles.includes(f));
    savedTokens += dropped.reduce((acc, f) => acc + estimateTokens(f.content), 0);
  }

  log.info(`Context compiled: intent=${intent}, saved ~${savedTokens} tokens`);
  return { memories: compiledMemories, dependencyOutputs: compiledDeps, relevantFiles: compiledFiles, savedTokenEstimate: savedTokens, intent };
}
