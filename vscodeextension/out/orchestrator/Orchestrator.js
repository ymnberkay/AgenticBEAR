"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Orchestrator = void 0;
const FileTools_1 = require("../tools/FileTools");
const AgentStore_1 = require("../agents/AgentStore");
// ── XML tool call format ──────────────────────────────────────────────────
// We use text-based tool calling so it works with ALL models (Copilot, Claude, GPT)
// Model outputs: <tool_call>{"tool":"create_file","path":"...","content":"..."}</tool_call>
const TOOL_SYSTEM_SUFFIX = `

You have access to file tools. To use a tool, output a tool call block like this:

<tool_call>{"tool":"list_files","directory":"."}</tool_call>
<tool_call>{"tool":"read_file","path":"src/main.ts"}</tool_call>
<tool_call>{"tool":"create_file","path":"src/hello.ts","content":"// file content here"}</tool_call>
<tool_call>{"tool":"write_file","path":"src/existing.ts","content":"// updated content"}</tool_call>

Rules:
- ALWAYS start by listing and reading relevant files to understand the project
- Use create_file for new files, write_file for existing files
- Write COMPLETE file content — never use placeholders or "..."
- You can call multiple tools in sequence
- After all tools are done, write a brief summary of what you did
`;
function parseToolCalls(text) {
    const calls = [];
    const regex = /<tool_call>([\s\S]*?)<\/tool_call>/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        try {
            const parsed = JSON.parse(match[1].trim());
            calls.push(parsed);
        }
        catch { /* skip malformed */ }
    }
    return calls;
}
function stripToolCalls(text) {
    return text.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim();
}
class Orchestrator {
    constructor(lm) {
        this.lm = lm;
    }
    async run(userTask, onEvent, token) {
        const fileTools = new FileTools_1.FileTools();
        const agents = await AgentStore_1.agentStore.load();
        const orchestratorAgent = agents.find(a => a.role === 'orchestrator');
        const specialists = agents.filter(a => a.role === 'specialist');
        if (!orchestratorAgent) {
            onEvent({ type: 'error', message: 'No orchestrator agent found. Add one via Manage Agents.' });
            return;
        }
        // ── Step 1: Explore workspace ─────────────────────────────────────────
        let workspaceContext = 'No workspace open — file tools disabled.';
        if (fileTools.hasWorkspace) {
            try {
                const listing = await fileTools.execute('list_files', { directory: '.' });
                workspaceContext = `Workspace root files:\n${listing.output}`;
            }
            catch {
                workspaceContext = 'Could not list workspace.';
            }
        }
        // ── Step 2: Orchestrator makes a plan ─────────────────────────────────
        const availableAgents = specialists
            .map(a => `- id: "${a.id}", name: "${a.name}"`)
            .join('\n');
        const planMessages = [
            {
                role: 'user',
                content: `WORKSPACE:\n${workspaceContext}\n\n` +
                    `AVAILABLE AGENTS:\n${availableAgents}\n\n` +
                    `TASK:\n${userTask}\n\n` +
                    `Return ONLY valid JSON, no other text:\n` +
                    `{"summary":"...","steps":[{"agentId":"...","agentName":"...","task":"..."}]}`,
            },
        ];
        let planText = '';
        try {
            const res = await this.lm.send(orchestratorAgent, planMessages, [], token, chunk => { planText += chunk; });
            planText = res.text || planText;
        }
        catch (err) {
            onEvent({ type: 'error', message: `Orchestrator LM error: ${err}` });
            return;
        }
        const plan = this.parsePlan(planText, specialists);
        onEvent({ type: 'plan', plan });
        // ── Step 3: Run each step ─────────────────────────────────────────────
        const results = [];
        const contextSummary = [];
        for (let i = 0; i < plan.steps.length; i++) {
            if (token.isCancellationRequested)
                break;
            const step = plan.steps[i];
            onEvent({ type: 'step_start', step, index: i, total: plan.steps.length });
            const agent = specialists.find(a => a.id === step.agentId);
            if (!agent) {
                onEvent({ type: 'error', message: `Agent not found: ${step.agentId}` });
                continue;
            }
            const result = await this.runStep(agent, step.task, contextSummary.join('\n'), fileTools, token, onEvent);
            results.push(result);
            contextSummary.push(`${agent.name} completed: ${step.task}\n` +
                `Created: ${result.filesCreated.join(', ') || 'none'}\n` +
                `Modified: ${result.filesModified.join(', ') || 'none'}`);
            onEvent({ type: 'step_done', result });
        }
        onEvent({ type: 'done', results });
    }
    async runStep(agent, task, previousContext, fileTools, token, onEvent) {
        fileTools.reset();
        // Inject tool instructions into agent's system prompt
        const agentWithTools = {
            ...agent,
            systemPrompt: agent.systemPrompt + TOOL_SYSTEM_SUFFIX,
        };
        const messages = [
            {
                role: 'user',
                content: (previousContext ? `PREVIOUS WORK:\n${previousContext}\n\n` : '') +
                    `YOUR TASK:\n${task}\n\n` +
                    `Start by listing and reading relevant files, then make the changes.`,
            },
        ];
        const MAX_ROUNDS = 15;
        let round = 0;
        let finalText = '';
        while (round < MAX_ROUNDS) {
            if (token.isCancellationRequested)
                break;
            round++;
            let roundText = '';
            try {
                const res = await this.lm.send(agentWithTools, messages, [], token, chunk => {
                    roundText += chunk;
                    // Stream visible text (without tool call blocks) to chat
                    const visible = stripToolCalls(chunk);
                    if (visible)
                        onEvent({ type: 'chunk', agentName: agent.name, text: visible });
                });
                roundText = res.text || roundText;
            }
            catch (err) {
                onEvent({ type: 'error', message: `${agent.name} error: ${err}` });
                break;
            }
            const toolCalls = parseToolCalls(roundText);
            if (toolCalls.length === 0) {
                // No tool calls → agent is done
                finalText = stripToolCalls(roundText);
                break;
            }
            // Execute each tool call
            const toolResults = [];
            for (const tc of toolCalls) {
                onEvent({ type: 'tool_call', toolName: tc.tool, path: tc.path ?? tc.directory });
                const result = await fileTools.execute(tc.tool, tc);
                toolResults.push(`[${tc.tool}: ${tc.path ?? tc.directory ?? ''}]\n${result.output}`);
            }
            // Feed results back for next round
            messages.push({ role: 'assistant', content: roundText });
            messages.push({ role: 'user', content: `Tool results:\n${toolResults.join('\n\n')}\n\nContinue with the task.` });
        }
        return {
            agentName: agent.name,
            task,
            filesCreated: [...fileTools.filesCreated],
            filesModified: [...fileTools.filesModified],
            output: finalText,
        };
    }
    parsePlan(text, specialists) {
        try {
            const match = text.match(/\{[\s\S]*\}/);
            if (!match)
                throw new Error('no JSON');
            const raw = JSON.parse(match[0]);
            return {
                summary: raw.summary ?? 'Task',
                steps: (raw.steps ?? []).map(s => ({
                    agentId: s.agentId,
                    agentName: s.agentName ?? specialists.find(a => a.id === s.agentId)?.name ?? s.agentId,
                    task: s.task,
                })),
            };
        }
        catch {
            const fallback = specialists[0];
            return {
                summary: 'Executing task',
                steps: fallback
                    ? [{ agentId: fallback.id, agentName: fallback.name, task: text.slice(0, 300) }]
                    : [],
            };
        }
    }
}
exports.Orchestrator = Orchestrator;
//# sourceMappingURL=Orchestrator.js.map