import * as vscode from 'vscode';
import type { Agent } from '../types';
import type { AvailableModel } from '../lm/LMBridge';
import { LMBridge } from '../lm/LMBridge';
import { agentStore } from '../agents/AgentStore';
import { TEMPLATE_CATEGORIES } from '../agents/agentTemplates';

export class AgentManagerPanel {
  private static _current: AgentManagerPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _lm!: LMBridge;

  static createOrShow(extensionUri: vscode.Uri, lm: LMBridge): AgentManagerPanel {
    if (AgentManagerPanel._current) {
      AgentManagerPanel._current._panel.reveal();
      return AgentManagerPanel._current;
    }
    const panel = vscode.window.createWebviewPanel(
      'agenticbear.agentManager',
      'AgenticBEAR — Agents',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    AgentManagerPanel._current = new AgentManagerPanel(panel, lm);
    return AgentManagerPanel._current;
  }

  private constructor(panel: vscode.WebviewPanel, lm: LMBridge) {
    this._panel = panel;
    this._lm = lm;
    this._panel.onDidDispose(() => { AgentManagerPanel._current = undefined; });
    this._panel.webview.html = this.buildHtml();

    this._panel.webview.onDidReceiveMessage(async msg => {
      switch (msg.type) {
        case 'ready':
          await this.sendAll();
          break;
        case 'requestModels':
          await this.sendModels();
          break;
        case 'saveAgent':
          await this.saveAgent(msg.agent as Partial<Agent> & { id?: string });
          break;
        case 'deleteAgent':
          await agentStore.remove(msg.id as string);
          await this.sendAgents();
          break;
      }
    });

    agentStore.onDidChange(async () => this.sendAgents());
  }

  private async sendAll() {
    await this.sendAgents();
    await this.sendModels();
    this._panel.webview.postMessage({ type: 'templates', categories: TEMPLATE_CATEGORIES });
  }

  private async sendAgents() {
    const agents = await agentStore.load();
    const project = agentStore.connectedProject;
    this._panel.webview.postMessage({ type: 'agents', agents, project });
  }

  private async sendModels() {
    const models = await this._lm.listAvailableModels();
    this._panel.webview.postMessage({ type: 'models', models });
  }

  private async saveAgent(data: Partial<Agent> & { id?: string }) {
    if (data.id) {
      await agentStore.update(data.id, data);
    } else {
      await agentStore.add({
        name: data.name!,
        role: data.role!,
        provider: data.provider!,
        model: data.model!,
        systemPrompt: data.systemPrompt!,
        color: data.color,
      });
    }
    await this.sendAgents();
    this._panel.webview.postMessage({ type: 'saved' });
  }

  private buildHtml(): string {
    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Agents</title>
<style>
  :root {
    --bg: var(--vscode-editor-background);
    --fg: var(--vscode-editor-foreground);
    --border: var(--vscode-panel-border);
    --input-bg: var(--vscode-input-background);
    --input-fg: var(--vscode-input-foreground);
    --btn-bg: var(--vscode-button-background);
    --btn-fg: var(--vscode-button-foreground);
    --btn2-bg: var(--vscode-button-secondaryBackground, #3a3d41);
    --btn2-fg: var(--vscode-button-secondaryForeground, #ccc);
    --accent: var(--vscode-textLink-foreground);
    --hover: var(--vscode-list-hoverBackground);
    --danger: var(--vscode-errorForeground, #f48771);
    --ok: var(--vscode-gitDecoration-addedResourceForeground, #81b88b);
    --mono: var(--vscode-editor-font-family, monospace);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg); color: var(--fg);
    font-family: var(--mono); font-size: 13px;
    display: flex; height: 100vh; overflow: hidden;
  }

  /* ── Left pane ── */
  #left {
    width: 220px; flex-shrink: 0;
    border-right: 1px solid var(--border);
    display: flex; flex-direction: column;
  }
  #left-header {
    padding: 11px 12px 9px;
    border-bottom: 1px solid var(--border);
    display: flex; align-items: center; justify-content: space-between;
  }
  #left-header span { font-size: 10px; text-transform: uppercase; letter-spacing: .07em; opacity: .5; }
  #add-btn {
    background: none; border: 1px solid var(--border);
    color: var(--fg); cursor: pointer; border-radius: 3px;
    padding: 3px 9px; font-size: 11px; font-family: var(--mono);
  }
  #add-btn:hover { background: var(--hover); }
  #sync-bar {
    display: none; padding: 5px 12px; font-size: 11px;
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    border-bottom: 1px solid var(--border); opacity: .8;
  }
  #agent-list { flex: 1; overflow-y: auto; }
  .a-row {
    padding: 8px 12px; cursor: pointer;
    display: flex; align-items: center; gap: 8px;
    border-left: 2px solid transparent;
  }
  .a-row:hover { background: var(--hover); }
  .a-row.active { background: var(--hover); border-left-color: var(--accent); }
  .a-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .a-info { flex: 1; min-width: 0; }
  .a-name { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .a-meta { font-size: 10px; opacity: .45; margin-top: 1px; }

  /* ── Right pane ── */
  #right {
    flex: 1; overflow-y: auto; padding: 20px 24px;
    display: flex; flex-direction: column; gap: 0;
  }
  #right.empty {
    align-items: center; justify-content: center;
    opacity: .35; font-size: 12px;
  }

