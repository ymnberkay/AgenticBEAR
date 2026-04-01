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
exports.FileTools = exports.FILE_TOOL_DEFINITIONS = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
exports.FILE_TOOL_DEFINITIONS = [
    {
        name: 'read_file',
        description: 'Read the contents of a file in the workspace',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'File path relative to workspace root' },
            },
            required: ['path'],
        },
    },
    {
        name: 'write_file',
        description: 'Write content to an existing file (overwrites)',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'File path relative to workspace root' },
                content: { type: 'string', description: 'Full file content to write' },
            },
            required: ['path', 'content'],
        },
    },
    {
        name: 'create_file',
        description: 'Create a new file with the given content',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'File path relative to workspace root' },
                content: { type: 'string', description: 'Full file content' },
            },
            required: ['path', 'content'],
        },
    },
    {
        name: 'delete_file',
        description: 'Delete a file from the workspace',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'File path relative to workspace root' },
            },
            required: ['path'],
        },
    },
    {
        name: 'list_files',
        description: 'List files and directories in a directory',
        inputSchema: {
            type: 'object',
            properties: {
                directory: {
                    type: 'string',
                    description: 'Directory path relative to workspace root (use "." for root)',
                },
            },
            required: ['directory'],
        },
    },
];
class FileTools {
    constructor() {
        this.filesCreated = [];
        this.filesModified = [];
        const ws = vscode.workspace.workspaceFolders?.[0];
        this.hasWorkspace = !!ws;
        this.workspaceRoot = ws?.uri.fsPath ?? '';
    }
    requireWorkspace() {
        if (!this.hasWorkspace) {
            throw new Error('No folder open in VS Code. Open a project folder first (File → Open Folder).');
        }
    }
    reset() {
        this.filesCreated = [];
        this.filesModified = [];
    }
    async execute(toolName, input) {
        this.requireWorkspace();
        // Support both explicit toolName param and input.tool field (from XML parsing)
        const name = input.tool ?? toolName;
        try {
            switch (name) {
                case 'read_file':
                    return await this.readFile(input.path);
                case 'write_file':
                    return await this.writeFile(input.path, input.content);
                case 'create_file':
                    return await this.createFile(input.path, input.content);
                case 'delete_file':
                    return await this.deleteFile(input.path);
                case 'list_files':
                    return await this.listFiles(input.directory);
                default:
                    return { toolName: name, output: `Unknown tool: ${name}`, error: true };
            }
        }
        catch (err) {
            return {
                toolName,
                output: `Error: ${err instanceof Error ? err.message : String(err)}`,
                error: true,
            };
        }
    }
    resolve(filePath) {
        const normalized = filePath.replace(/^\//, '');
        return vscode.Uri.file(path.join(this.workspaceRoot, normalized));
    }
    async readFile(filePath) {
        const uri = this.resolve(filePath);
        const raw = await vscode.workspace.fs.readFile(uri);
        const content = Buffer.from(raw).toString('utf-8');
        return { toolName: 'read_file', output: content };
    }
    async writeFile(filePath, content) {
        const uri = this.resolve(filePath);
        await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
        this.filesModified.push(filePath);
        return { toolName: 'write_file', output: `Updated: ${filePath}` };
    }
    async createFile(filePath, content) {
        const uri = this.resolve(filePath);
        // Ensure directory exists
        const dirUri = vscode.Uri.file(path.dirname(uri.fsPath));
        await vscode.workspace.fs.createDirectory(dirUri);
        await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
        this.filesCreated.push(filePath);
        return { toolName: 'create_file', output: `Created: ${filePath}` };
    }
    async deleteFile(filePath) {
        const uri = this.resolve(filePath);
        await vscode.workspace.fs.delete(uri);
        return { toolName: 'delete_file', output: `Deleted: ${filePath}` };
    }
    async listFiles(directory) {
        const uri = this.resolve(directory === '.' ? '' : directory);
        const entries = await vscode.workspace.fs.readDirectory(uri);
        const lines = entries
            .map(([name, type]) => {
            const indicator = type === vscode.FileType.Directory ? '/' : '';
            return `${name}${indicator}`;
        })
            .join('\n');
        return { toolName: 'list_files', output: lines || '(empty directory)' };
    }
}
exports.FileTools = FileTools;
//# sourceMappingURL=FileTools.js.map