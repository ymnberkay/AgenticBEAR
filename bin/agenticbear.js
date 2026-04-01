#!/usr/bin/env node
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { execSync, spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const serverBundle = resolve(root, 'dist/server.js');
const clientDist = resolve(root, 'dist/public');

const port = process.env.PORT || '3001';

// Build if not already built
if (!existsSync(serverBundle) || !existsSync(clientDist)) {
  console.log('AgenticBEAR: Building for first run...');
  console.log('(This only happens once)\n');
  try {
    execSync('npm run build', { cwd: root, stdio: 'inherit' });
  } catch {
    console.error('Build failed. Please check the error above.');
    process.exit(1);
  }
}

console.log('');
console.log('  AgenticBEAR starting...');
console.log('');
console.log(`  UI  →  http://localhost:${port}`);
console.log(`  MCP →  http://localhost:${port}/mcp/projects/{your-project-id}`);
console.log('');
console.log('  To connect Claude Code CLI:');
console.log(`  claude mcp add agenticbear --transport sse http://localhost:${port}/mcp/projects/{id}`);
console.log('');

const server = spawn('node', [serverBundle], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production', PORT: port },
});

server.on('exit', (code) => process.exit(code ?? 0));

process.on('SIGINT', () => server.kill('SIGINT'));
process.on('SIGTERM', () => server.kill('SIGTERM'));