  /* ── Tabs inside right pane ── */
  #editor-tabs {
    display: flex; gap: 0; margin-bottom: 20px;
    border-bottom: 1px solid var(--border);
  }
  .etab {
    padding: 7px 16px; cursor: pointer; font-size: 11px;
    text-transform: uppercase; letter-spacing: .06em;
    border-bottom: 2px solid transparent; margin-bottom: -1px;
    background: none; border-top: none; border-left: none; border-right: none;
    color: var(--fg); font-family: var(--mono); opacity: .55;
  }
  .etab:hover { opacity: .85; }
  .etab.active { opacity: 1; border-bottom-color: var(--accent); color: var(--accent); }

  /* ── Template grid ── */
  #tmpl-pane { display: none; }
  #tmpl-pane.visible { display: block; }
  .tmpl-cat { margin-bottom: 20px; }
  .tmpl-cat-header {
    font-size: 11px; text-transform: uppercase;
    letter-spacing: .07em; opacity: .5;
    margin-bottom: 8px; padding-bottom: 5px;
    border-bottom: 1px solid var(--border);
  }
  .tmpl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
  .tmpl-card {
    padding: 11px 13px; border-radius: 4px;
    border: 1px solid var(--border); cursor: pointer;
    transition: border-color .15s, background .15s;
    background: var(--input-bg);
  }
  .tmpl-card:hover { border-color: var(--accent); background: var(--hover); }
  .tmpl-name { font-size: 12px; margin-bottom: 3px; }
  .tmpl-desc { font-size: 11px; opacity: .5; }
  .tmpl-dot {
    display: inline-block; width: 7px; height: 7px;
    border-radius: 50%; margin-right: 5px; vertical-align: middle;
  }

  /* ── Form pane ── */
  #form-pane { display: none; }
  #form-pane.visible { display: flex; flex-direction: column; gap: 14px; }
  .field { display: flex; flex-direction: column; gap: 5px; }
  label { font-size: 11px; text-transform: uppercase; letter-spacing: .07em; opacity: .55; }
  input[type=text], textarea, select {
    background: var(--input-bg); color: var(--input-fg);
    border: 1px solid var(--border); border-radius: 3px;
    padding: 7px 9px; font-family: var(--mono); font-size: 13px;
    outline: none; width: 100%;
  }
  input[type=text]:focus, textarea:focus, select:focus { border-color: var(--accent); }
  textarea { resize: vertical; min-height: 130px; line-height: 1.55; }
  .row { display: flex; gap: 12px; }
  .row .field { flex: 1; }
  select option { background: var(--input-bg); }

  /* model dropdown hint */
  .model-hint { font-size: 10px; opacity: .45; margin-top: 3px; }
  .model-hint.ok { opacity: 1; color: var(--ok); }
  .model-hint.err { opacity: 1; color: var(--danger); }

  /* color */
  .color-row { display: flex; align-items: center; gap: 8px; }
  input[type=color] { width: 34px; height: 30px; padding: 2px; cursor: pointer; border-radius: 3px; border: 1px solid var(--border); }

  /* actions */
  #form-actions { display: flex; gap: 8px; align-items: center; padding-top: 4px; }
  .btn-primary {
    background: var(--btn-bg); color: var(--btn-fg);
    border: none; border-radius: 3px; padding: 7px 16px; cursor: pointer;
    font-family: var(--mono); font-size: 11px; text-transform: uppercase; letter-spacing: .05em;
  }
  .btn-secondary {
    background: none; color: var(--btn2-fg, var(--fg));
    border: 1px solid var(--border); border-radius: 3px;
    padding: 7px 13px; cursor: pointer; font-family: var(--mono); font-size: 11px;
  }
  .btn-secondary:hover { background: var(--hover); }
  .btn-danger {
    margin-left: auto; background: none; color: var(--danger);
    border: 1px solid var(--danger); border-radius: 3px;
    padding: 7px 13px; cursor: pointer; font-family: var(--mono); font-size: 11px;
  }
  #saved-msg { font-size: 11px; color: var(--ok); opacity: 0; transition: opacity .3s; }
