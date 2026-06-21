import { describe, it, expect } from 'vitest';
import { minimizeDirective } from '../layers/output-minimize.js';

describe('L4 — output minimization directive', () => {
  it('off → empty (no behavior change)', () => {
    expect(minimizeDirective('off')).toBe('');
  });

  it('lite → short concise nudge that keeps non-negotiables', () => {
    const d = minimizeDirective('lite');
    expect(d.length).toBeGreaterThan(0);
    expect(d.length).toBeLessThan(minimizeDirective('full').length);
    expect(d).toMatch(/validation|security/i);
  });

  it('full → decision ladder + non-negotiables', () => {
    const d = minimizeDirective('full');
    expect(d).toMatch(/YAGNI/);
    expect(d).toMatch(/standard library/i);
    expect(d).toMatch(/NON-NEGOTIABLE/i);
  });
});
