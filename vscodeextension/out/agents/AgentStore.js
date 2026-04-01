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
exports.agentStore = exports.AgentStore = void 0;
const vscode = __importStar(require("vscode"));
const nanoid_1 = require("../utils/nanoid");
const defaultAgents_1 = require("./defaultAgents");
const ServerClient_1 = require("../server/ServerClient");
const CONFIG_FILE = '.vscode/agenticbear.json';
class AgentStore {
    constructor() {
        this._onDidChange = new vscode.EventEmitter();
        this.onDidChange = this._onDidChange.event;
        // In-memory cache — always valid, even with no workspace
        this._cache = [...defaultAgents_1.DEFAULT_AGENTS];
    }
    get connectedProject() { return this._connectedProject; }
    get agents() { return this._cache; }
    getConfigUri() {
        const ws = vscode.workspace.workspaceFolders?.[0];
        if (!ws)
            return undefined;
        return vscode.Uri.joinPath(ws.uri, CONFIG_FILE);
    }
    // ── Load ─────────────────────────────────────────────────────────────────
    async load() {
        // If synced from server, return cache directly
        if (this._connectedProject)
            return this._cache;
        const uri = this.getConfigUri();
        if (!uri) {
            this._cache = [...defaultAgents_1.DEFAULT_AGENTS];
            return this._cache;
        }
        try {
            const raw = await vscode.workspace.fs.readFile(uri);
            const config = JSON.parse(Buffer.from(raw).toString('utf-8'));
            this._cache = config.agents?.length ? config.agents : [...defaultAgents_1.DEFAULT_AGENTS];
        }
        catch {
            this._cache = [...defaultAgents_1.DEFAULT_AGENTS];
        }
        return this._cache;
    }
    // ── Save (local) ──────────────────────────────────────────────────────────
    async save(agents) {
        this._cache = agents;
        const uri = this.getConfigUri();
        if (uri) {
            const config = { agents };
            await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(config, null, 2), 'utf-8'));
        }
        this._onDidChange.fire();
    }
    async add(agent) {
        const agents = await this.load();
        const newAgent = { ...agent, id: (0, nanoid_1.nanoid)() };
        agents.push(newAgent);
        await this.save(agents);
        return newAgent;
    }
    async remove(id) {
        const agents = await this.load();
        await this.save(agents.filter(a => a.id !== id));
    }
    async update(id, patch) {
        const agents = await this.load();
        const idx = agents.findIndex(a => a.id === id);
        if (idx !== -1) {
            agents[idx] = { ...agents[idx], ...patch };
            await this.save(agents);
        }
    }
    // ── Server sync ───────────────────────────────────────────────────────────
    async syncFromServer(projectId, projectName) {
        const serverAgents = await ServerClient_1.serverClient.getAgents(projectId);
        this._cache = serverAgents.map(a => ServerClient_1.serverClient.toExtensionAgent(a));
        this._connectedProject = { id: projectId, name: projectName };
        this._onDidChange.fire();
    }
    disconnect() {
        this._connectedProject = undefined;
        this._cache = [...defaultAgents_1.DEFAULT_AGENTS];
        this._onDidChange.fire();
    }
    async getOrchestrator() {
        return this._cache.find(a => a.role === 'orchestrator');
    }
    async getSpecialists() {
        return this._cache.filter(a => a.role === 'specialist');
    }
}
exports.AgentStore = AgentStore;
exports.agentStore = new AgentStore();
//# sourceMappingURL=AgentStore.js.map