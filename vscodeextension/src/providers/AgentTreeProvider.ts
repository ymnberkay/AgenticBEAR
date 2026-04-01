import * as vscode from 'vscode';
import type { Agent } from '../types';
import { agentStore } from '../agents/AgentStore';

class AgentItem extends vscode.TreeItem {
  constructor(public readonly agent: Agent) {
    super(agent.name, vscode.TreeItemCollapsibleState.None);
    this.description = agent.model;
    this.tooltip = new vscode.MarkdownString(
      `**${agent.name}**\n\n` +
      `- Role: ${agent.role}\n` +
      `- Provider: ${agent.provider}\n` +
      `- Model: ${agent.model}\n\n` +
      `*Click to ask*`,
    );
    this.iconPath = new vscode.ThemeIcon(
      agent.role === 'orchestrator' ? 'hubot' : 'account',
      agent.color ? new vscode.ThemeColor('charts.blue') : undefined,
    );
    this.contextValue = 'agentItem';
    this.command = {
      command: 'agenticbear.askSpecificAgent',
      title: 'Ask Agent',
      arguments: [agent],
    };
  }
}

class SyncItem extends vscode.TreeItem {
  constructor(label: string, icon: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(icon);
    this.contextValue = 'syncItem';
  }
}

export class AgentTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor() {
    agentStore.onDidChange(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<vscode.TreeItem[]> {
    const agents = await agentStore.load();
    const items: vscode.TreeItem[] = [];

    // Show sync status at top
    const project = agentStore.connectedProject;
    if (project) {
      const syncItem = new SyncItem(`⟳  ${project.name}`, 'link');
      syncItem.description = 'synced';
      syncItem.command = {
        command: 'agenticbear.connectServer',
        title: 'Change project',
      };
      items.push(syncItem);
    } else {
      const connectItem = new SyncItem('Connect to AgenticBEAR', 'plug');
      connectItem.description = 'optional';
      connectItem.command = {
        command: 'agenticbear.connectServer',
        title: 'Connect',
      };
      items.push(connectItem);
    }

    items.push(...agents.map(a => new AgentItem(a)));
    return items;
  }
}
