/**
 * HubMind - 共享类型定义
 * 这是整个项目的类型基础，所有子包都依赖此文件
 */

// ============ 模型供应商 ============

/** 支持的模型厂商 */
export type ModelProvider =
  | 'deepseek'
  | 'qwen'
  | 'glm'
  | 'doubao'
  | 'hunyuan'
  | 'moonshot'
  | 'ernie'
  | 'ollama'       // Ollama 本地模型
  | 'openai'
  | 'custom'

/** 聚合平台 */
export type AggregationPlatform =
  | 'moma'         // 移动 MoMA
  | 'bailian'      // 阿里云百炼
  | 'qianwenyun'   // 千问云
  | 'none'

// ============ 模型配置 ============

/** 模型接入配置 */
export interface ModelConfig {
  id: string
  name: string                    // 显示名称，如 "DeepSeek-V3"
  provider: ModelProvider
  platform: AggregationPlatform
  /** API 端点 */
  baseURL: string
  /** API 密钥（加密存储） */
  apiKey: string
  /** 模型标识名，用于 API 调用 */
  modelId: string
  /** 是否支持视觉（图片理解） */
  supportsVision: boolean
  /** 最大上下文长度 (tokens) */
  maxContextTokens: number
  /** 最大输出长度 (tokens) */
  maxOutputTokens: number
  /** 是否启用 */
  enabled: boolean
  /** 自定义请求头 */
  customHeaders?: Record<string, string>
  /** 代理/中转地址 */
  proxyURL?: string
  /** 模型能力标签 */
  capabilities: ModelCapability[]
}

/** 模型连接验证结果 */
export interface ValidationResult {
  success: boolean
  /** HTTP 状态码或错误码 */
  code?: string
  /** 错误信息摘要 */
  message?: string
  /** 排查建议 */
  suggestion?: string
}

/** 模型能力 */
export type ModelCapability =
  | 'chat'
  | 'vision'
  | 'code'
  | 'function-calling'
  | 'web-search'
  | 'streaming'
  | 'json-mode'

// ============ 模型参数 ============

/** 模型推理参数 */
export interface ModelParams {
  temperature: number   // 0-2
  topP: number           // 0-1
  maxTokens: number
  frequencyPenalty: number
  presencePenalty: number
  /** 停止词 */
  stop: string[]
  /** JSON 模式（结构化输出） */
  jsonMode: boolean
}

export const DEFAULT_MODEL_PARAMS: ModelParams = {
  temperature: 0.7,
  topP: 1,
  maxTokens: 4096,
  frequencyPenalty: 0,
  presencePenalty: 0,
  stop: [],
  jsonMode: false,
}

// ============ 消息与对话 ============

/** 消息角色 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

/** 内容块类型（多模态消息） */
export type ContentBlock =
  | TextContent
  | ImageContent
  | FileContent
  | ToolCallContent
  | ToolResultContent

export interface TextContent {
  type: 'text'
  text: string
}

export interface ImageContent {
  type: 'image'
  /** base64 编码或 URL */
  data: string
  mimeType: string
  /** 图片的 OCR 提取文本（降级模式） */
  extractedText?: string
}

export interface FileContent {
  type: 'file'
  fileName: string
  fileType: string
  /** 文件解析后的文本内容 */
  parsedContent: string
  /** 原始文件路径（本地） */
  localPath?: string
  /** 文件大小(bytes) */
  size: number
  /** 结构化提取（表格/JSON 等） */
  structuredData?: unknown
}

export interface ToolCallContent {
  type: 'tool_call'
  toolCallId: string
  toolName: string
  arguments: Record<string, unknown>
}

export interface ToolResultContent {
  type: 'tool_result'
  toolCallId: string
  result: string
  /** 是否出错 */
  isError?: boolean
}

/** 单条消息 */
export interface Message {
  id: string
  role: MessageRole
  content: ContentBlock[]
  /** 生成该消息的模型 ID */
  modelId?: string
  /** 时间戳 */
  createdAt: number
  /** Token 用量 */
  usage?: TokenUsage
}

// ============ 对话管理 ============

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  /** 系统提示词 */
  systemPrompt: string
  /** 当前使用的模型配置 ID */
  modelConfigId: string
  /** 消息分叉点（多分支对话） */
  forkPoint?: string
  createdAt: number
  updatedAt: number
  /** 标签 */
  tags: string[]
  /** 是否置顶 */
  pinned: boolean
  /** 是否归档 */
  archived: boolean
}

// ============ Token 用量 ============

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  /** 预估费用（元） */
  estimatedCost: number
}

// ============ LLM 请求/响应 ============

/** Adapter 响应 */
export interface AdapterResponse {
  content: string
  toolCalls?: Array<{
    id: string
    name: string
    arguments: Record<string, unknown>
  }>
  usage: TokenUsage
  finishReason: 'stop' | 'length' | 'tool_calls' | 'error'
}

/** 统一的 LLM 请求格式 */
export interface LLMRequest {
  model: string
  messages: {
    role: MessageRole
    content: string | ContentBlock[]
  }[]
  temperature?: number
  topP?: number
  maxTokens?: number
  stop?: string[]
  /** 工具定义（Function Calling） */
  tools?: ToolDefinition[]
  /** 是否流式输出 */
  stream?: boolean
  /** JSON 模式 */
  responseFormat?: { type: 'json_object' }
}

/** 工具定义 */
export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

