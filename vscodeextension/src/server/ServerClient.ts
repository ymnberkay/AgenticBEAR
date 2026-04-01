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

export class ServerClient {
  constructor(private baseUrl: string = 'http://localhost:3001') {}

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