</style>
</head>
<body>

<!-- Left: agent list -->
<div id="left">
  <div id="sync-bar"></div>
  <div id="left-header">
    <span>Agents</span>
    <button id="add-btn">+ New</button>
  </div>
  <div id="agent-list"></div>
</div>

<!-- Right: template picker or form -->
<div id="right" class="empty">
  <div>← select an agent or click + New</div>
</div>

<script>
const vscode = acquireVsCodeApi();

let agents = [];
let models = [];
let categories = [];
let selectedId = null;   // null = new

// ── VS Code messages ──────────────────────────────────────────────────────
window.addEventListener('message', e => {
  const d = e.data;
  if (d.type === 'agents') {
    agents = d.agents;
    if (d.project) {
      const b = document.getElementById('sync-bar');
      b.textContent = '🔗 ' + d.project.name;
      b.style.display = 'block';
    }
    renderList();
  }
  if (d.type === 'models') {
    models = d.models;
    refreshModelDropdown();
  }
  if (d.type === 'templates') {
    categories = d.categories;
    // If template pane is visible, re-render
    const tp = document.getElementById('tmpl-pane');
    if (tp && tp.classList.contains('visible')) renderTemplates();
  }
  if (d.type === 'saved') {
    const el = document.getElementById('saved-msg');
    if (el) { el.style.opacity = '1'; setTimeout(() => el.style.opacity = '0', 1800); }
  }
});

// ── Agent list ────────────────────────────────────────────────────────────
function renderList() {
  const el = document.getElementById('agent-list');
  el.innerHTML = '';
  agents.forEach(a => {
    const row = document.createElement('div');
    row.className = 'a-row' + (a.id === selectedId ? ' active' : '');
    row.innerHTML =
      '<div class="a-dot" style="background:' + (a.color || '#71717a') + '"></div>' +
      '<div class="a-info">' +
        '<div class="a-name">' + esc(a.name) + '</div>' +
        '<div class="a-meta">' + a.role + ' · ' + a.provider + '</div>' +
      '</div>';
    row.onclick = () => { selectedId = a.id; renderList(); openForm(a); };
    el.appendChild(row);
  });
}

// ── Add new → show template picker ───────────────────────────────────────
document.getElementById('add-btn').onclick = () => {
  selectedId = null;
  renderList();
  openWithTabs(null, 'templates');
};

