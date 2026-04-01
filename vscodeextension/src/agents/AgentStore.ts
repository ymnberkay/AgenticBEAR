import * as vscode from 'vscode';
import { nanoid } from '../utils/nanoid';
import type { Agent, AgentConfig } from '../types';
import { DEFAULT_AGENTS } from './defaultAgents';
import { serverClient } from '../server/ServerClient';

const CONFIG_FILE = '.vscode/agenticbear.json';

export class AgentStore {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  // In-memory cache — always valid, even with no workspace
  private _cache: Agent[] = [...DEFAULT_AGENTS];
  private _connectedProject: { id: string; name: string } | undefined;

  get connectedProject() { return this._connectedProject; }
  get agents() { return this._cache; }

  private getConfigUri(): vscode.Uri | undefined {
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws) return undefined;
    return vscode.Uri.joinPath(ws.uri, CONFIG_FILE);
  }

  // ── Load ─────────────────────────────────────────────────────────────────

  async load(): Promise<Agent[]> {
    // If synced from server, return cache directly
    if (this._connectedProject) return this._cache;

    const uri = this.getConfigUri();
    if (!uri) {
      this._cache = [...DEFAULT_AGENTS];
      return this._cache;
    }

    try {
      const raw = await vscode.workspace.fs.readFile(uri);
      const config: AgentConfig = JSON.parse(Buffer.from(raw).toString('utf-8'));
      this._cache = config.agents?.length ? config.agents : [...DEFAULT_AGENTS];
    } catch {
      this._cache = [...DEFAULT_AGENTS];
    }

    return this._cache;
  }

  // ── Save (local) ──────────────────────────────────────────────────────────

  async save(agents: Agent[]): Promise<void> {
    this._cache = agents;

    const uri = this.getConfigUri();
    if (uri) {
      const config: AgentConfig = { agents };
      await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(config, null, 2), 'utf-8'));
    }

    this._onDidChange.fire();
  }

  async add(agent: Omit<Agent, 'id'>): Promise<Agent> {
    const agents = await this.load();
    const newAgent: Agent = { ...agent, id: nanoid() };
    agents.push(newAgent);
    await this.save(agents);
    return newAgent;
  }

  async remove(id: string): Promise<void> {
    const agents = await this.load();
    await this.save(agents.filter(a => a.id !== id));
  }

  async update(id: string, patch: Partial<Agent>): Promise<void> {
    const agents = await this.load();
    const idx = agents.findIndex(a => a.id === id);
    if (idx !== -1) {
      agents[idx] = { ...agents[idx], ...patch };
      await this.save(agents);
    }
  }

  // ── Server sync ───────────────────────────────────────────────────────────

  async syncFromServer(projectId: string, projectName: string): Promise<void> {
    const serverAgents = await serverClient.getAgents(projectId);
    this._cache = serverAgents.map(a => serverClient.toExtensionAgent(a));
    this._connectedProject = { id: projectId, name: projectName };
    this._onDidChange.fire();
  }

  disconnect(): void {
    this._connectedProject = undefined;
    this._cache = [...DEFAULT_AGENTS];
    this._onDidChange.fire();
  }

  async getOrchestrator(): Promise<Agent | undefined> {
    return this._cache.find(a => a.role === 'orchestrator');
  }

  async getSpecialists(): Promise<Agent[]> {
    return this._cache.filter(a => a.role === 'specialist');
  }
}

export const agentStore = new AgentStore();
