import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Agent } from '@subagent/shared';

const { findByProjectId } = vi.hoisted(() => ({ findByProjectId: vi.fn() }));
vi.mock('../../db/repositories/agent.repo.js', () => ({ agentRepo: { findByProjectId } }));
// chat.ts pulls these in at import — stub so the module loads without a DB.
vi.mock('../../services/agent-loop.service.js', () => ({ runAgentTurn: vi.fn() }));

import { findDocumentationAgent } from '../chat.js';

const agent = (over: Partial<Agent>): Agent => ({
  id: 'a', projectId: 'p', role: 'specialist', name: 'X', slug: 'x', description: '',
  systemPrompt: '', modelConfig: { model: 'm', maxTokens: 1, temperature: 0 },
  permissions: {} as Agent['permissions'], templateId: null, color: '#fff', icon: 'Bot',
  createdAt: '', updatedAt: '', ...over,
});

beforeEach(() => findByProjectId.mockReset());

describe('findDocumentationAgent', () => {
  it('prefers the agent created from the documentation template', async () => {
    findByProjectId.mockResolvedValue([
      agent({ id: 'b1', name: 'Backend', slug: 'backend' }),
      agent({ id: 'd1', name: 'Docs', slug: 'docs', templateId: 'tmpl_documentation' }),
    ]);
    expect((await findDocumentationAgent('p'))?.id).toBe('d1');
  });

  it('falls back to a name/slug containing "document"', async () => {
    findByProjectId.mockResolvedValue([
      agent({ id: 'b1', name: 'Backend', slug: 'backend' }),
      agent({ id: 'd2', name: 'Document Agent', slug: 'document-agent' }),
    ]);
    expect((await findDocumentationAgent('p'))?.id).toBe('d2');
  });

  it('returns undefined when there is no documentation agent', async () => {
    findByProjectId.mockResolvedValue([agent({ id: 'b1', name: 'Backend', slug: 'backend' })]);
    expect(await findDocumentationAgent('p')).toBeUndefined();
  });
});