// ── Right pane builder ────────────────────────────────────────────────────
function openWithTabs(agent, startTab) {
  const right = document.getElementById('right');
  right.className = '';
  right.innerHTML = \`
    <div id="editor-tabs">
      <button class="etab\${startTab==='templates'?' active':''}" data-tab="templates">Templates</button>
      <button class="etab\${startTab==='form'?' active':''}" data-tab="form">
        \${agent ? 'Edit Agent' : 'Custom'}
      </button>
    </div>
    <div id="tmpl-pane" class="\${startTab==='templates'?'visible':''}"></div>
    <div id="form-pane" class="\${startTab==='form'?'visible':''}"></div>
  \`;

  document.querySelectorAll('.etab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.etab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById('tmpl-pane').classList.toggle('visible', tab === 'templates');
      document.getElementById('form-pane').classList.toggle('visible', tab === 'form');
    });
  });

  renderTemplates();
  if (agent) buildForm(agent);
  else buildForm({ id:'', name:'', role:'specialist', provider:'vscode-lm', model:'', systemPrompt:'', color:'#3b82f6' });
}

function openForm(agent) {
  openWithTabs(agent, 'form');
}

// ── Template grid ─────────────────────────────────────────────────────────
function renderTemplates() {
  const pane = document.getElementById('tmpl-pane');
  if (!pane) return;
  pane.innerHTML = '';

  categories.forEach(cat => {
    const sec = document.createElement('div');
    sec.className = 'tmpl-cat';
    sec.innerHTML = '<div class="tmpl-cat-header">' + cat.icon + ' ' + cat.label + '</div>';
    const grid = document.createElement('div');
    grid.className = 'tmpl-grid';
    cat.templates.forEach(tmpl => {
      const card = document.createElement('div');
      card.className = 'tmpl-card';
      card.innerHTML =
        '<div class="tmpl-name"><span class="tmpl-dot" style="background:' + tmpl.color + '"></span>' + esc(tmpl.name) + '</div>' +
        '<div class="tmpl-desc">' + esc(tmpl.description) + '</div>';
      card.onclick = () => applyTemplate(tmpl);
      grid.appendChild(card);
    });
    sec.appendChild(grid);
    pane.appendChild(sec);
  });
}

function applyTemplate(tmpl) {
  // Switch to form tab
  document.querySelectorAll('.etab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.etab')[1].classList.add('active');
  document.getElementById('tmpl-pane').classList.remove('visible');
  document.getElementById('form-pane').classList.add('visible');

  buildForm({
    id: '',
    name: tmpl.name,
    role: tmpl.category === 'orchestration' ? 'orchestrator' : 'specialist',
    provider: 'vscode-lm',
    model: tmpl.defaultModel,
    systemPrompt: tmpl.systemPrompt,
    color: tmpl.color,
  });
}

// ── Form ──────────────────────────────────────────────────────────────────
function buildForm(agent) {
  const pane = document.getElementById('form-pane');
  if (!pane) return;

  // Build model options from available models
  const modelOptions = models.map(m =>
    '<option value="' + esc(m.name) + '" data-provider="' + m.source + '"' +
    (m.name === agent.model ? ' selected' : '') + '>' +
    esc(m.label) + '</option>'
  ).join('');

  pane.innerHTML = \`
    <div class="field">
      <label>Name</label>
      <input type="text" id="f-name" value="\${esc(agent.name)}" placeholder="e.g. Backend Engineer" />
    </div>
    <div class="row">
      <div class="field">
        <label>Role</label>
        <select id="f-role">
          <option value="specialist" \${agent.role==='specialist'?'selected':''}>Specialist</option>
          <option value="orchestrator" \${agent.role==='orchestrator'?'selected':''}>Orchestrator</option>
        </select>
      </div>
      <div class="field">
        <label>Color</label>
        <div class="color-row">
          <input type="color" id="f-color" value="\${agent.color || '#3b82f6'}" />
          <span id="f-color-hex" style="font-size:11px;opacity:.5">\${agent.color || '#3b82f6'}</span>
        </div>
      </div>
    </div>
    <div class="field">
      <label>Model</label>
      \${models.length > 0
        ? '<select id="f-model">' + modelOptions + '</select>'
        : '<input type="text" id="f-model" value="' + esc(agent.model) + '" placeholder="e.g. Claude Sonnet 4.6" />'
      }
      <div class="model-hint" id="model-hint">
        \${models.length === 0 ? '⟳ Loading available models…' : ''}
      </div>
    </div>
    <div class="field">
      <label>System Prompt</label>
      <textarea id="f-prompt" rows="9">\${esc(agent.systemPrompt)}</textarea>
    </div>
    <div id="form-actions">
      <button class="btn-primary" id="save-btn">Save</button>
      <button class="btn-secondary" id="cancel-btn">Cancel</button>
      <span id="saved-msg">✓ saved</span>
      \${agent.id ? '<button class="btn-danger" id="del-btn">Delete</button>' : ''}
    </div>
  \`;

  // Color picker sync
  document.getElementById('f-color').addEventListener('input', e => {
    document.getElementById('f-color-hex').textContent = e.target.value;
  });

  // Model dropdown → update provider hint
  const modelSel = document.getElementById('f-model');
  if (modelSel && modelSel.tagName === 'SELECT') {
    modelSel.addEventListener('change', () => updateModelHint(modelSel));
    updateModelHint(modelSel);
  }

  document.getElementById('save-btn').onclick = () => {
    const modelEl = document.getElementById('f-model');
    const modelVal = modelEl.value.trim();
    // Find provider from selected option
    let provider = 'vscode-lm';
    if (modelEl.tagName === 'SELECT') {
      const opt = modelEl.options[modelEl.selectedIndex];
      provider = opt.dataset.provider || 'vscode-lm';
    }
    vscode.postMessage({
      type: 'saveAgent',
      agent: {
        id: agent.id || undefined,
        name: document.getElementById('f-name').value.trim(),
        role: document.getElementById('f-role').value,
        provider,
        model: modelVal,
        systemPrompt: document.getElementById('f-prompt').value.trim(),
        color: document.getElementById('f-color').value,
      },
    });
  };

  document.getElementById('cancel-btn').onclick = () => {
    selectedId = null;
    renderList();
    const right = document.getElementById('right');
    right.className = 'empty';
    right.innerHTML = '<div>← select an agent or click + New</div>';
  };

  const delBtn = document.getElementById('del-btn');
  if (delBtn) delBtn.onclick = () => {
    if (confirm('Delete agent "' + agent.name + '"?')) {
      vscode.postMessage({ type: 'deleteAgent', id: agent.id });
      selectedId = null;
      renderList();
      const right = document.getElementById('right');
      right.className = 'empty';
      right.innerHTML = '<div>← select an agent or click + New</div>';
    }
  };
}

function updateModelHint(sel) {
  const hint = document.getElementById('model-hint');
  if (!hint) return;
  const opt = sel.options[sel.selectedIndex];
  if (!opt) return;
  const src = opt.dataset.provider;
  if (src === 'vscode-lm') {
    hint.textContent = '✓ Available via VS Code LM';
    hint.className = 'model-hint ok';
  } else if (src === 'anthropic') {
    hint.textContent = '✓ Direct Anthropic API (key saved)';
    hint.className = 'model-hint ok';
  } else if (src === 'openai') {
    hint.textContent = '✓ Direct OpenAI API (key saved)';
    hint.className = 'model-hint ok';
  } else {
    hint.textContent = '';
    hint.className = 'model-hint';
  }
}

function refreshModelDropdown() {
  // Re-render form if open
  const formPane = document.getElementById('form-pane');
  if (formPane && formPane.classList.contains('visible')) {
    const agentId = selectedId;
    const agent = agents.find(a => a.id === agentId);
    if (agent) buildForm(agent);
  }
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
  }
}
