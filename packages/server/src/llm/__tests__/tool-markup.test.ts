import { describe, it, expect, vi } from 'vitest';

// tool-client pulls in the rate limiter (reads settings/DB) at import — stub it for this pure test.
vi.mock('../../services/rate-limiter.service.js', () => ({
  acquire: vi.fn(async () => () => {}),
  modelTimeoutMs: vi.fn(async () => undefined),
}));

import { stripLeakedToolMarkup } from '../tool-client.js';

const BAR = '｜'; // ｜
const tag = (s: string) => `<${BAR}${BAR}DSML${BAR}${BAR}${s}>`;

describe('stripLeakedToolMarkup', () => {
  it('passes clean text through unchanged', () => {
    expect(stripLeakedToolMarkup('Just a normal answer.')).toBe('Just a normal answer.');
  });

  it('removes a complete leaked tool_calls block, keeping surrounding prose', () => {
    const leaked = `Here is the plan.\n${tag('tool_calls')}\n${tag('invoke name="read_file"')}\n${tag('parameter name="path" string="true"')}a.ts</${BAR}${BAR}DSML${BAR}${BAR}parameter>\n</${BAR}${BAR}DSML${BAR}${BAR}invoke>\n</${BAR}${BAR}DSML${BAR}${BAR}tool_calls>\nDone.`;
    const out = stripLeakedToolMarkup(leaked);
    expect(out).not.toContain('DSML');
    expect(out).toContain('Here is the plan.');
    expect(out).toContain('Done.');
  });

  it('cuts an unterminated (truncated) leaked block to the end', () => {
    const out = stripLeakedToolMarkup(`Text before ${tag('tool_calls')}\n${tag('invoke name="x"')}truncated…`);
    expect(out).toBe('Text before');
  });
});
