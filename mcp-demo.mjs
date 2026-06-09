// Minimal MCP client demo — connects to AgenticBEAR's SSE MCP server exactly like
// Claude Code CLI / Codex would, lists tools, and calls them. Run: node mcp-demo.mjs
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const PROJECT_ID = process.env.PID || 'oQj8TQk_RuPjy-ViNo_UN';
const URL_ = `http://localhost:3001/mcp/projects/${PROJECT_ID}`;

const text = (r) => (r?.content ?? []).map((c) => c.text ?? '').join('').trim();

const client = new Client({ name: 'demo-cli', version: '0.0.1' }, { capabilities: {} });
await client.connect(new SSEClientTransport(new URL(URL_)));
console.log(`\n✅ connected to MCP: ${URL_}\n`);

// 1) Discover tools (what an MCP CLI sees)
const { tools } = await client.listTools();
console.log('🧰 tools:', tools.map((t) => t.name).join(', '), '\n');

// 2) list_agents
const agents = await client.callTool({ name: 'list_agents', arguments: {} });
console.log('👥 list_agents →\n' + text(agents) + '\n');

// 3) ask_agent — find the "backend" specialist and ask it something tiny
const blob = text(agents);
const m = blob.match(/`([^`]+)`\s*[—-]\s*\*\*backend\*\*/i) || blob.match(/`([A-Za-z0-9_-]{10,})`/);
const agentId = process.env.AGENT_ID || (m && m[1]);
console.log(`🤖 ask_agent (agent_id=${agentId}) …\n`);
const ans = await client.callTool({
  name: 'ask_agent',
  arguments: { agent_id: agentId, query: 'Reply with a one-line Python function that adds two numbers.' },
});
console.log('💬 response →\n' + text(ans) + '\n');

await client.close();
console.log('🔌 closed.\n');
