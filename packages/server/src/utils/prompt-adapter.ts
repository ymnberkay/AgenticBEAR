import type { Agent } from '@subagent/shared';

type ModelFamily = 'reasoning' | 'haiku' | 'opus' | 'standard';

function getModelFamily(model: string): ModelFamily {
  // o-series reasoning models — minimal prompt, no step-by-step guidance
  if (/^o\d/.test(model)) return 'reasoning';
  // Claude Haiku or GPT-4o-mini — compact, fast models
  if (model.includes('haiku') || model === 'gpt-4o-mini') return 'haiku';
  // Claude Opus — most powerful, handles rich context
  if (model.includes('opus')) return 'opus';
  // claude-sonnet, gpt-4o, etc. — standard
  return 'standard';
}

/** File structure guidance — versioned by verbosity */
const FILE_STRUCTURE_FULL =
  `## File Structure Standards\n` +
  `Always follow modern, professional project structure:\n` +
  `- Organize by **feature/domain**, not by file type (e.g. \`features/auth/\` not separate \`controllers/\` + \`models/\` folders)\n` +
  `- Co-locate related files: component, styles, types, and tests in the same folder\n` +
  `- Use \`index.ts\` barrel exports for clean imports\n` +
  `- Standard separation: \`components/\`, \`hooks/\`, \`services/\`, \`types/\`, \`utils/\`, \`lib/\`\n` +
  `- Source code under \`src/\`, config and tooling at root\n` +
  `- Tests next to source (\`*.test.ts\`) or in \`__tests__/\` within the same feature\n` +
  `- Detect the tech stack and follow its conventions (Next.js App Router, NestJS modules, etc.)\n` +
  `- Never dump everything in a flat root directory\n\n`;

const FILE_STRUCTURE_BRIEF =
  `## File Structure\n` +
  `Follow feature/domain organization. Use \`src/\`, barrel exports, co-locate related files.\n\n`;

/** Execution rules — versioned by verbosity */
const EXECUTION_RULES_FULL =
  `## Execution Rules\n` +
  `Do not output code as text. Actually execute the task:\n` +
  `- Create new files with the Write tool\n` +
  `- Modify existing files with the Edit tool\n` +
  `- Write every file the task requires\n` +
  `Your output must be real file changes, not code blocks in a response.`;

const EXECUTION_RULES_BRIEF =
  `## Execution Rules\n` +
  `Use Write/Edit tools to create or modify files. No code blocks in response — real file changes only.`;

/**
 * Builds the agent context block sent to Claude Code CLI via MCP.
 * Prompt verbosity is adapted based on the agent's configured model.
 *
 * - reasoning (o1/o3): Minimal — role + task only. No step-by-step guidance.
 * - haiku / gpt-4o-mini: Brief — shorter instructions to save tokens.
 * - opus: Full + extended context hint.
 * - standard (sonnet/gpt-4o): Full instructions.
 */
export function buildAgentContextBlock(agent: Agent, query: string, context?: string): string {
  const family = getModelFamily(agent.modelConfig.model);
  const userContent = context ? `${context}\n\n${query}` : query;

  const header =
    `<agent_instructions>\n` +
    `Sen şu anda "${agent.name}" rolündesin.\n` +
    (agent.description ? `Rol açıklaması: ${agent.description}\n` : '') +
    `\nSistem talimatların:\n${agent.systemPrompt}\n` +
    `</agent_instructions>\n\n` +
    `## Task\n${userContent}\n\n`;

  if (family === 'reasoning') {
    // o-series models reason internally — don't micromanage them
    return (
      header +
      `## Instructions\n` +
      `Use Write and Edit tools to apply file changes. Do not output code as text.`
    );
  }

  if (family === 'haiku') {
    return header + FILE_STRUCTURE_BRIEF + EXECUTION_RULES_BRIEF;
  }

  if (family === 'opus') {
    return (
      header +
      FILE_STRUCTURE_FULL +
      EXECUTION_RULES_FULL + `\n\n` +
      `## Quality Bar\n` +
      `You are working with the most capable model — deliver production-quality code with proper error handling, types, and edge cases covered.`
    );
  }

  // standard — sonnet, gpt-4o
  return header + FILE_STRUCTURE_FULL + EXECUTION_RULES_FULL;
}

/**
 * Builds the orchestration prompt sent to Claude Code CLI via MCP.
 * Reasoning models get a concise directive; others get full orchestration instructions.
 */
