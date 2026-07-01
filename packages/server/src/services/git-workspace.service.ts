/**
 * Git-backed workspace management.
 *
 * A project can either use a local directory (workspaceSource='local') or a git repository
 * (workspaceSource='git'). For git-backed projects, the server maintains a local mirror under
 * `~/.subagent-manager/workspaces/<projectId>/`. Every file tool (read/write/list/grep) then
 * operates on that mirror, so agents can treat it as a normal workspace.
 *
 * PAT handling
 * ────────────
 * The PAT (personal access token) comes from an `integration_connections` row — typically the
 * same GitHub or Azure DevOps connection that already handles issue sync. We inject it via an
 * ephemeral `askpass` script (never in argv, never in log lines) so it stays out of process
 * listings and error output. `redactPat()` scrubs any accidental leak before we surface a
 * message to the UI.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, rmSync, writeFileSync, chmodSync, unlinkSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { Project, GitCloneStatus } from '@subagent/shared';
import { integrationRepo } from '../db/repositories/integration.repo.js';
import { projectRepo } from '../db/repositories/project.repo.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('git-workspace');

/**
 * Root under which every git-backed project gets its own local mirror.
 *
 * Overridable via `AGB_WORKSPACES_ROOT` so K8s can point it at a PVC without
 * remapping `$HOME` (which breaks other things — hardcoded homedir refs elsewhere
 * expect the OS-standard `/home/<user>`). Default keeps the CLI/local behavior.
 */
const WORKSPACES_ROOT = process.env.AGB_WORKSPACES_ROOT
  ? resolve(process.env.AGB_WORKSPACES_ROOT)
  : resolve(homedir(), '.subagent-manager', 'workspaces');

export interface GitCommandResult {
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
}

/** Local mirror directory for a project, whether it exists yet or not. */
export function localMirrorPath(projectId: string): string {
  return resolve(WORKSPACES_ROOT, projectId);
}

/**
 * The actual workspace directory the file tools should use.
 * Local source → the user-configured path. Git source → the local clone (if ready), else the
 * would-be clone path (so consumers can still resolve a path even when clone hasn't run yet).
 */
export function resolveProjectWorkspace(project: Project): string {
  if (project.workspaceSource === 'git') {
    return project.gitLocalPath || localMirrorPath(project.id);
  }
  return project.workspacePath;
}

/**
 * Validate a user-supplied git remote URL before it ever reaches `git clone`.
 *
 * Two things make an unchecked clone URL dangerous:
 *   1. git's smart-transport helper syntax `<transport>::<address>` — notably `ext::` and `fd::` —
 *      runs an arbitrary local command, i.e. remote code execution as the server process.
 *   2. A URL beginning with `-` is parsed by git as a command-line option (argument injection).
 * Returns the trimmed URL on success; throws with a user-safe message otherwise.
 */
export function assertSafeGitUrl(raw: string): string {
  const url = raw.trim();
  if (!url) throw new Error('Git URL is required.');
  if (url.startsWith('-')) throw new Error('Git URL must not start with "-".');
  // `<transport>::` helper form (ext::, fd::, …). Anchored, so it never matches `https://`
  // (single colon) or an IPv6 host inside `[...]`.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*::/.test(url)) {
    throw new Error('Git URL transport helpers (ext::, fd::) are not allowed.');
  }
  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//.exec(url);
  if (schemeMatch) {
    const scheme = schemeMatch[1]!.toLowerCase();
    if (!['http', 'https', 'ssh', 'git'].includes(scheme)) {
      throw new Error(`Git URL scheme "${scheme}" is not allowed; use http(s) or ssh.`);
    }
    return url;
  }
  // scp-like shorthand: user@host:path — allowed for ssh remotes.
  if (/^[^/@\s]+@[^/@\s]+:.+/.test(url)) return url;
  throw new Error('Git URL must be an http(s)/ssh URL or scp-style path.');
}

