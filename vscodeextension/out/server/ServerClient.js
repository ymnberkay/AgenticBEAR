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
exports.serverClient = exports.ServerClient = void 0;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
function resolveBaseUrl() {
    // 1. Port file written by server on startup
    const portFile = path.resolve(os.homedir(), '.subagent-manager', 'port');
    try {
        const raw = fs.readFileSync(portFile, 'utf8').trim();
        const port = parseInt(raw, 10);
        if (!isNaN(port))
            return `http://localhost:${port}`;
    }
    catch { }
    // 2. VS Code setting override
    const cfg = vscode.workspace.getConfiguration('agenticbear');
    const settingPort = cfg.get('serverPort');
    if (settingPort)
        return `http://localhost:${settingPort}`;
    // 3. Default
    return 'http://localhost:3001';
}
class ServerClient {
    get baseUrl() {
        return resolveBaseUrl();
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