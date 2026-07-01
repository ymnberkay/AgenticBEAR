/**
 * Egress guard contract test — proves `redactEgress` (the shared helper used by BOTH the
 * gateway HTTP path and the agentic tool-client path) redacts the same way regardless of
 * which turn shape it receives, and preserves all other fields.
 */
import { describe, it, expect } from 'vitest';
import { redactEgress } from '../dlp.js';

describe('DLP — shared egress guard', () => {
  it('redacts secrets in the system prompt + every turn (agentic shape)', async () => {
    type AgenticTurn = { role: 'user' | 'assistant'; content: string | null; toolCalls?: unknown };
    const turns: AgenticTurn[] = [
      { role: 'user', content: 'My anthropic key is sk-ant-abcdefghijklmnopqrstuvwx' },
      { role: 'assistant', content: 'Acknowledged.', toolCalls: [{ id: 't1' }] },
      { role: 'assistant', content: null, toolCalls: [{ id: 't2' }] }, // tool-call turn with no content
    ];
    const out = await redactEgress({
      systemPrompt: 'aws is AKIA1234567890ABCDEF',
      turns,
      model: 'claude-sonnet-4',
    });
    expect(out.redacted).toBe(2);
    expect(out.types.sort()).toEqual(['anthropic_key', 'aws_key']);
    expect(out.systemPrompt).toContain('[REDACTED:aws_key]');
    expect(out.turns[0]!.content).toContain('[REDACTED:anthropic_key]');
    // Other turn fields preserved.
    expect(out.turns[1]!.toolCalls).toEqual([{ id: 't1' }]);
    // null-content turns pass through untouched.
    expect(out.turns[2]!.content).toBeNull();
  });

  it('redacts in the OpenAI-compatible gateway shape (role/content only)', async () => {
    type GatewayTurn = { role: 'user' | 'assistant' | 'system'; content: string };
    const turns: GatewayTurn[] = [
      { role: 'user', content: 'connect with token ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789AB and email me at a@b.com' },
    ];
    const out = await redactEgress({ turns, model: 'gpt-4o' });
    expect(out.redacted).toBeGreaterThanOrEqual(2);
    expect(out.types).toContain('github_token');
    expect(out.types).toContain('email');
    expect(out.turns[0]!.content).not.toContain('ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789AB');
    expect(out.turns[0]!.content).not.toContain('a@b.com');
  });

  it('leaves clean prompts untouched and reports zero redactions', async () => {
    const out = await redactEgress({
      systemPrompt: 'You are a helpful assistant.',
      turns: [{ role: 'user', content: 'Hello!' }],
      model: 'claude-sonnet-4',
    });
    expect(out.redacted).toBe(0);
    expect(out.types).toEqual([]);
    expect(out.systemPrompt).toBe('You are a helpful assistant.');
    expect(out.turns[0]!.content).toBe('Hello!');
  });

  it('does not mutate the input turns array', async () => {
    const original = [{ role: 'user' as const, content: 'leak: sk-ant-abcdefghijklmnopqrstuvwx' }];
    const snapshot = JSON.parse(JSON.stringify(original));
    await redactEgress({ turns: original, model: 'claude-sonnet-4' });
    expect(original).toEqual(snapshot);
  });
});
