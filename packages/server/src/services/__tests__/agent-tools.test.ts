import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeFileTool, fileToolDefs } from '../agent-tools.js';

describe('agent-tools — sandboxed file tools', () => {
  let ws: string;
  beforeEach(() => { ws = mkdtempSync(join(tmpdir(), 'agb-ws-')); });
  afterEach(() => { rmSync(ws, { recursive: true, force: true }); });

  it('write_file creates a file under the workspace', () => {
    const r = executeFileTool(ws, 'write_file', { path: 'src/hello.ts', content: 'export const x = 1;' });
    expect(r.write?.operation).toBe('create');
    expect(existsSync(join(ws, 'src/hello.ts'))).toBe(true);
    expect(readFileSync(join(ws, 'src/hello.ts'), 'utf-8')).toBe('export const x = 1;');
  });

  it('modify detects previous content', () => {
    executeFileTool(ws, 'write_file', { path: 'a.txt', content: 'one' });
    const r2 = executeFileTool(ws, 'write_file', { path: 'a.txt', content: 'two' });
    expect(r2.write?.operation).toBe('modify');
    expect(r2.write?.previousContent).toBe('one');
    expect(executeFileTool(ws, 'read_file', { path: 'a.txt' }).result).toBe('two');
  });

  it('list_files lists written files', () => {
    executeFileTool(ws, 'write_file', { path: 'src/a.ts', content: 'a' });
    executeFileTool(ws, 'write_file', { path: 'b.md', content: 'b' });
    const r = executeFileTool(ws, 'list_files', {});
    expect(r.result).toContain('src/a.ts');
    expect(r.result).toContain('b.md');
  });

  it('rejects path traversal outside the workspace', () => {
    const r = executeFileTool(ws, 'write_file', { path: '../escape.txt', content: 'x' });
    expect(r.result).toMatch(/traversal|outside/i);
    expect(existsSync(join(ws, '../escape.txt'))).toBe(false);
  });

  it('exposes the three tool defs', () => {
    expect(fileToolDefs().map((t) => t.name)).toEqual(['write_file', 'read_file', 'list_files']);
  });

  it('caches read_file but a later write to the same path invalidates it', () => {
    executeFileTool(ws, 'write_file', { path: 'c.txt', content: 'v1' });
    expect(executeFileTool(ws, 'read_file', { path: 'c.txt' }).result).toBe('v1'); // caches v1
    executeFileTool(ws, 'write_file', { path: 'c.txt', content: 'v2' });           // invalidates
    expect(executeFileTool(ws, 'read_file', { path: 'c.txt' }).result).toBe('v2'); // fresh, not stale v1
  });
});
