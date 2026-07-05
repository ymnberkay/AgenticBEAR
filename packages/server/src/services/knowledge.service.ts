/**
 * Agent knowledge — concatenates the documents visible to an agent into a single block that is
 * appended to its system prompt. Documents are bound to one agent (`agentId`); legacy documents
 * without a binding stay project-wide (every internal agent sees them). External agents never
 * get knowledge — they bypass the internal loop entirely.
 * (Simple full-text injection; chosen over RAG for now.)
 */
import { documentRepo } from '../db/repositories/document.repo.js';

/** Cap so a runaway document set can't blow past context limits. */
const MAX_CHARS = 60_000;

/** Returns a "## Project Knowledge" block for the agent, or '' if there are no documents. */
export async function projectKnowledgeBlock(projectId: string, agentId?: string): Promise<string> {
  const docs = agentId
    ? await documentRepo.findForAgent(projectId, agentId)
    : await documentRepo.findByProjectId(projectId);
  if (docs.length === 0) return '';

  let block = '## Project Knowledge\nReference documents attached to this agent:\n';
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
export async function withProjectKnowledge(systemPrompt: string, projectId: string, agentId?: string): Promise<string> {
  const block = await projectKnowledgeBlock(projectId, agentId);
  return block ? `${systemPrompt}\n\n${block}` : systemPrompt;
}
