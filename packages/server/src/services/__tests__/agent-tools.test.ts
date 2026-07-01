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

  it('exposes the file tool defs (incl. run_command when shell is enabled)', () => {
    expect(fileToolDefs().map((t) => t.name)).toEqual([
      'write_file', 'read_file', 'list_files', 'delete_file',
      'create_issue', 'grep_codebase', 'find_references', 'add_project_goal',
      'run_command',
    ]);
  });

  it('grep_codebase finds matches with file:line headers, respects glob, skips dist/', () => {
    executeFileTool(ws, 'write_file', { path: 'src/a.ts', content: 'const TOKEN = "abc";\nconsole.log("ok");\n' });
    executeFileTool(ws, 'write_file', { path: 'src/b.ts', content: 'export function token() { return 1; }\n' });
    executeFileTool(ws, 'write_file', { path: 'dist/old.ts', content: 'leak TOKEN here\n' });
    const r = executeFileTool(ws, 'grep_codebase', { pattern: 'TOKEN', glob: '**/*.ts' });
    expect(r.result).toContain('src/a.ts');
    // case-insensitive by default → matches `token()` too
    expect(r.result).toContain('src/b.ts');
    // dist/ is in SKIP_DIRS
    expect(r.result).not.toContain('dist/old.ts');
  });

  it('grep_codebase returns a clear message when nothing matches', () => {
    executeFileTool(ws, 'write_file', { path: 'a.txt', content: 'hello world' });
    const r = executeFileTool(ws, 'grep_codebase', { pattern: 'nope_no_match' });
    expect(r.result).toMatch(/No matches/i);
  });

  it('grep_codebase rejects an invalid regex without throwing', () => {
    const r = executeFileTool(ws, 'grep_codebase', { pattern: '(' }); // unbalanced
    expect(r.result).toMatch(/Error: invalid regex/);
  });

  it('find_references uses word boundaries (does not match substrings)', () => {
    executeFileTool(ws, 'write_file', { path: 'src/a.ts', content: 'function getUser() {}\ngetUser();\ngetUserById();\n' });
    const r = executeFileTool(ws, 'find_references', { symbol: 'getUser' });
    // Output uses `>` to mark hit lines and spaces for context lines.
    // We expect 2 hits (the def + the call), getUserById may appear as context but not as a hit.
    const hitLines = r.result.split('\n').filter((l) => l.startsWith('>'));
    expect(hitLines).toHaveLength(2);
    // Exactly one of those hits is flagged as a definition.
    expect(hitLines.filter((l) => l.includes('[def]'))).toHaveLength(1);
    // getUserById never appears as a hit line.
    expect(hitLines.some((l) => l.includes('getUserById'))).toBe(false);
  });

  it('find_references rejects non-identifier inputs', () => {
    const r = executeFileTool(ws, 'find_references', { symbol: 'foo bar' });
    expect(r.result).toMatch(/valid identifier/i);
  });

  it('run_command executes a shell command in the workspace and returns its output + exit code', () => {
    const r = executeFileTool(ws, 'run_command', { command: 'echo hello-from-shell' });
    expect(r.result).toContain('hello-from-shell');
    expect(r.result).toMatch(/exit 0/);
    expect(r.write).toBeUndefined(); // commands are not file writes
  });

  it('stageOnly run_command does NOT execute — it stages the command for approval', () => {
    const marker = join(ws, 'ran.txt');
    const r = executeFileTool(ws, 'run_command', { command: `touch ${marker}` }, { stageOnly: true });
    expect(existsSync(marker)).toBe(false);              // not run
    expect(r.write?.operation).toBe('command');
    expect(r.write?.path).toBe(`touch ${marker}`);       // command stored as the "path"
    expect(r.result).toMatch(/staged/i);
  });

  it('stageOnly write does NOT touch disk but returns the proposed change', () => {
    const r = executeFileTool(ws, 'write_file', { path: 'staged.ts', content: 'pending' }, { stageOnly: true });
    expect(existsSync(join(ws, 'staged.ts'))).toBe(false);          // not written
    expect(r.write?.operation).toBe('create');
    expect(r.write?.content).toBe('pending');
    expect(r.result).toMatch(/staged.*approval/i);
  });

  it('delete_file removes a file; stageOnly delete leaves it in place', () => {
    executeFileTool(ws, 'write_file', { path: 'gone.txt', content: 'bye' });
    const staged = executeFileTool(ws, 'delete_file', { path: 'gone.txt' }, { stageOnly: true });
    expect(staged.write?.operation).toBe('delete');
    expect(staged.write?.previousContent).toBe('bye');
    expect(existsSync(join(ws, 'gone.txt'))).toBe(true);            // still there (staged)

    const done = executeFileTool(ws, 'delete_file', { path: 'gone.txt' });
    expect(done.write?.operation).toBe('delete');
    expect(existsSync(join(ws, 'gone.txt'))).toBe(false);           // actually deleted
  });

  it('caches read_file but a later write to the same path invalidates it', () => {
    executeFileTool(ws, 'write_file', { path: 'c.txt', content: 'v1' });
    expect(executeFileTool(ws, 'read_file', { path: 'c.txt' }).result).toBe('v1'); // caches v1
    executeFileTool(ws, 'write_file', { path: 'c.txt', content: 'v2' });           // invalidates
    expect(executeFileTool(ws, 'read_file', { path: 'c.txt' }).result).toBe('v2'); // fresh, not stale v1
  });
});