/** Redact a PAT anywhere it might appear in git's output. */
function redactPat(text: string, pat: string | null): string {
  if (!text) return text;
  let out = text;
  if (pat) out = out.split(pat).join('***');
  // Also scrub the classic `https://user:token@host` shape defensively.
  out = out.replace(/https?:\/\/([^:@\/]+):([^@\/]+)@/g, 'https://$1:***@');
  return out;
}

/** Fetch the token behind a connection id. Returns '' if no token is stored / connection missing. */
async function tokenForConnection(connectionId: string | null): Promise<string> {
  if (!connectionId) return '';
  try {
    const conn = await integrationRepo.getConnectionWithToken(connectionId);
    return conn?.token ?? '';
  } catch {
    return '';
  }
}

interface RunGitOptions {
  cwd?: string;
  /** PAT to make available via GIT_ASKPASS. Undefined → no askpass. */
  pat?: string;
  /** Timeout in ms; default 5 minutes (clones can be slow). */
  timeoutMs?: number;
  /** Extra env vars. Merged over process.env. */
  env?: Record<string, string>;
}

/**
 * Run a git command with PAT redaction. If `pat` is provided, we write an askpass helper into a
 * temp file and point `GIT_ASKPASS` at it — git then calls that helper for the password prompt
 * instead of ever seeing the token in argv/env-vars.
 */
