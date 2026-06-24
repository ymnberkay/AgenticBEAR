/**
 * Project knowledge — concatenates all of a project's documents into a single block that is
 * appended to an agent's system prompt, so every agent in the project shares that knowledge.
 * (Simple full-text injection; chosen over RAG for now.)
 */
import { documentRepo } from '../db/repositories/document.repo.js';

/** Cap so a runaway document set can't blow past context limits. */
const MAX_CHARS = 60_000;

/** Returns a "## Project Knowledge" block for the project, or '' if there are no documents. */
export async function projectKnowledgeBlock(projectId: string): Promise<string> {
  const docs = await documentRepo.findByProjectId(projectId);
  if (docs.length === 0) return '';

  let block = '## Project Knowledge\nReference documents attached to this project:\n';
  for (const d of docs) {
    block += `\n### ${d.name}\n${d.content}\n`;
    if (block.length > MAX_CHARS) {
      block = `${block.slice(0, MAX_CHARS)}\n…[knowledge truncated]`;
      break;
    }
  }
  return block;
}

/** Append the knowledge block to a system prompt (no-op when there are no documents). */
export async function withProjectKnowledge(systemPrompt: string, projectId: string): Promise<string> {
  const block = await projectKnowledgeBlock(projectId);
  return block ? `${systemPrompt}\n\n${block}` : systemPrompt;
}
