"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentTreeProvider = void 0;
const vscode = __importStar(require("vscode"));
const AgentStore_1 = require("../agents/AgentStore");
class AgentItem extends vscode.TreeItem {
    constructor(agent) {
        super(agent.name, vscode.TreeItemCollapsibleState.None);
        this.agent = agent;
        this.description = agent.model;
        this.tooltip = new vscode.MarkdownString(`**${agent.name}**\n\n` +
            `- Role: ${agent.role}\n` +
            `- Provider: ${agent.provider}\n` +
            `- Model: ${agent.model}\n\n` +
            `*Click to ask*`);
        this.iconPath = new vscode.ThemeIcon(agent.role === 'orchestrator' ? 'hubot' : 'account', agent.color ? new vscode.ThemeColor('charts.blue') : undefined);
        this.contextValue = 'agentItem';
        this.command = {
            command: 'agenticbear.askSpecificAgent',
            title: 'Ask Agent',
            arguments: [agent],
        };
    }
}
class SyncItem extends vscode.TreeItem {
    constructor(label, icon) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon(icon);
        this.contextValue = 'syncItem';
    }
}
class AgentTreeProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        AgentStore_1.agentStore.onDidChange(() => this.refresh());
    }
    refresh() {
        this._onDidChangeTreeData.fire(undefined);
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren() {
        const agents = await AgentStore_1.agentStore.load();
        const items = [];
        // Show sync status at top
        const project = AgentStore_1.agentStore.connectedProject;
        if (project) {
            const syncItem = new SyncItem(`⟳  ${project.name}`, 'link');
            syncItem.description = 'synced';
            syncItem.command = {
                command: 'agenticbear.connectServer',
                title: 'Change project',
            };
            items.push(syncItem);
        }
        else {
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
exports.AgentTreeProvider = AgentTreeProvider;
//# sourceMappingURL=AgentTreeProvider.js.map