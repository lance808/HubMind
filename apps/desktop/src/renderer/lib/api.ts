/**
 * API 服务层 - 渲染进程通过 IPC 调用主进程服务
 *
 * 通过 preload 暴露的 invoke 方法调用主进程的 IPC 处理器
 */

import type {
  Conversation,
  Message,
  ModelConfig,
  AgentConfig,
  Workflow,
  TokenUsage,
  LLMRequest,
  ModelParams,
  StreamChunk,
  AdapterResponse,
  ValidationResult,
} from '@hubmind/shared'

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> =>
  window.electronAPI.invoke(channel, ...args) as Promise<T>

export const api = {
  // ============ 对话 ============
  conversations: {
    list: () => invoke<Conversation[]>('storage:conversation:list'),
    get: (id: string) => invoke<Conversation | null>('storage:conversation:get', id),
    save: (conv: Conversation) => invoke<boolean>('storage:conversation:save', conv),
    delete: (id: string) => invoke<boolean>('storage:conversation:delete', id),
  },

  // ============ 消息 ============
  messages: {
    list: (conversationId: string) => invoke<Message[]>('storage:message:list', conversationId),
    save: (msg: Message, conversationId: string) =>
      invoke<boolean>('storage:message:save', msg, conversationId),
    delete: (conversationId: string) =>
      invoke<boolean>('storage:message:delete', conversationId),
  },

  // ============ 模型配置 ============
  models: {
    list: () => invoke<ModelConfig[]>('storage:model:list'),
    get: (id: string) => invoke<ModelConfig | null>('storage:model:get', id),
    save: (config: ModelConfig) => invoke<boolean>('storage:model:save', config),
    delete: (id: string) => invoke<boolean>('storage:model:delete', id),
  },

  // ============ Agent ============
  agents: {
    list: () => invoke<AgentConfig[]>('storage:agent:list'),
    get: (id: string) => invoke<AgentConfig | null>('storage:agent:get', id),
    save: (config: AgentConfig) => invoke<boolean>('storage:agent:save', config),
    delete: (id: string) => invoke<boolean>('storage:agent:delete', id),
    /** 运行 Agent ReAct 循环 */
    run: (config: AgentConfig, message: string) =>
      invoke<{ success: boolean; content?: string; error?: string; steps?: number }>('agent:run', config, message),
  },

  // ============ 工作流 ============
  workflows: {
    list: () => invoke<Workflow[]>('storage:workflow:list'),
    get: (id: string) => invoke<Workflow | null>('storage:workflow:get', id),
    save: (wf: Workflow) => invoke<boolean>('storage:workflow:save', wf),
    delete: (id: string) => invoke<boolean>('storage:workflow:delete', id),
  },

  // ============ 用量 ============
  usage: {
    log: (modelConfigId: string, usage: TokenUsage) =>
      invoke<boolean>('storage:usage:log', modelConfigId, usage),
    daily: (date: string) => invoke<TokenUsage>('storage:usage:daily', date),
    monthly: (yearMonth: string) => invoke<TokenUsage>('storage:usage:monthly', yearMonth),
  },

  // ============ LLM ============
  llm: {
    chat: (config: ModelConfig, params: ModelParams, request: LLMRequest) =>
      invoke<AdapterResponse>('llm:chat', config, params, request),

    /** 流式聊天 - 通过主进程推送的 chunk 事件接收 */
    chatStream: async (
      config: ModelConfig,
      params: ModelParams,
      request: LLMRequest,
      onChunk: (chunk: StreamChunk) => void,
      onError: (error: string) => void,
    ): Promise<void> => {
      const chunkWrapper: (...args: unknown[]) => void = (chunk: unknown) =>
        onChunk(chunk as StreamChunk)
      const errorWrapper: (...args: unknown[]) => void = (error: unknown) =>
        onError(error as string)

      window.electronAPI.on('llm:streamChunk', chunkWrapper)
      window.electronAPI.on('llm:streamError', errorWrapper)

      try {
        await invoke('llm:chatStream', config, params, request)
      } finally {
        window.electronAPI.off('llm:streamChunk', chunkWrapper)
        window.electronAPI.off('llm:streamError', errorWrapper)
      }
    },

    validate: (config: ModelConfig) => invoke<ValidationResult>('llm:validate', config),
  },

  // ============ Agent 工具 ============
  agent: {
    /** 执行 Agent 工具调用（主进程执行，带安全检查） */
    executeTool: (toolName: string, args: Record<string, unknown>) =>
      invoke<{ success: boolean; result: string; error?: string }>('agent:tool:execute', toolName, args),
  },

  // ============ 文件解析 ============
  file: {
    parse: (filePath: string, fileType: string) =>
      invoke<{ success: boolean; content: string; error?: string; duration: number; pageCount?: number; structuredData?: unknown }>(
        'file:parse', filePath, fileType,
      ),
  },

  // ============ 图片 ============
  image: {
    toBase64: (filePath: string) =>
      invoke<{ success: boolean; data?: string; mime?: string; size?: number; error?: string }>(
        'image:toBase64', filePath,
      ),
  },

  // ============ 导出 ============
  exportConv: (conv: Conversation) =>
    invoke<{ success: boolean; path?: string; error?: string }>('export:conversation', conv),
}