/** 流式响应块 */
export interface StreamChunk {
  /** 增量内容 */
  delta: string
  /** 是否结束 */
  done: boolean
  /** 工具调用（如有） */
  toolCalls?: ToolCallDelta[]
  /** 最终用量统计（仅 done=true 时有值） */
  usage?: TokenUsage
}

export interface ToolCallDelta {
  id: string
  name: string
  arguments: string
}

// ============ Agent 智能体 ============

/** Agent 配置 */
export interface AgentConfig {
  id: string
  name: string
  description: string
  /** 系统提示词 */
  systemPrompt: string
  /** 使用的模型 */
  modelConfigId: string
  /** 可用工具列表 */
  tools: string[]
  /** 执行模式 */
  mode: AgentMode
  /** 最大迭代步数 */
  maxSteps: number
  /** 是否自动批准动作（高风险） */
  autoApprove: boolean
}

export type AgentMode = 'chat' | 'agent' | 'workflow'

/** 工具执行结果 */
export interface ToolExecution {
  toolName: string
  arguments: Record<string, unknown>
  result: string
  error?: string
  duration: number
}

// ============ 工作流 ============

/** 工作流节点类型 */
export type WorkflowNodeType =
  | 'llm'
  | 'tool'
  | 'condition'
  | 'loop'
  | 'input'
  | 'output'
  | 'code'

/** 工作流节点 */
export interface WorkflowNode {
  id: string
  type: WorkflowNodeType
  label: string
  config: Record<string, unknown>
  position: { x: number; y: number }
}

/** 工作流连线 */
export interface WorkflowEdge {
  id: string
  source: string
  target: string
  /** 条件标签 */
  label?: string
}

/** 工作流定义 */
export interface Workflow {
  id: string
  name: string
  description: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  createdAt: number
  updatedAt: number
}

// ============ 文件解析 ============

/** 支持的文件类型 */
export type SupportedFileType =
  | 'pdf'
  | 'docx'
  | 'doc'
  | 'xlsx'
  | 'xls'
  | 'csv'
  | 'pptx'
  | 'ppt'
  | 'txt'
  | 'md'
  | 'jpg'
  | 'jpeg'
  | 'png'
  | 'gif'
  | 'webp'
  | 'code'

/** 文件解析模式 */
export type ParseMode =
  | 'vision'      // 直接图片识别（视觉模型）
  | 'ocr'         // OCR 文字提取
  | 'document'    // 文档结构化解析
  | 'raw'         // 原始文本

/** 文件解析请求 */
export interface ParseRequest {
  filePath: string
  fileType: SupportedFileType
  parseMode: ParseMode
  /** 高级选项 */
  options?: {
    /** 是否提取表格 */
    extractTables?: boolean
    /** 是否提取公式 */
    extractFormulas?: boolean
    /** 输出格式 */
    outputFormat?: 'markdown' | 'json' | 'text'
  }
}

/** 文件解析结果 */
export interface ParseResult {
  success: boolean
  content: string
  /** 结构化数据（表格、JSON 等） */
  structuredData?: unknown
  /** 页面/元素边界框（用于高亮定位） */
  boundingBoxes?: BoundingBox[]
  /** 解析耗时(ms) */
  duration: number
  error?: string
}

export interface BoundingBox {
  page: number
  x: number
  y: number
  width: number
  height: number
  text: string
}

// ============ 插件系统 ============

/** 插件清单 */
export interface PluginManifest {
  id: string
  name: string
  version: string
  description: string
  author: string
  /** 入口文件 */
  main: string
  /** 权限声明 */
  permissions: PluginPermission[]
  /** 要求的最低应用版本 */
  minAppVersion: string
}

export type PluginPermission =
  | 'fs:read'
  | 'fs:write'
  | 'network:fetch'
  | 'shell:execute'
  | 'clipboard:read'
  | 'clipboard:write'

/** 插件实例 */
export interface PluginInstance {
  manifest: PluginManifest
  /** 是否激活 */
  active: boolean
  /** 插件暴露的 API */
  api: Record<string, unknown>
}

// ============ 设置与偏好 ============

export interface AppSettings {
  /** 通用设置 */
  general: {
    language: 'zh-CN' | 'en'
    theme: 'light' | 'dark' | 'system'
    fontSize: number
    /** 启动时恢复上次会话 */
    restoreSession: boolean
  }
  /** API 与网络 */
  network: {
    /** 全局代理 */
    proxyURL?: string
    /** 请求超时(ms) */
    timeout: number
    /** 自动重试次数 */
    maxRetries: number
    /** 断路保护阈值(连续失败次数) */
    circuitBreakerThreshold: number
  }
  /** 隐私与安全 */
  privacy: {
    /** 数据加密密钥 */
    encryptionKey?: string
    /** 本地模型路径 */
    localModelPath?: string
    /** 允许匿名统计 */
    allowTelemetry: boolean
  }
  /** 成本控制 */
  costControl: {
    /** 单日预算上限(元) */
    dailyBudget: number
    /** 单月预算上限(元) */
    monthlyBudget: number
    /** 预算警告比例(如 0.8 = 80%) */
    warningRatio: number
  }
}

export const DEFAULT_SETTINGS: AppSettings = {
  general: {
    language: 'zh-CN',
    theme: 'system',
    fontSize: 14,
    restoreSession: true,
  },
  network: {
    timeout: 60000,
    maxRetries: 3,
    circuitBreakerThreshold: 5,
  },
  privacy: {
    allowTelemetry: false,
  },
  costControl: {
    dailyBudget: 100,
    monthlyBudget: 2000,
    warningRatio: 0.8,
  },
}
