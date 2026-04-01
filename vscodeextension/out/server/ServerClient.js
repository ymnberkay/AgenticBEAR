"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serverClient = exports.ServerClient = void 0;
class ServerClient {
    constructor(baseUrl = 'http://localhost:3001') {
        this.baseUrl = baseUrl;
    }
    async isRunning() {
        try {
            const res = await fetch(`${this.baseUrl}/api/health`, { signal: AbortSignal.timeout(2000) });
            return res.ok;
        }
        catch {
            return false;
        }
    }
    async getProjects() {
        const res = await fetch(`${this.baseUrl}/api/projects`);
        if (!res.ok)
            throw new Error(`Server error: ${res.status}`);
        return res.json();
    }
    async getAgents(projectId) {
        const res = await fetch(`${this.baseUrl}/api/projects/${projectId}/agents`);
        if (!res.ok)
            throw new Error(`Server error: ${res.status}`);
        return res.json();
    }
    // Convert server agent format → extension Agent format
    toExtensionAgent(sa) {
        return {
            id: sa.id,
            name: sa.name,
            role: sa.role,
            provider: 'vscode-lm',
            model: sa.modelConfig?.model ?? 'claude-sonnet-4-6',
            systemPrompt: sa.systemPrompt,
            color: sa.color,
        };
    }
}
exports.ServerClient = ServerClient;
exports.serverClient = new ServerClient();
//# sourceMappingURL=ServerClient.js.map