async function runGit(args: string[], opts: RunGitOptions = {}): Promise<GitCommandResult> {
  const timeoutMs = opts.timeoutMs ?? 5 * 60_000;
  let askpassFile: string | undefined;
  if (opts.pat) {
    askpassFile = resolve(tmpdir(), `agb-askpass-${process.pid}-${Date.now()}.sh`);
    // Askpass gets ONE arg: the prompt text (e.g. "Username for 'https://github.com': ").
    // We echo `x` for username and the PAT for password. Works for GitHub, Azure DevOps, GitLab.
    const script = `#!/bin/sh\ncase "$1" in\n  Username*) echo "x-access-token" ;;\n  Password*) printf '%s' "$AGB_PAT" ;;\n  *) printf '%s' "$AGB_PAT" ;;\nesac\n`;
    writeFileSync(askpassFile, script, 'utf-8');
    chmodSync(askpassFile, 0o700);
  }
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...opts.env,
    // Force non-interactive; no prompt UI. Ensure askpass wins.
    GIT_TERMINAL_PROMPT: '0',
    // Defense in depth: never let git use the local-command transports (ext::/fd::) or any
    // scheme outside this allowlist, even if one slips past URL validation or arrives via config.
    GIT_ALLOW_PROTOCOL: 'http:https:ssh:git',
    ...(askpassFile ? { GIT_ASKPASS: askpassFile, AGB_PAT: opts.pat ?? '' } : {}),
  };
  return new Promise<GitCommandResult>((resolveP) => {
    const child = spawn('git', args, { cwd: opts.cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunksOut: Buffer[] = [];
    const chunksErr: Buffer[] = [];
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.on('data', (b: Buffer) => chunksOut.push(b));
    child.stderr.on('data', (b: Buffer) => chunksErr.push(b));
    child.on('error', () => {
      clearTimeout(timer);
      cleanup();
      resolveP({ stdout: '', stderr: 'git spawn failed', code: null, timedOut: false });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      cleanup();
      const stdout = redactPat(Buffer.concat(chunksOut).toString('utf-8'), opts.pat ?? null);
      const stderr = redactPat(Buffer.concat(chunksErr).toString('utf-8'), opts.pat ?? null);
      resolveP({ stdout, stderr, code, timedOut });
    });
    function cleanup() {
      if (askpassFile && existsSync(askpassFile)) {
        try { unlinkSync(askpassFile); } catch { /* ignore */ }
      }
    }
  });
}

/** Ensure the workspaces root exists (one-time setup). */
function ensureWorkspacesRoot(): void {
  mkdirSync(WORKSPACES_ROOT, { recursive: true });
}

async function isGitInstalled(): Promise<boolean> {
  const r = await runGit(['--version'], { timeoutMs: 5_000 });
  return r.code === 0;
}

interface CloneResult {
  status: GitCloneStatus;
  localPath: string;
  error: string;
  stdout?: string;
}

/**
 * Clone (or re-clone) the project's remote into its local mirror. Any existing content at the
 * mirror path is nuked first — this is a full sync. Returns a structured result the caller can
 * persist via `projectRepo.setGitCloneState`.
 */
export async function cloneProject(project: Project): Promise<CloneResult> {
  ensureWorkspacesRoot();
  if (project.workspaceSource !== 'git') return { status: 'not_cloned', localPath: '', error: 'Project is not a git-source project' };
  if (!project.gitUrl) return { status: 'error', localPath: '', error: 'Git URL is required' };
  let safeUrl: string;
  try {
    safeUrl = assertSafeGitUrl(project.gitUrl);
  } catch (e) {
    return { status: 'error', localPath: '', error: e instanceof Error ? e.message : 'Invalid git URL' };
  }
  if (!(await isGitInstalled())) return { status: 'error', localPath: '', error: 'git is not installed on the server' };

  const target = localMirrorPath(project.id);
  await projectRepo.setGitCloneState(project.id, { status: 'cloning', localPath: target });

  // Blow away anything old — this is a fresh clone. If the user has uncommitted local changes
  // through the file tools we lose them; the UI warns before calling this endpoint.
  try { if (existsSync(target)) rmSync(target, { recursive: true, force: true }); } catch { /* ignore */ }

  const pat = await tokenForConnection(project.gitConnectionId);
  const branch = project.gitDefaultBranch || 'main';
  // `--` terminates option parsing so neither the URL nor the target path can be read as a flag.
  const args = ['clone', '--branch', branch, '--single-branch', '--', safeUrl, target];
  const r = await runGit(args, { pat });
  if (r.code === 0) {
    log.info(`cloned ${safeUrl} into ${target} on branch ${branch}`);
    return { status: 'ready', localPath: target, error: '', stdout: r.stdout };
  }
  const err = (r.stderr || r.stdout || 'git clone failed').trim();
  log.warn(`clone failed for project ${project.id}: ${err}`);
  return { status: 'error', localPath: '', error: err };
}

/** `git -C <cwd> …` wrapper for a project that's already cloned. */
async function projectGit(project: Project, args: string[]): Promise<GitCommandResult> {
  const cwd = project.gitLocalPath || localMirrorPath(project.id);
  if (!existsSync(cwd)) {
    return { stdout: '', stderr: 'Local clone does not exist. Clone the project first.', code: null, timedOut: false };
  }
  const pat = await tokenForConnection(project.gitConnectionId);
  return runGit(args, { cwd, pat });
}

/** Porcelain status → structured list. Empty array = clean tree. */
export interface GitStatusEntry { path: string; index: string; work: string }
export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  entries: GitStatusEntry[];
}
export async function gitStatus(project: Project): Promise<{ ok: boolean; error?: string; status?: GitStatus }> {
  const r = await projectGit(project, ['status', '--branch', '--porcelain=v1']);
  if (r.code !== 0) return { ok: false, error: (r.stderr || r.stdout).trim() };
  const lines = r.stdout.split('\n');
  let branch = '';
  let ahead = 0, behind = 0;
  const entries: GitStatusEntry[] = [];
  for (const line of lines) {
    if (line.startsWith('## ')) {
      // '## main...origin/main [ahead 1, behind 2]'
      const body = line.slice(3);
      const localName = body.split('...')[0]!.split(' ')[0]!;
      branch = localName;
      const aheadMatch = /ahead (\d+)/.exec(body); if (aheadMatch) ahead = Number(aheadMatch[1]);
      const behindMatch = /behind (\d+)/.exec(body); if (behindMatch) behind = Number(behindMatch[1]);
    } else if (line.length >= 3) {
      const index = line[0]!;
      const work = line[1]!;
      const path = line.slice(3);
      entries.push({ path, index, work });
    }
  }
  return { ok: true, status: { branch, ahead, behind, entries } };
}

