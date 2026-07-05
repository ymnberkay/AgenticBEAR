/**
 * Agent roles:
 *   orchestrator → routes work to specialists
 *   specialist   → performs work, may use tools
 *   external     → HTTP proxy to a team-built endpoint (image processor, RAG service, …).
 *                  Does NOT participate in delegation trees; only user-selectable in chat.
 */
export type AgentRole = 'orchestrator' | 'specialist' | 'external';

/** How we authenticate against an external agent endpoint. */
export type ExternalAgentAuthType = 'none' | 'bearer' | 'header';

/** Wire-shape the external endpoint expects. v1: OpenAI /chat/completions only. */
export type ExternalAgentPayloadShape = 'openai';

/** Fields attached to an agent when role === 'external'. Ignored for the other roles. */
export interface ExternalAgentConfig {
  endpointUrl: string;
  authType: ExternalAgentAuthType;
  /** Header name to send the secret under when authType='header'. Ignored otherwise. */
  headerName: string;
  /** Whether an auth secret is stored (the actual token is never returned). */
  hasSecret: boolean;
  /** String we send as the OpenAI `model` field. Empty → use agent.name. */
  defaultModel: string;
  /** True → composer allows image attachments (OpenAI image_url shape). */
  supportsImages: boolean;
  /** True → composer allows audio attachments (mic recording / audio files, OpenAI input_audio shape). */
  supportsAudio: boolean;
  /** True → composer allows video attachments (video files, OpenAI video_url shape). */
  supportsVideo: boolean;
  /** True → we parse SSE frames; false → wait for a JSON body. */
  supportsStreaming: boolean;
  payloadShape: ExternalAgentPayloadShape;
}

/**
 * Model identifier. Historically a fixed union of Anthropic/OpenAI ids; now a free
 * string so users can register arbitrary models from custom providers (DeepSeek,
 * local Ollama/LM Studio, …). Built-in ids still live in CLAUDE_MODELS / MODEL_GROUPS.
 */
export type ClaudeModel = string;

/** Well-known built-in model ids (documents the built-in pricing table / defaults). */
export type KnownClaudeModel =
  | 'claude-opus-4-6'
  | 'claude-sonnet-4-6'
  | 'claude-haiku-4-5-20251001'
  | 'claude-opus-4-5-20251101'
  | 'claude-sonnet-4-5-20250929'
  | 'claude-opus-4-1-20250805'
  | 'claude-opus-4-20250514'
  | 'claude-sonnet-4-20250514'
  | 'claude-3-haiku-20240307'
  | 'gpt-4o'
  | 'gpt-4.1'
  | 'gpt-4o-mini'
  | 'gpt-5-mini'
  | 'o3'
  | 'o3-mini'
  | 'o1'
  | 'codex-1';

export interface ModelConfig {
  model: ClaudeModel;
  /**
   * Which provider serves this model. Absent/null → a built-in provider, resolved from the
   * model id. Sent as `null` (not omitted) when switching back to a built-in so a stale custom
   * providerId is cleared on update instead of being kept by the merge.
   */
  providerId?: string | null;
  maxTokens: number;
  temperature: number;
  topP?: number;
  stopSequences?: string[];
}

export interface AgentPermissions {
  canReadFiles: boolean;
  canWriteFiles: boolean;
  canCreateFiles: boolean;
  canDeleteFiles: boolean;
  allowedPaths: string[];
  deniedPaths: string[];
}

export interface Agent {
  id: string;
  projectId: string;
  role: AgentRole;
  name: string;
  slug: string;
  description: string;
  systemPrompt: string;
  modelConfig: ModelConfig;
  permissions: AgentPermissions;
  templateId: string | null;
  color: string;
  icon: string;
  /** Canvas coordinates for a visual agent graph (optional). */
  xAxis?: number | null;
  yAxis?: number | null;
  /** Present only for role='external'. Absent (undefined) for orchestrator/specialist. */
  external?: ExternalAgentConfig;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentInput {
  projectId: string;
  role: AgentRole;
  name: string;
  description?: string;
  systemPrompt: string;
  modelConfig: ModelConfig;
  permissions?: Partial<AgentPermissions>;
  templateId?: string;
  color?: string;
  icon?: string;
  xAxis?: number | null;
  yAxis?: number | null;
  /** Required when role === 'external'. `secret` is stored and returned as hasSecret only. */
  external?: Partial<ExternalAgentConfig> & { secret?: string };
}

export interface UpdateAgentInput {
  name?: string;
  description?: string;
  systemPrompt?: string;
  modelConfig?: Partial<ModelConfig>;
  permissions?: Partial<AgentPermissions>;
  color?: string;
  icon?: string;
  xAxis?: number | null;
  yAxis?: number | null;
  /** Only meaningful for external agents. Send `secret: ''` to clear it, omit to keep. */
  external?: Partial<ExternalAgentConfig> & { secret?: string };
}
