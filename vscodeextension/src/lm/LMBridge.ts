import * as vscode from 'vscode';
import type { Agent, Message } from '../types';

export interface LMResponse {
  text: string;
  toolCalls: ToolCallPart[];
}

export interface ToolCallPart {
  name: string;
  input: Record<string, unknown>;
}

export interface ModelStatus {
  available: boolean;
  displayName: string;
  reason?: string;
}

export interface AvailableModel {
  id: string;          // vscode model id
  name: string;        // display name e.g. "Claude Sonnet 4.6"
  vendor: string;      // "anthropic", "copilot", etc.
  family: string;      // family hint
  source: 'vscode-lm' | 'anthropic' | 'openai';
  label: string;       // shown in UI: "Claude Sonnet 4.6 — Anthropic (Copilot)"
}

// Normalize for fuzzy matching: "claude-sonnet-4-6" == "Claude Sonnet 4.6"
function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\-_.]/g, '').replace(/[^a-z0-9]/g, '');
}

export class LMBridge {
  constructor(private secrets: vscode.SecretStorage) {}

  // ── List ALL available models across providers ────────────────────────────

  async listAvailableModels(): Promise<AvailableModel[]> {
    const results: AvailableModel[] = [];

    // VS Code LM models (Copilot + Claude extension)
    try {
      const models = await vscode.lm.selectChatModels({});
      for (const m of models) {
        results.push({
          id: m.id,
          name: m.name,
          vendor: m.vendor,
          family: m.family,
          source: 'vscode-lm',
          label: `${m.name}  —  ${m.vendor} (via VS Code LM)`,
        });
      }
    } catch { /* no LM provider installed */ }

    // Anthropic direct (only show if key is set)
    const anthropicKey = await this.secrets.get('agenticbear.anthropicKey');
    if (anthropicKey) {
      for (const model of ANTHROPIC_MODELS) {
        results.push({ ...model, source: 'anthropic', label: `${model.name}  —  Anthropic (direct API)` });
      }
    }

    // OpenAI direct (only show if key is set)
    const openaiKey = await this.secrets.get('agenticbear.openaiKey');
    if (openaiKey) {
      for (const model of OPENAI_MODELS) {
        results.push({ ...model, source: 'openai', label: `${model.name}  —  OpenAI (direct API)` });
      }
    }

    return results;
  }

  // ── Check a specific agent's model ───────────────────────────────────────

  async checkModel(agent: Agent): Promise<ModelStatus> {
    if (agent.provider === 'vscode-lm') {
      const resolved = await this.resolveVscodeLmModel(agent.model);
      if (!resolved) {
        const all = await vscode.lm.selectChatModels({});
        const names = all.map(m => m.name).join(', ');
        return {
          available: false,
          displayName: agent.model,
          reason: names
            ? `"${agent.model}" not found. Available: ${names}`
            : 'No VS Code LM models found. Install GitHub Copilot or the Claude extension.',
        };
      }
      return { available: true, displayName: `${resolved.name} (${resolved.vendor})` };
    }

    if (agent.provider === 'anthropic') {
      const key = await this.secrets.get('agenticbear.anthropicKey');
      return key
        ? { available: true, displayName: `${agent.model} (Anthropic API)` }
        : { available: false, displayName: agent.model, reason: 'Anthropic API key not set — run: AgenticBEAR: Set API Keys' };
    }

    if (agent.provider === 'openai') {
      const key = await this.secrets.get('agenticbear.openaiKey');
      return key
        ? { available: true, displayName: `${agent.model} (OpenAI API)` }
        : { available: false, displayName: agent.model, reason: 'OpenAI API key not set — run: AgenticBEAR: Set API Keys' };
    }

    return { available: false, displayName: agent.model, reason: 'Unknown provider' };
  }

  // ── Fuzzy resolve VS Code LM model by name/family/id ─────────────────────

