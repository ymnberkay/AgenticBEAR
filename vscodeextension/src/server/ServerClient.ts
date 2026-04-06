import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import type { Agent } from '../types';

export interface ServerProject {
  id: string;
  name: string;
  description: string;
  workspacePath: string;
  status: string;
}

export interface ServerAgent {
  id: string;
  projectId: string;
  role: 'orchestrator' | 'specialist';
  name: string;
  slug: string;
  systemPrompt: string;
  modelConfig: { model: string; maxTokens: number; temperature: number };
  color: string;
  icon: string;
}

function resolveBaseUrl(): string {
  // 1. Port file written by server on startup
  const portFile = path.resolve(os.homedir(), '.subagent-manager', 'port');
  try {
    const raw = fs.readFileSync(portFile, 'utf8').trim();
    const port = parseInt(raw, 10);
    if (!isNaN(port)) return `http://localhost:${port}`;
  } catch {}

  // 2. VS Code setting override
  const cfg = vscode.workspace.getConfiguration('agenticbear');
  const settingPort = cfg.get<number>('serverPort');
  if (settingPort) return `http://localhost:${settingPort}`;

  // 3. Default
  return 'http://localhost:3001';
}

export class ServerClient {
  get baseUrl(): string {
    return resolveBaseUrl();
  }

  async isRunning(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/health`, { signal: AbortSignal.timeout(2000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async getProjects(): Promise<ServerProject[]> {
    const res = await fetch(`${this.baseUrl}/api/projects`);
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    return res.json() as Promise<ServerProject[]>;
  }

  async getAgents(projectId: string): Promise<ServerAgent[]> {
    const res = await fetch(`${this.baseUrl}/api/projects/${projectId}/agents`);
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    return res.json() as Promise<ServerAgent[]>;
  }

  // Convert server agent format → extension Agent format
  toExtensionAgent(sa: ServerAgent): Agent {
    return {
      id: sa.id,
      name: sa.name,
      role: sa.role,
      provider: 'vscode-lm',
      model: sa.modelConfig?.model ?? 'claude-sonnet-4-6',
      systemPrompt: sa.systemPrompt,
      color: sa.color,
    };
  }
}

export const serverClient = new ServerClient();
