import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Agent } from '@subagent/shared';

const { completeMock, agentRepoMock } = vi.hoisted(() => ({
  completeMock: vi.fn(),
  agentRepoMock: { findByProjectId: vi.fn(() => [] as Agent[]) },
}));
vi.mock('../../llm/tool-client.js', () => ({ completeWithTools: completeMock }));
vi.mock('../../db/repositories/agent.repo.js', () => ({ agentRepo: agentRepoMock }));
vi.mock('../knowledge.service.js', () => ({ withProjectKnowledge: (sp: string) => sp }));

import { runAgentTurn } from '../agent-loop.service.js';

function agent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'a1', projectId: 'p1', role: 'specialist', name: 'backend', slug: 'backend', description: '',
    systemPrompt: 'You build.', modelConfig: { model: 'test-model', maxTokens: 1000, temperature: 0.5 },
    permissions: {} as Agent['permissions'], templateId: null, color: '#fff', icon: 'Bot',
    createdAt: '', updatedAt: '', ...overrides,
  };
}
const step = (o: Partial<{ text: string; toolCalls: unknown[] }>) => ({
  text: o.text ?? '', toolCalls: o.toolCalls ?? [], stopReason: 'stop',
  inputTokens: 10, outputTokens: 3, providerKind: 'openai-compatible', compressionSavedTokens: 0,
});

describe('agent-loop — tool-use', () => {
  let ws: string;
  beforeEach(() => { ws = mkdtempSync(join(tmpdir(), 'agb-loop-')); completeMock.mockReset(); agentRepoMock.findByProjectId.mockReset(); });
  afterEach(() => rmSync(ws, { recursive: true, force: true }));

  it('executes a write_file tool call then returns the final text', async () => {
    completeMock
      .mockResolvedValueOnce(step({ toolCalls: [{ id: 't1', name: 'write_file', args: { path: 'out.txt', content: 'hello' } }] }))
      .mockResolvedValueOnce(step({ text: 'Done — wrote out.txt.' }));

    const res = await runAgentTurn({ agent: agent(), projectId: 'p1', workspacePath: ws, messages: [{ role: 'user', content: 'write out.txt' }] });

    expect(existsSync(join(ws, 'out.txt'))).toBe(true);
    expect(readFileSync(join(ws, 'out.txt'), 'utf-8')).toBe('hello');
    expect(res.text).toContain('Done');
    expect(res.filesWritten.map((f) => f.path)).toContain('out.txt');
  });

  it('stops at the iteration cap on a runaway tool loop', async () => {
    completeMock.mockResolvedValue(step({ toolCalls: [{ id: 'x', name: 'read_file', args: { path: 'nope.txt' } }] }));
    const res = await runAgentTurn({ agent: agent(), projectId: 'p1', workspacePath: ws, messages: [{ role: 'user', content: 'loop' }] });
    expect(res.iterations).toBe(10);
    expect(res.text).toMatch(/limit/i);
  });

  it('orchestrator delegates to a specialist and gets its result', async () => {
    agentRepoMock.findByProjectId.mockReturnValue([agent({ id: 's1', slug: 'backend', name: 'backend' })]);
    completeMock
      .mockResolvedValueOnce(step({ toolCalls: [{ id: 'd1', name: 'delegate_to_agent', args: { agent: 'backend', task: 'do x' } }] })) // orchestrator
      .mockResolvedValueOnce(step({ text: 'specialist did it' }))   // specialist turn
      .mockResolvedValueOnce(step({ text: 'all done' }));           // orchestrator final

    const res = await runAgentTurn({
      agent: agent({ id: 'o1', role: 'orchestrator', slug: 'orch', name: 'orch' }),
      projectId: 'p1', workspacePath: ws, messages: [{ role: 'user', content: 'build x' }],
    });

    expect(res.text).toBe('all done');
    expect(completeMock).toHaveBeenCalledTimes(3);
  });

  it('coordinator orchestrator cannot write files itself — file-tool calls are refused', async () => {
    agentRepoMock.findByProjectId.mockReturnValue([agent({ id: 's1', slug: 'backend', name: 'backend' })]);
    completeMock
      .mockResolvedValueOnce(step({ toolCalls: [{ id: 'w', name: 'write_file', args: { path: 'evil.txt', content: 'x' } }] })) // tries to write itself
      .mockResolvedValueOnce(step({ toolCalls: [{ id: 'd1', name: 'delegate_to_agent', args: { agent: 'backend', task: 'do it' } }] }))
      .mockResolvedValueOnce(step({ text: 'specialist did it' }))
      .mockResolvedValueOnce(step({ text: 'done' }));

    const res = await runAgentTurn({
      agent: agent({ id: 'o1', role: 'orchestrator', slug: 'orch', name: 'orch' }),
      projectId: 'p1', workspacePath: ws, messages: [{ role: 'user', content: 'build x' }],
    });

    expect(existsSync(join(ws, 'evil.txt'))).toBe(false); // the coordinator never touched the disk
    expect(res.filesWritten).toHaveLength(0);
    expect(res.text).toBe('done');
  });
});