  private async resolveVscodeLmModel(modelHint: string): Promise<vscode.LanguageModelChat | undefined> {
    const all = await vscode.lm.selectChatModels({});
    if (all.length === 0) return undefined;

    const hint = normalize(modelHint);

    // 1. Exact family match
    const byFamily = all.find(m => normalize(m.family) === hint);
    if (byFamily) return byFamily;

    // 2. Exact name match
    const byName = all.find(m => normalize(m.name) === hint);
    if (byName) return byName;

    // 3. Exact id match
    const byId = all.find(m => normalize(m.id) === hint);
    if (byId) return byId;

    // 4. Contains match (model hint is substring of name or vice versa)
    const contains = all.find(m =>
      normalize(m.name).includes(hint) || hint.includes(normalize(m.name)) ||
      normalize(m.family).includes(hint) || hint.includes(normalize(m.family)),
    );
    if (contains) return contains;

    return undefined;
  }

  // ── Main send ─────────────────────────────────────────────────────────────

  async send(
    agent: Agent,
    messages: Message[],
    tools: vscode.LanguageModelChatTool[],
    token: vscode.CancellationToken,
    onChunk?: (text: string) => void,
  ): Promise<LMResponse> {
    switch (agent.provider) {
      case 'vscode-lm':  return this.sendVscodeLm(agent, messages, tools, token, onChunk);
      case 'anthropic':  return this.sendAnthropic(agent, messages, token, onChunk);
      case 'openai':     return this.sendOpenAI(agent, messages, token, onChunk);
      default: throw new Error(`Unknown provider: ${agent.provider}`);
    }
  }

  // ── VS Code LM ────────────────────────────────────────────────────────────

  private async sendVscodeLm(
    agent: Agent,
    messages: Message[],
    tools: vscode.LanguageModelChatTool[],
    token: vscode.CancellationToken,
    onChunk?: (text: string) => void,
  ): Promise<LMResponse> {
    const model = await this.resolveVscodeLmModel(agent.model);

    if (!model) {
      const all = await vscode.lm.selectChatModels({});
      if (all.length === 0) {
        throw new Error('No VS Code LM models available. Install GitHub Copilot or the Claude extension.');
      }
      // Fallback to first available
      const fallback = all[0];
      vscode.window.showWarningMessage(`Model "${agent.model}" not found — using "${fallback.name}".`);
      return this.sendWithModel(fallback, agent, messages, tools, token, onChunk);
    }

    return this.sendWithModel(model, agent, messages, tools, token, onChunk);
  }

  private async sendWithModel(
    model: vscode.LanguageModelChat,
    agent: Agent,
    messages: Message[],
    tools: vscode.LanguageModelChatTool[],
    token: vscode.CancellationToken,
    onChunk?: (text: string) => void,
  ): Promise<LMResponse> {
    const lmMessages = [
      vscode.LanguageModelChatMessage.User(`[SYSTEM]\n${agent.systemPrompt}\n[/SYSTEM]`),
      ...messages
        .filter(m => m.role !== 'system')
        .map(m => m.role === 'user'
          ? vscode.LanguageModelChatMessage.User(m.content)
          : vscode.LanguageModelChatMessage.Assistant(m.content),
        ),
    ];

    const response = await model.sendRequest(lmMessages, { tools }, token);

    let text = '';
    const toolCalls: ToolCallPart[] = [];

    for await (const chunk of response.stream) {
      if (chunk instanceof vscode.LanguageModelTextPart) {
        text += chunk.value;
        onChunk?.(chunk.value);
      } else if (chunk instanceof vscode.LanguageModelToolCallPart) {
        toolCalls.push({ name: chunk.name, input: chunk.input as Record<string, unknown> });
      }
    }

    return { text, toolCalls };
  }

  // ── Anthropic direct ──────────────────────────────────────────────────────