export function buildOrchestratorPrompt(
  orchestrator: Agent,
  userContent: string,
  agentList: string,
  docInstruction: string,
): string {
  const family = getModelFamily(orchestrator.modelConfig.model);

  const header =
    `<agent_instructions>\n` +
    `Sen şu anda "${orchestrator.name}" rolündesin — bu proje için ana orkestratörsün.\n` +
    (orchestrator.description ? `Rol: ${orchestrator.description}\n` : '') +
    `\nSistem talimatların:\n${orchestrator.systemPrompt}\n` +
    `</agent_instructions>\n\n` +
    `## Görev\n${userContent}\n\n` +
    `## Mevcut Specialist Agentlar\n${agentList}\n\n`;

  if (family === 'reasoning') {
    return (
      header +
      `## Talimat\n` +
      `Görevi yukarıdaki agentlara böl ve her biri için \`ask_agent\` çağır. ` +
      `Bağımlı görevleri sırayla, bağımsızları paralel yönet.` +
      docInstruction
    );
  }

  const orchestrationSteps =
    `## Orchestration Talimatları\n` +
    `Orkestratör olarak bu görevi execute et:\n\n` +
    `1. Görevi yukarıdaki agentlara uygun **somut alt görevlere** böl\n` +
    `2. Her alt görev için \`ask_agent\` tool'unu çağır:\n` +
    `   - \`agent_id\`: İlgili agent'ın ID'si\n` +
    `   - \`query\`: O agent'a özgü, net görev tanımı\n` +
    `   - \`context\`: Önceki agent çıktıları (bağımlılık varsa)\n` +
    `3. Bağımlı görevleri sırayla yap — bir agent'ın çıktısı diğerinin girdisi olabilir\n` +
    `4. Bağımsız görevleri paralel düşünebilirsin ama her \`ask_agent\` çağrısını kendin yanıtla` +
    docInstruction + `\n\n`;

  const fileStructure =
    family === 'haiku'
      ? `## File Structure\nFeature/domain organization, \`src/\`, barrel exports.\n\n`
      : `## File Structure Standards\n` +
        `Enforce professional project structure across all agents:\n` +
        `- Organize by feature/domain, not by file type\n` +
        `- Co-locate related files (component + styles + types + tests in one folder)\n` +
        `- Use index.ts barrel exports\n` +
        `- Detect and follow the tech stack conventions (Next.js App Router, NestJS, etc.)\n` +
        `- Source code under src/, config at root\n` +
        `- Never use a flat file structure\n\n`;

  const executionRules =
    family === 'haiku'
      ? `## Execution Rules\nAll agents must use Write/Edit tools — real file changes, not text output.\n\n`
      : `## Execution Rules\n` +
        `Each agent task must produce real file changes — not text output:\n` +
        `- Use Write/Edit tools to create or modify files directly\n` +
        `- Write every file the task requires\n` +
        `- Note which files were written after each step\n\n`;

  return header + orchestrationSteps + fileStructure + executionRules + `Plan first, then execute step by step.`;
}

/**
 * Adapts the task context message for direct agent-runner execution.
 * Reasoning models get minimal scaffolding; others get full context.
 */
export function buildTaskContextMessage(params: {
  model: string;
  taskTitle: string;
  taskDescription: string;
  dependencyOutputs: { taskTitle: string; output: string }[];
  relevantFiles: { path: string; content: string }[];
  workspacePath: string;
}): string {
  const family = getModelFamily(params.model);
  const { taskTitle, taskDescription, dependencyOutputs, relevantFiles, workspacePath } = params;

  let msg = `## Task\n**${taskTitle}**\n\n${taskDescription}\n`;

  if (dependencyOutputs.length > 0) {
    msg += '\n## Outputs from Previous Tasks\n';
    for (const dep of dependencyOutputs) {
      msg += `\n### ${dep.taskTitle}\n${dep.output}\n`;
    }
  }

  if (relevantFiles.length > 0) {
    msg += '\n## Relevant Files\n';
    for (const file of relevantFiles) {
      msg += `\n### ${file.path}\n\`\`\`\n${file.content}\n\`\`\`\n`;
    }
  }

  msg += `\n## Workspace Path\n${workspacePath}\n`;

  if (family === 'reasoning') {
    msg += '\n## Instructions\nComplete the task. Apply changes directly.';
  } else if (family === 'haiku') {
    msg += '\n## Instructions\nComplete the task. Provide structured, concise output.';
  } else if (family === 'opus') {
    msg +=
      '\n## Instructions\nComplete the task with production-quality output. ' +
      'Cover error handling, edge cases, and types. Provide clear, structured response.';
  } else {
    msg +=
      '\n## Instructions\nComplete the task. Provide clear, structured response. ' +
      'If the task involves writing code, provide the complete code. ' +
      'If the task involves analysis, provide detailed findings.';
  }

  return msg;
}
