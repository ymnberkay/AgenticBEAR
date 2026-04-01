import * as vscode from 'vscode';
import * as path from 'path';
import type { ToolResult } from '../types';

export const FILE_TOOL_DEFINITIONS: vscode.LanguageModelChatTool[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file in the workspace',
    inputSchema: {
      type: 'object' as const,
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
      type: 'object' as const,
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
      type: 'object' as const,
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
      type: 'object' as const,
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
      type: 'object' as const,
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

export class FileTools {
  private workspaceRoot: string;
  public filesCreated: string[] = [];
  public filesModified: string[] = [];
  public hasWorkspace: boolean;

  constructor() {
    const ws = vscode.workspace.workspaceFolders?.[0];
    this.hasWorkspace = !!ws;
    this.workspaceRoot = ws?.uri.fsPath ?? '';
  }

  private requireWorkspace(): void {
    if (!this.hasWorkspace) {
      throw new Error('No folder open in VS Code. Open a project folder first (File → Open Folder).');
    }
  }

  reset() {
    this.filesCreated = [];
    this.filesModified = [];
  }

  async execute(toolName: string, input: Record<string, unknown>): Promise<ToolResult> {
    this.requireWorkspace();
    // Support both explicit toolName param and input.tool field (from XML parsing)
    const name = (input.tool as string | undefined) ?? toolName;
    try {
      switch (name) {
        case 'read_file':
          return await this.readFile(input.path as string);
        case 'write_file':
          return await this.writeFile(input.path as string, input.content as string);
        case 'create_file':
          return await this.createFile(input.path as string, input.content as string);
        case 'delete_file':
          return await this.deleteFile(input.path as string);
        case 'list_files':
          return await this.listFiles(input.directory as string);
        default:
          return { toolName: name, output: `Unknown tool: ${name}`, error: true };
      }
    } catch (err) {
      return {
        toolName,
        output: `Error: ${err instanceof Error ? err.message : String(err)}`,
        error: true,
      };
    }
  }

  private resolve(filePath: string): vscode.Uri {
    const normalized = filePath.replace(/^\//, '');
    return vscode.Uri.file(path.join(this.workspaceRoot, normalized));
  }

  private async readFile(filePath: string): Promise<ToolResult> {
    const uri = this.resolve(filePath);
    const raw = await vscode.workspace.fs.readFile(uri);
    const content = Buffer.from(raw).toString('utf-8');
    return { toolName: 'read_file', output: content };
  }

  private async writeFile(filePath: string, content: string): Promise<ToolResult> {
    const uri = this.resolve(filePath);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
    this.filesModified.push(filePath);
    return { toolName: 'write_file', output: `Updated: ${filePath}` };
  }

  private async createFile(filePath: string, content: string): Promise<ToolResult> {
    const uri = this.resolve(filePath);

    // Ensure directory exists
    const dirUri = vscode.Uri.file(path.dirname(uri.fsPath));
    await vscode.workspace.fs.createDirectory(dirUri);

    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
    this.filesCreated.push(filePath);
    return { toolName: 'create_file', output: `Created: ${filePath}` };
  }

  private async deleteFile(filePath: string): Promise<ToolResult> {
    const uri = this.resolve(filePath);
    await vscode.workspace.fs.delete(uri);
    return { toolName: 'delete_file', output: `Deleted: ${filePath}` };
  }

  private async listFiles(directory: string): Promise<ToolResult> {
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