  private async sendAnthropic(
    agent: Agent,
    messages: Message[],
    token: vscode.CancellationToken,
    onChunk?: (text: string) => void,
  ): Promise<LMResponse> {
    const apiKey = await this.secrets.get('agenticbear.anthropicKey');
    if (!apiKey) throw new Error('Anthropic API key not set. Run: AgenticBEAR: Set API Keys');

    const controller = new AbortController();
    token.onCancellationRequested(() => controller.abort());

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: agent.model,
        max_tokens: 8192,
        system: agent.systemPrompt,
        stream: true,
        messages: messages
          .filter(m => m.role !== 'system')
          .map(m => ({ role: m.role, content: m.content })),
      }),
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`Anthropic ${response.status}: ${await response.text()}`);

    return this.consumeSSE(response, onChunk,
      data => (data.delta as { text?: string } | undefined)?.text ?? '',
    );
  }

  // ── OpenAI direct ─────────────────────────────────────────────────────────

  private async sendOpenAI(
    agent: Agent,
    messages: Message[],
    token: vscode.CancellationToken,
    onChunk?: (text: string) => void,
  ): Promise<LMResponse> {
    const apiKey = await this.secrets.get('agenticbear.openaiKey');
    if (!apiKey) throw new Error('OpenAI API key not set. Run: AgenticBEAR: Set API Keys');

    const controller = new AbortController();
    token.onCancellationRequested(() => controller.abort());

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: agent.model,
        stream: true,
        messages: [
          { role: 'system', content: agent.systemPrompt },
          ...messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content })),
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`OpenAI ${response.status}: ${await response.text()}`);

    return this.consumeSSE(response, onChunk, data => {
      const choices = data.choices as Array<{ delta?: { content?: string } }> | undefined;
      return choices?.[0]?.delta?.content ?? '';
    });
  }

  // ── SSE reader ────────────────────────────────────────────────────────────

  private async consumeSSE(
    response: Response,
    onChunk: ((t: string) => void) | undefined,
    extract: (data: Record<string, unknown>) => string,
  ): Promise<LMResponse> {
    let text = '';
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of decoder.decode(value).split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6);
        if (raw === '[DONE]') continue;
        try {
          const chunk = extract(JSON.parse(raw) as Record<string, unknown>);
          if (chunk) { text += chunk; onChunk?.(chunk); }
        } catch { /* skip */ }
      }
    }
    return { text, toolCalls: [] };
  }
}

// ── Known direct-API models (shown only when key is set) ──────────────────

const ANTHROPIC_MODELS: Omit<AvailableModel, 'source' | 'label'>[] = [
  { id: 'claude-opus-4-6',     name: 'Claude Opus 4.6',    vendor: 'Anthropic', family: 'claude-opus-4-6' },
  { id: 'claude-sonnet-4-6',   name: 'Claude Sonnet 4.6',  vendor: 'Anthropic', family: 'claude-sonnet-4-6' },
  { id: 'claude-haiku-4-5',    name: 'Claude Haiku 4.5',   vendor: 'Anthropic', family: 'claude-haiku-4-5' },
];

const OPENAI_MODELS: Omit<AvailableModel, 'source' | 'label'>[] = [
  { id: 'gpt-4o',              name: 'GPT-4o',       vendor: 'OpenAI', family: 'gpt-4o' },
  { id: 'gpt-4.1',             name: 'GPT-4.1',      vendor: 'OpenAI', family: 'gpt-4.1' },
  { id: 'gpt-4o-mini',         name: 'GPT-4o mini',  vendor: 'OpenAI', family: 'gpt-4o-mini' },
  { id: 'gpt-5-mini',          name: 'GPT-5 mini',   vendor: 'OpenAI', family: 'gpt-5-mini' },
  { id: 'o3',                  name: 'o3',            vendor: 'OpenAI', family: 'o3' },
  { id: 'codex-1',             name: 'Codex 1',       vendor: 'OpenAI', family: 'codex-1' },
];
