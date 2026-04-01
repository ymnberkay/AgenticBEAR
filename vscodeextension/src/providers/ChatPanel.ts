import * as vscode from 'vscode';
import type { ChatMessage, Agent } from '../types';

export class ChatPanel {
  private static _current: ChatPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _onUserMessage?: (text: string, agentId: string | null) => void;

  static current(): ChatPanel | undefined {
    return ChatPanel._current;
  }

  static createOrShow(extensionUri: vscode.Uri): ChatPanel {
    if (ChatPanel._current) {
      ChatPanel._current._panel.reveal();
      return ChatPanel._current;
    }
    const panel = vscode.window.createWebviewPanel(
      'agenticbear.chat',
      'AgenticBEAR',
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    ChatPanel._current = new ChatPanel(panel);
    return ChatPanel._current;
  }

  private constructor(panel: vscode.WebviewPanel) {
    this._panel = panel;
    this._panel.onDidDispose(() => { ChatPanel._current = undefined; });
    this._panel.webview.html = this.buildHtml();

    this._panel.webview.onDidReceiveMessage(msg => {
      if (msg.type === 'userMessage') {
        this._onUserMessage?.(msg.text as string, msg.agentId as string | null);
      }
      // Webview signals it's ready — flush any pending state
      if (msg.type === 'ready') {
        this._onReady?.();
      }
    });
  }

  private _onReady?: () => void;

  onReady(cb: () => void) {
    this._onReady = cb;
  }

  // Only sets once — subsequent calls are no-ops so we don't double-fire
  onUserMessage(cb: (text: string, agentId: string | null) => void) {
    if (!this._onUserMessage) this._onUserMessage = cb;
  }

  post(msg: ChatMessage) {
    this._panel.webview.postMessage({ type: 'message', msg });
  }

  clear() {
    this._panel.webview.postMessage({ type: 'clear' });
  }

  setBusy(busy: boolean) {
    this._panel.webview.postMessage({ type: busy ? 'busy' : 'idle' });
  }

  // Send agent list so the panel can show a selector
  setAgents(agents: Agent[], activeId?: string) {
    this._panel.webview.postMessage({ type: 'agents', agents, activeId });
  }

  // Show model status under the selector
  setModelStatus(status: { available: boolean; displayName: string; reason?: string }) {
    this._panel.webview.postMessage({ type: 'modelStatus', status });
  }

  private buildHtml(): string {
    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AgenticBEAR</title>
<style>
  :root {
    --bg: var(--vscode-editor-background);
    --fg: var(--vscode-editor-foreground);
    --border: var(--vscode-panel-border);
    --input-bg: var(--vscode-input-background);
    --input-fg: var(--vscode-input-foreground);
    --btn-bg: var(--vscode-button-background);
    --btn-fg: var(--vscode-button-foreground);
    --accent: var(--vscode-textLink-foreground);
    --hover: var(--vscode-list-hoverBackground);
    --ok: var(--vscode-gitDecoration-addedResourceForeground, #81b88b);
    --warn: var(--vscode-gitDecoration-modifiedResourceForeground, #e2c08d);
    --err: var(--vscode-errorForeground, #f48771);
    --mono: var(--vscode-editor-font-family, monospace);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg); color: var(--fg);
    font-family: var(--mono); font-size: 13px;
    display: flex; flex-direction: column; height: 100vh; overflow: hidden;
  }

  /* ── Top bar ── */
  #topbar {
    border-bottom: 1px solid var(--border);
    padding: 10px 14px 8px;
    display: flex; flex-direction: column; gap: 5px;
  }
  #topbar-row {
    display: flex; align-items: center; gap: 10px;
  }
  #topbar-label {
    font-size: 10px; text-transform: uppercase;
    letter-spacing: .07em; opacity: .5; flex-shrink: 0;
  }
  #agent-tabs {
    display: flex; gap: 6px; flex-wrap: wrap; flex: 1;
  }
  .agent-tab {
    display: flex; align-items: center; gap: 5px;
    padding: 3px 9px; border-radius: 12px; cursor: pointer;
    border: 1px solid var(--border); font-size: 11px;
    background: none; color: var(--fg); font-family: var(--mono);
    transition: opacity .15s;
  }
  .agent-tab:hover { background: var(--hover); }
  .agent-tab.active {
    background: var(--hover);
    border-color: var(--accent);
    color: var(--accent);
  }
  .agent-tab.orchestrate {
    border-style: dashed;
  }
  .tab-dot {
    width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
  }
  #model-status {
    font-size: 11px; padding: 0 2px;
    display: none;
  }
  #model-status.ok    { color: var(--ok); }
  #model-status.warn  { color: var(--warn); }
  #model-status.error { color: var(--err); }

  /* ── Messages ── */
  #messages {
    flex: 1; overflow-y: auto; padding: 12px 14px;
    display: flex; flex-direction: column; gap: 8px;
  }
  .msg { display: flex; flex-direction: column; gap: 2px; }
  .msg-label {
    font-size: 10px; text-transform: uppercase;
    letter-spacing: .07em; opacity: .45;
  }
  .agent-label { color: var(--accent); opacity: 1; }
  .msg-body {
    padding: 7px 10px; border-radius: 3px;
    white-space: pre-wrap; word-break: break-word;
    line-height: 1.55; border-left: 2px solid transparent;
  }
  .msg.user  .msg-body { background: var(--vscode-editor-selectionBackground); border-left-color: var(--accent); }
  .msg.agent .msg-body { background: var(--input-bg); }
  .msg.tool  .msg-body { font-size: 11px; opacity: .7; border-left-color: var(--warn); padding: 3px 10px; }
  .msg.system .msg-body { font-size: 11px; opacity: .6; border-left-color: var(--ok); padding: 3px 10px; }
  .msg.error .msg-body { border-left-color: var(--err); color: var(--err); }

  /* ── Input ── */
  #input-row {
    border-top: 1px solid var(--border);
    padding: 10px 14px;
    display: flex; gap: 8px; align-items: flex-end;
  }
  #input {
    flex: 1; background: var(--input-bg); color: var(--input-fg);
    border: 1px solid var(--border); border-radius: 3px;
    padding: 8px 10px; font-family: var(--mono); font-size: 13px;
    resize: none; min-height: 38px; max-height: 120px; outline: none;
  }
  #input:focus { border-color: var(--accent); }
  #send-btn {
    background: var(--btn-bg); color: var(--btn-fg);
    border: none; border-radius: 3px;
    padding: 0 14px; height: 38px; cursor: pointer;
    font-family: var(--mono); font-size: 11px;
    text-transform: uppercase; letter-spacing: .05em;
    flex-shrink: 0;
  }
  #send-btn:disabled { opacity: .4; cursor: default; }
  .spin { display: inline-block; animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>

<div id="topbar">
  <div id="topbar-row">
    <span id="topbar-label">Agent</span>
    <div id="agent-tabs">
      <!-- populated by setAgents() -->
      <button class="agent-tab orchestrate active" data-id="__orchestrate__">
        🐻 Orchestrate
      </button>
    </div>
  </div>
  <div id="model-status"></div>
</div>

<div id="messages"></div>

<div id="input-row">
  <textarea id="input" placeholder="Describe a task or ask an agent…" rows="1"></textarea>
  <button id="send-btn">Run</button>
</div>

<script>
const vscode = acquireVsCodeApi();
const messagesEl = document.getElementById('messages');
const inputEl    = document.getElementById('input');
const sendBtn    = document.getElementById('send-btn');
const tabsEl     = document.getElementById('agent-tabs');
const statusEl   = document.getElementById('model-status');

let activeAgentId = null; // null = orchestrate mode
let currentAgentBodyEl = null;

// ── Agent tabs ────────────────────────────────────────────────────────────
function setAgents(agents, activeId) {
  tabsEl.innerHTML = '';

  // Orchestrate tab
  const orch = makeTab(null, '🐻', 'Orchestrate', null, 'orchestrate');
  tabsEl.appendChild(orch);

  agents.forEach(agent => {
    const tab = makeTab(agent.id, null, agent.name, agent.color);
    tabsEl.appendChild(tab);
  });

  selectTab(activeId ?? null);
}

function makeTab(id, emoji, label, color, extraClass) {
  const btn = document.createElement('button');
  btn.className = 'agent-tab' + (extraClass ? ' ' + extraClass : '');
  btn.dataset.id = id ?? '__orchestrate__';

  if (color) {
    const dot = document.createElement('span');
    dot.className = 'tab-dot';
    dot.style.background = color;
    btn.appendChild(dot);
  } else if (emoji) {
    btn.appendChild(document.createTextNode(emoji + ' '));
  }

  btn.appendChild(document.createTextNode(label));
  btn.onclick = () => {
    selectTab(id);
    vscode.postMessage({ type: 'agentSelected', agentId: id });
  };
  return btn;
}

function selectTab(id) {
  activeAgentId = id;
  document.querySelectorAll('.agent-tab').forEach(t => {
    const tid = t.dataset.id === '__orchestrate__' ? null : t.dataset.id;
    t.classList.toggle('active', tid === id);
  });
}

// ── Model status ──────────────────────────────────────────────────────────
function setModelStatus(s) {
  statusEl.style.display = 'block';
  statusEl.className = s.available ? 'ok' : 'error';
  statusEl.textContent = s.available
    ? '✓ ' + s.displayName
    : '✗ ' + (s.reason || s.displayName);
}

// ── Messages ──────────────────────────────────────────────────────────────
function addMessage(msg) {
  if (msg.type === 'chunk' && currentAgentBodyEl) {
    currentAgentBodyEl.textContent += msg.content;
    scrollBottom();
    return;
  }
  currentAgentBodyEl = null;

  const wrap = document.createElement('div');
  wrap.className = 'msg ' + msg.type;

  const label = document.createElement('div');
  label.className = 'msg-label' + (msg.type === 'agent' ? ' agent-label' : '');
  label.textContent = msg.agentName || msg.type;

  const body = document.createElement('div');
  body.className = 'msg-body';
  body.textContent = msg.content;

  wrap.appendChild(label);
  wrap.appendChild(body);
  messagesEl.appendChild(wrap);
  scrollBottom();

  if (msg.type === 'agent') currentAgentBodyEl = body;
}

function scrollBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ── VS Code → WebView messages ────────────────────────────────────────────
window.addEventListener('message', e => {
  const d = e.data;
  if (d.type === 'message')     addMessage(d.msg);
  if (d.type === 'clear')       { messagesEl.innerHTML = ''; currentAgentBodyEl = null; }
  if (d.type === 'agents')      setAgents(d.agents, d.activeId);
  if (d.type === 'modelStatus') setModelStatus(d.status);
  if (d.type === 'busy')        { sendBtn.disabled = true;  sendBtn.innerHTML = '<span class="spin">↻</span> Running'; }
  if (d.type === 'idle')        { sendBtn.disabled = false; sendBtn.textContent = 'Run'; }
});

// ── Send ──────────────────────────────────────────────────────────────────
function send() {
  const text = inputEl.value.trim();
  if (!text || sendBtn.disabled) return;
  vscode.postMessage({ type: 'userMessage', text, agentId: activeAgentId });
  inputEl.value = '';
  inputEl.style.height = 'auto';
}

sendBtn.addEventListener('click', send);
inputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});
inputEl.addEventListener('input', () => {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
});

// Signal ready so extension can send agent list
vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
  }
}
