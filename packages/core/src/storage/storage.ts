/**
 * 本地数据存储层
 * 
 * 使用 better-sqlite3 实现：
 * - 同步 API，性能好
 * - 支持 WAL 模式
 * - 加密密钥通过 SQLCipher 扩展（可选）
 * 
 * 表结构：
 * - conversations: 对话记录
 * - messages: 消息记录
 * - model_configs: 模型配置（密钥加密存储）
 * - agents: Agent 配置
 * - workflows: 工作流定义
 * - plugins: 插件信息
 * - settings: 应用设置（键值对）
 * - usage_logs: Token 用量日志
 */

import type {
  Conversation,
  Message,
  ModelConfig,
  AgentConfig,
  Workflow,
  PluginManifest,
  AppSettings,
  TokenUsage,
} from '@hubmind/shared'

// 注意：better-sqlite3 是原生模块，需在 Electron 主进程中使用
// 渲染进程通过 IPC 调用存储接口

// ============ 数据库 Schema ============

export const SCHEMA_SQL = `
-- 对话表
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  system_prompt TEXT DEFAULT '',
  model_config_id TEXT,
  fork_point TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  tags TEXT DEFAULT '[]',
  pinned INTEGER DEFAULT 0,
  archived INTEGER DEFAULT 0
);

-- 消息表
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  model_id TEXT,
  created_at INTEGER NOT NULL,
  usage_json TEXT,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);

-- 模型配置表（密钥加密存储）
CREATE TABLE IF NOT EXISTS model_configs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  platform TEXT DEFAULT 'none',
  base_url TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  model_id TEXT NOT NULL,
  supports_vision INTEGER DEFAULT 0,
  max_context_tokens INTEGER DEFAULT 4096,
  max_output_tokens INTEGER DEFAULT 4096,
  enabled INTEGER DEFAULT 1,
  custom_headers TEXT,
  proxy_url TEXT,
  capabilities TEXT DEFAULT '[]',
  created_at INTEGER NOT NULL
);

-- Agent 配置表
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  system_prompt TEXT DEFAULT '',
  model_config_id TEXT,
  tools TEXT DEFAULT '[]',
  mode TEXT DEFAULT 'chat',
  max_steps INTEGER DEFAULT 10,
  auto_approve INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- 工作流定义表
CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  nodes_json TEXT NOT NULL,
  edges_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 插件表
CREATE TABLE IF NOT EXISTS plugins (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  description TEXT DEFAULT '',
  author TEXT DEFAULT '',
  main TEXT NOT NULL,
  permissions TEXT DEFAULT '[]',
  min_app_version TEXT DEFAULT '0.1.0',
  active INTEGER DEFAULT 0,
  installed_at INTEGER NOT NULL
);

-- 设置表（键值对）
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Token 用量日志
CREATE TABLE IF NOT EXISTS usage_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_config_id TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,
  estimated_cost REAL NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_date ON usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_logs_model ON usage_logs(model_config_id, created_at);
`

// ============ 存储接口（DAO 层）============

export interface IStorage {
  // 对话
  getConversation(id: string): Conversation | null
  listConversations(opts?: { pinned?: boolean; archived?: boolean }): Conversation[]
  saveConversation(conv: Conversation): void
  deleteConversation(id: string): void

  // 消息
  getMessages(conversationId: string): Message[]
  saveMessage(msg: Message, conversationId: string): void
  deleteMessages(conversationId: string): void

  // 模型配置
  getModelConfig(id: string): ModelConfig | null
  listModelConfigs(): ModelConfig[]
  saveModelConfig(config: ModelConfig): void
  deleteModelConfig(id: string): void

  // Agent
  getAgentConfig(id: string): AgentConfig | null
  listAgentConfigs(): AgentConfig[]
  saveAgentConfig(config: AgentConfig): void
  deleteAgentConfig(id: string): void

  // 工作流
  getWorkflow(id: string): Workflow | null
  listWorkflows(): Workflow[]
  saveWorkflow(workflow: Workflow): void
  deleteWorkflow(id: string): void

  // 插件
  getPlugin(id: string): PluginManifest | null
  listPlugins(): PluginManifest[]
  savePlugin(manifest: PluginManifest): void
  deletePlugin(id: string): void

  // 设置
  getSetting(key: string): string | null
  setSetting(key: string, value: string): void
  getAppSettings(): AppSettings

  // 用量
  logUsage(modelConfigId: string, usage: TokenUsage): void
  getDailyUsage(date: string): TokenUsage
  getMonthlyUsage(yearMonth: string): TokenUsage
}

// ============ SQLite 实现（主进程中使用）============

/**
 * 实际存储实现在 Electron 主进程中，通过 IPC 暴露给渲染进程。
 * 这里只提供接口定义，具体实现依赖 better-sqlite3。
 * 
 * 关键安全设计：
 * 1. apiKey 使用 AES-256-GCM 加密存储
 * 2. 加密密钥从用户主密码派生（PBKDF2）
 * 3. 所有数据库操作在主进程执行，渲染进程无直接文件系统访问
 */
export class SqliteStorage implements IStorage {
  // 实际实现在 apps/desktop/src/main/services/storage.ts
  // 这里只做占位声明

  getConversation(_id: string): Conversation | null { return null }
  listConversations(_opts?: { pinned?: boolean; archived?: boolean }): Conversation[] { return [] }
  saveConversation(_conv: Conversation): void {}
  deleteConversation(_id: string): void {}

  getMessages(_conversationId: string): Message[] { return [] }
  saveMessage(_msg: Message, _conversationId: string): void {}
  deleteMessages(_conversationId: string): void {}

  getModelConfig(_id: string): ModelConfig | null { return null }
  listModelConfigs(): ModelConfig[] { return [] }
  saveModelConfig(_config: ModelConfig): void {}
  deleteModelConfig(_id: string): void {}

  getAgentConfig(_id: string): AgentConfig | null { return null }
  listAgentConfigs(): AgentConfig[] { return [] }
  saveAgentConfig(_config: AgentConfig): void {}
  deleteAgentConfig(_id: string): void {}

  getWorkflow(_id: string): Workflow | null { return null }
  listWorkflows(): Workflow[] { return [] }
  saveWorkflow(_workflow: Workflow): void {}
  deleteWorkflow(_id: string): void {}

  getPlugin(_id: string): PluginManifest | null { return null }
  listPlugins(): PluginManifest[] { return [] }
  savePlugin(_manifest: PluginManifest): void {}
  deletePlugin(_id: string): void {}

  getSetting(_key: string): string | null { return null }
  setSetting(_key: string, _value: string): void {}
  getAppSettings(): AppSettings {
    // 从 settings 表读取并反序列化
    return {} as AppSettings
  }

  logUsage(_modelConfigId: string, _usage: TokenUsage): void {}
  getDailyUsage(_date: string): TokenUsage {
    return { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0 }
  }
  getMonthlyUsage(_yearMonth: string): TokenUsage {
    return { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0 }
  }
}
