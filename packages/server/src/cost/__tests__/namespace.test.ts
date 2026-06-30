import { describe, it, expect } from 'vitest';
import { namespaceOf, agentNamespace } from '../hash.js';
import type { LlmRequest } from '../types.js';

const req = (over: Partial<LlmRequest> & { meta?: LlmRequest['meta'] }): LlmRequest => ({
  model: 'deepseek-v4-pro',
  maxTokens: 100,
  messages: [{ role: 'user', content: 'which model are you?' }],
  meta: { role: 'orchestrator', agentSlug: 'orchestrator', cacheable: true, callKind: 'agent' },
  ...over,
});

describe('L1 cache namespace — no cross-agent/model/project bleed', () => {
  it('same role+slug but different MODEL → different namespace (the "I am Claude" bug)', () => {
    const claude = namespaceOf(req({ model: 'claude-sonnet-4-20250514' }));
    const deepseek = namespaceOf(req({ model: 'deepseek-v4-pro', providerId: 'prov-deepseek' }));
    expect(claude).not.toBe(deepseek);
  });

  it('same role+slug+model but different PROJECT → different namespace', () => {
    const a = namespaceOf(req({ meta: { role: 'orchestrator', agentSlug: 'orchestrator', projectId: 'projA', cacheable: true } }));
    const b = namespaceOf(req({ meta: { role: 'orchestrator', agentSlug: 'orchestrator', projectId: 'projB', cacheable: true } }));
    expect(a).not.toBe(b);
  });

  it('identical context → identical namespace (still hits legitimately)', () => {
    const a = namespaceOf(req({ providerId: 'p1', meta: { role: 'orchestrator', agentSlug: 'orchestrator', projectId: 'x', cacheable: true } }));
    const b = namespaceOf(req({ providerId: 'p1', meta: { role: 'orchestrator', agentSlug: 'orchestrator', projectId: 'x', cacheable: true } }));
    expect(a).toBe(b);
  });

  it('namespaceOf and agentNamespace agree for the same identity (lookup == invalidation)', () => {
    const fromReq = namespaceOf(req({ providerId: 'p1', meta: { role: 'specialist', agentSlug: 'backend', projectId: 'x', cacheable: true } }));
    const fromAgent = agentNamespace({ projectId: 'x', role: 'specialist', agentSlug: 'backend', providerId: 'p1', model: 'deepseek-v4-pro' });
    expect(fromReq).toBe(fromAgent);
  });
});
