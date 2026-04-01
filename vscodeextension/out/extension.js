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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const AgentTreeProvider_1 = require("./providers/AgentTreeProvider");
const AgentManagerPanel_1 = require("./providers/AgentManagerPanel");
const ChatPanel_1 = require("./providers/ChatPanel");
const LMBridge_1 = require("./lm/LMBridge");
const Orchestrator_1 = require("./orchestrator/Orchestrator");
const AgentStore_1 = require("./agents/AgentStore");
const ServerClient_1 = require("./server/ServerClient");
function activate(context) {
    const lm = new LMBridge_1.LMBridge(context.secrets);
    const orchestrator = new Orchestrator_1.Orchestrator(lm);
    const treeProvider = new AgentTreeProvider_1.AgentTreeProvider();
    // ── Sidebar tree ──────────────────────────────────────────────────────────
    vscode.window.registerTreeDataProvider('agenticbear.agents', treeProvider);
    // Status bar — shows active agent
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.command = 'agenticbear.openChat';
    statusBar.text = '$(hubot) AgenticBEAR';
    statusBar.tooltip = 'Open AgenticBEAR Chat';
    statusBar.show();
    context.subscriptions.push(statusBar);
    // Load agents on activate
    AgentStore_1.agentStore.load();
    // ── Open chat ─────────────────────────────────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('agenticbear.openChat', async () => {
        const panel = getChatPanel(context.extensionUri, lm, orchestrator, statusBar);
        await refreshChatAgents(panel, lm);
    }));
    // ── Manage agents panel ───────────────────────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('agenticbear.manageAgents', () => {
        AgentManagerPanel_1.AgentManagerPanel.createOrShow(context.extensionUri, lm);
    }));
    // ── Orchestrate (command palette) ─────────────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('agenticbear.orchestrate', async () => {
        const task = await vscode.window.showInputBox({
            prompt: 'Describe the task for your agents',
            placeHolder: 'e.g. Add JWT authentication with refresh tokens',
        });
        if (!task)
            return;
        const panel = getChatPanel(context.extensionUri, lm, orchestrator, statusBar);
        await refreshChatAgents(panel, lm);
        await runOrchestrate(task, null, panel, lm, orchestrator, statusBar);
    }));
    // ── Ask agent (quick pick) ────────────────────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('agenticbear.askAgent', async () => {
        const agents = await AgentStore_1.agentStore.load();
        const specialists = agents.filter(a => a.role === 'specialist');
        if (specialists.length === 0) {
            vscode.window.showWarningMessage('No specialist agents configured.');
            return;
        }
        const items = [
            { label: '🐻 Orchestrate', description: 'Let all agents collaborate', agent: null },
            ...specialists.map(a => ({ label: a.name, description: `${a.provider} / ${a.model}`, agent: a })),
        ];
        const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select agent or orchestrate' });
        if (!picked)
            return;
        const task = await buildTaskFromEditor(picked.agent);
        if (!task)
            return;
        const panel = getChatPanel(context.extensionUri, lm, orchestrator, statusBar);
        await refreshChatAgents(panel, lm, picked.agent?.id);
        await runOrchestrate(task, picked.agent, panel, lm, orchestrator, statusBar);
    }));
    // ── Ask specific agent (tree click) ──────────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('agenticbear.askSpecificAgent', async (agent) => {
        const task = await buildTaskFromEditor(agent);
        if (!task)
            return;
        const panel = getChatPanel(context.extensionUri, lm, orchestrator, statusBar);
        await refreshChatAgents(panel, lm, agent.id);
        await runOrchestrate(task, agent, panel, lm, orchestrator, statusBar);
    }));
    // ── Add agent → opens manager ─────────────────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('agenticbear.addAgent', () => {
        AgentManagerPanel_1.AgentManagerPanel.createOrShow(context.extensionUri, lm);
    }));
    // ── Refresh tree ──────────────────────────────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('agenticbear.refreshAgents', async () => {
        await AgentStore_1.agentStore.load();
        treeProvider.refresh();
    }));
    // ── Connect to AgenticBEAR server ─────────────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('agenticbear.connectServer', async () => {
        const running = await ServerClient_1.serverClient.isRunning();
        if (!running) {
            const pick = await vscode.window.showWarningMessage('AgenticBEAR server not running at localhost:3001. Start with: npx agenticbear', 'Dismiss');
            return;
        }
        let projects;
        try {
            projects = await ServerClient_1.serverClient.getProjects();
        }
        catch (err) {
            vscode.window.showErrorMessage(`Could not fetch projects: ${err}`);
            return;
        }
        if (projects.length === 0) {
            vscode.window.showInformationMessage('No projects found. Create one at http://localhost:3001');
            return;
        }
        const picked = await vscode.window.showQuickPick(projects.map(p => ({ label: p.name, description: p.workspacePath, project: p })), { placeHolder: 'Select project to sync agents from' });
        if (!picked)
            return;
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Syncing from "${picked.label}"…` }, async () => AgentStore_1.agentStore.syncFromServer(picked.project.id, picked.project.name));
        treeProvider.refresh();
        vscode.window.showInformationMessage(`Agents synced from "${picked.label}"`);
    }));
    // ── Disconnect ────────────────────────────────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('agenticbear.disconnect', () => {
        AgentStore_1.agentStore.disconnect();
        treeProvider.refresh();
        vscode.window.showInformationMessage('Disconnected. Using local agents.');
    }));
    // ── Set API keys ──────────────────────────────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('agenticbear.setApiKey', async () => {
        const provider = await vscode.window.showQuickPick([
            { label: 'Anthropic', description: 'claude-* models via direct API' },
            { label: 'OpenAI', description: 'gpt-* models via direct API' },
        ], { placeHolder: 'Which provider?' });
        if (!provider)
            return;
        const key = await vscode.window.showInputBox({
            prompt: `Paste your ${provider.label} API key`,
            password: true,
            placeHolder: provider.label === 'Anthropic' ? 'sk-ant-...' : 'sk-...',
        });
        if (!key)
            return;
        const secretKey = provider.label === 'Anthropic'
            ? 'agenticbear.anthropicKey'
            : 'agenticbear.openaiKey';
        await context.secrets.store(secretKey, key);
        vscode.window.showInformationMessage(`${provider.label} API key saved.`);
    }));
    // When agents change (add/delete/sync) refresh open chat panel tabs
    AgentStore_1.agentStore.onDidChange(async () => {
        treeProvider.refresh();
        // If chat panel is open, update its agent tabs too
        const panel = ChatPanel_1.ChatPanel.current();
        if (panel)
            await refreshChatAgents(panel, lm);
    });
}
// ── Chat panel singleton helper ───────────────────────────────────────────
function getChatPanel(extensionUri, lm, orchestrator, statusBar) {
    const panel = ChatPanel_1.ChatPanel.createOrShow(extensionUri);
    // Wire user message handler once
    panel.onUserMessage(async (text, agentId) => {
        const agents = await AgentStore_1.agentStore.load();
        const agent = agentId ? agents.find(a => a.id === agentId) ?? null : null;
        await runOrchestrate(text, agent, panel, lm, orchestrator, statusBar);
    });
    // When webview signals ready, send current agents + model status
    panel.onReady(async () => {
        await refreshChatAgents(panel, lm);
    });
    return panel;
}
// ── Refresh agent tabs + model status in the chat panel ───────────────────
async function refreshChatAgents(panel, lm, activeAgentId) {
    const agents = await AgentStore_1.agentStore.load();
    panel.setAgents(agents, activeAgentId);
    if (activeAgentId) {
        const agent = agents.find(a => a.id === activeAgentId);
        if (agent) {
            const status = await lm.checkModel(agent);
            panel.setModelStatus(status);
        }
    }
    else {
        // Orchestrate mode — check orchestrator agent
        const orch = agents.find(a => a.role === 'orchestrator');
        if (orch) {
            const status = await lm.checkModel(orch);
            panel.setModelStatus(status);
        }
    }
}
// ── Main runner: single agent or full orchestration ───────────────────────
async function runOrchestrate(task, agent, panel, lm, orchestrator, statusBar) {
    panel.setBusy(true);
    panel.post(userMsg(task));
    const cts = new vscode.CancellationTokenSource();
    if (agent) {
        // ── Single agent mode ─────────────────────────────────────────────────
        statusBar.text = `$(sync~spin) ${agent.name}`;
        // Check model first
        const modelStatus = await lm.checkModel(agent);
        panel.setModelStatus(modelStatus);
        if (!modelStatus.available) {
            panel.post(errMsg(modelStatus.reason ?? 'Model unavailable'));
            panel.setBusy(false);
            statusBar.text = '$(hubot) AgenticBEAR';
            return;
        }
        panel.post({ type: 'agent', agentName: agent.name, content: '', timestamp: Date.now() });
        try {
            await lm.send(agent, [{ role: 'user', content: task }], [], cts.token, chunk => panel.post({ type: 'chunk', agentName: agent.name, content: chunk, timestamp: Date.now() }));
        }
        catch (err) {
            panel.post(errMsg(String(err)));
        }
    }
    else {
        // ── Orchestrate mode ──────────────────────────────────────────────────
        statusBar.text = '$(sync~spin) Orchestrating…';
        try {
            await orchestrator.run(task, event => {
                switch (event.type) {
                    case 'plan':
                        panel.post(sysMsg(`Plan: ${event.plan.summary} — ${event.plan.steps.length} step(s)`));
                        break;
                    case 'step_start':
                        statusBar.text = `$(sync~spin) ${event.step.agentName}`;
                        panel.post(sysMsg(`[${event.index + 1}/${event.total}] ${event.step.agentName}: ${event.step.task}`));
                        panel.post({ type: 'agent', agentName: event.step.agentName, content: '', timestamp: Date.now() });
                        break;
                    case 'chunk':
                        panel.post({ type: 'chunk', agentName: event.agentName, content: event.text, timestamp: Date.now() });
                        break;
                    case 'tool_call':
                        panel.post(toolMsg(`${event.toolName}${event.path ? ': ' + event.path : ''}`));
                        break;
                    case 'step_done': {
                        const r = event.result;
                        const parts = [
                            ...r.filesCreated.map(f => `+ ${f}`),
                            ...r.filesModified.map(f => `~ ${f}`),
                        ];
                        if (parts.length)
                            panel.post(sysMsg(parts.join('  ')));
                        break;
                    }
                    case 'done': {
                        const total = event.results.reduce((n, r) => n + r.filesCreated.length + r.filesModified.length, 0);
                        panel.post(sysMsg(`Done — ${total} file(s) changed`));
                        break;
                    }
                    case 'error':
                        panel.post(errMsg(event.message));
                        break;
                }
            }, cts.token);
        }
        catch (err) {
            panel.post(errMsg(`Orchestration error: ${err instanceof Error ? err.message : String(err)}`));
        }
    }
    statusBar.text = '$(hubot) AgenticBEAR';
    panel.setBusy(false);
}
// ── Message helpers ───────────────────────────────────────────────────────
function userMsg(content) {
    return { type: 'user', content, timestamp: Date.now() };
}
function sysMsg(content) {
    return { type: 'system', content, timestamp: Date.now() };
}
function toolMsg(content) {
    return { type: 'tool', content, timestamp: Date.now() };
}
function errMsg(content) {
    return { type: 'error', content, timestamp: Date.now() };
}
// ── Build task with optional editor selection ─────────────────────────────
async function buildTaskFromEditor(agent) {
    const editor = vscode.window.activeTextEditor;
    const sel = editor?.selection;
    const selectedText = editor && sel && !sel.isEmpty
        ? editor.document.getText(sel)
        : undefined;
    const task = await vscode.window.showInputBox({
        prompt: selectedText
            ? `Ask ${agent?.name ?? 'agents'} about the selected code`
            : `What should ${agent?.name ?? 'the agents'} do?`,
    });
    if (!task)
        return undefined;
    return selectedText
        ? `${task}\n\nSelected code:\n\`\`\`\n${selectedText}\n\`\`\``
        : task;
}
function deactivate() { }
//# sourceMappingURL=extension.js.map