export interface GitBranches { current: string; local: string[]; remote: string[] }
export async function gitBranches(project: Project): Promise<{ ok: boolean; error?: string; branches?: GitBranches }> {
  const r = await projectGit(project, ['branch', '--all', '--format=%(refname:short)|%(HEAD)']);
  if (r.code !== 0) return { ok: false, error: (r.stderr || r.stdout).trim() };
  const local = new Set<string>();
  const remote = new Set<string>();
  let current = '';
  for (const line of r.stdout.split('\n')) {
    const t = line.trim(); if (!t) continue;
    const [name, head] = t.split('|');
    if (!name) continue;
    if (name.startsWith('origin/')) remote.add(name.slice('origin/'.length));
    else local.add(name);
    if (head === '*') current = name;
  }
  return { ok: true, branches: { current, local: [...local], remote: [...remote] } };
}

export async function gitCheckoutBranch(project: Project, branch: string, create: boolean): Promise<{ ok: boolean; error?: string }> {
  const args = create ? ['checkout', '-b', branch] : ['checkout', branch];
  const r = await projectGit(project, args);
  if (r.code !== 0) return { ok: false, error: (r.stderr || r.stdout).trim() };
  return { ok: true };
}

export async function gitDiff(project: Project, path?: string): Promise<{ ok: boolean; error?: string; diff?: string }> {
  const args = ['diff', '--no-color'];
  if (path) args.push('--', path);
  const r = await projectGit(project, args);
  if (r.code !== 0) return { ok: false, error: (r.stderr || r.stdout).trim() };
  return { ok: true, diff: r.stdout };
}

export interface CommitResult { ok: boolean; error?: string; sha?: string }
export async function gitCommit(project: Project, message: string, authorName?: string, authorEmail?: string): Promise<CommitResult> {
  if (!message.trim()) return { ok: false, error: 'Commit message is required' };
  // Stage everything under the workspace.
  const add = await projectGit(project, ['add', '-A']);
  if (add.code !== 0) return { ok: false, error: (add.stderr || add.stdout).trim() };
  const env: Record<string, string> = {};
  if (authorName) env.GIT_AUTHOR_NAME = authorName;
  if (authorEmail) env.GIT_AUTHOR_EMAIL = authorEmail;
  if (authorName) env.GIT_COMMITTER_NAME = authorName;
  if (authorEmail) env.GIT_COMMITTER_EMAIL = authorEmail;
  const cwd = project.gitLocalPath || localMirrorPath(project.id);
  const pat = await tokenForConnection(project.gitConnectionId);
  const commit = await runGit(['commit', '-m', message], { cwd, pat, env });
  if (commit.code !== 0) {
    const err = (commit.stderr || commit.stdout).trim();
    // Empty commit is not an error we bubble up as fatal.
    if (/nothing to commit/i.test(err)) return { ok: false, error: 'Nothing to commit' };
    return { ok: false, error: err };
  }
  const sha = await projectGit(project, ['rev-parse', 'HEAD']);
  return { ok: true, sha: sha.code === 0 ? sha.stdout.trim() : undefined };
}

export async function gitPush(project: Project, branch?: string): Promise<{ ok: boolean; error?: string; stdout?: string }> {
  const target = branch || project.gitDefaultBranch || 'main';
  const r = await projectGit(project, ['push', 'origin', target]);
  if (r.code !== 0) return { ok: false, error: (r.stderr || r.stdout).trim() };
  return { ok: true, stdout: r.stdout };
}

export async function gitPull(project: Project): Promise<{ ok: boolean; error?: string; stdout?: string }> {
  const r = await projectGit(project, ['pull', '--ff-only']);
  if (r.code !== 0) return { ok: false, error: (r.stderr || r.stdout).trim() };
  return { ok: true, stdout: r.stdout };
}
