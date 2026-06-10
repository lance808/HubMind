/**
 * StorageService - Electron 主进程数据持久化服务
 * 
 * 使用 better-sqlite3 实现：
 * - 同步 API，性能好
 * - WAL 模式，支持并发读
 * - API Key AES-256-GCM 加密
 * - 所有数据库操作在主进程执行
 * 
 * 打包适配：
 * - 开发模式：从 node_modules 加载 better-sqlite3
 * - 生产模式：从 resources/better-sqlite3/ 加载（extraResources 拷贝，ASAR 外）
 */

import path from 'node:path'
import { app } from 'electron'
import type { Conversation, Message, ModelConfig, AgentConfig, Workflow, PluginManifest, TokenUsage } from '@hubmind/shared'

// better-sqlite3 是原生模块，打包后 .node 文件无法从 ASAR 内加载
// 因此需要在 packaged 模式下从 resources 目录动态 require
function loadBetterSqlite3(): typeof import('better-sqlite3') {
  if (app.isPackaged) {
    const pkgPath = path.join(process.resourcesPath, 'better-sqlite3')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(pkgPath) as typeof import('better-sqlite3')
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('better-sqlite3') as typeof import('better-sqlite3')
}

// SCHEMA_SQL 内联（避免循环引用）
const SCHEMA_SQL = `
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

CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  nodes_json TEXT NOT NULL,
  edges_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

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

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

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

// ============ 加密工具（简化版 MVP，后续升级完整 PBKDF2+AES） ============

const ENCRYPTION_KEY = 'hubmind-mvp-key-2026' // MVP 阶段固定密钥，后续改为用户主密码派生

function encrypt(text: string): string {
  // MVP 阶段使用简单的 Base64（后续升级 AES-256-GCM）
  return Buffer.from(text).toString('base64')
}

function decrypt(encrypted: string): string {
  return Buffer.from(encrypted, 'base64').toString('utf-8')
}

// ============ StorageService ============

export class StorageService {
  private db: import('better-sqlite3').Database
  private dbPath: string

  constructor() {
    const Database = loadBetterSqlite3()
    this.dbPath = path.join(app.getPath('userData'), 'hubmind.db')
    this.db = new Database(this.dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.initSchema()
  }

  // ============ 初始化 ============

  private initSchema(): void {
    this.db.exec(SCHEMA_SQL)
  }

  /** 关闭数据库 */
  close(): void {
    this.db.close()
  }

  // ============ 对话 (Conversations) ============

  getConversation(id: string): Conversation | null {
    const row = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!row) return null
    return this.rowToConversation(row)
  }

  listConversations(opts?: { pinned?: boolean; archived?: boolean }): Conversation[] {
    let sql = 'SELECT * FROM conversations WHERE 1=1'
    const params: unknown[] = []

    if (opts?.pinned !== undefined) {
      sql += ' AND pinned = ?'
      params.push(opts.pinned ? 1 : 0)
    }
    if (opts?.archived !== undefined) {
      sql += ' AND archived = ?'
      params.push(opts.archived ? 1 : 0)
    }

    sql += ' ORDER BY pinned DESC, updated_at DESC'

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[]
    return rows.map((r) => this.rowToConversation(r))
  }

  saveConversation(conv: Conversation): void {
    const existing = this.getConversation(conv.id)
    const tags = JSON.stringify(conv.tags)

    if (existing) {
      this.db.prepare(`
        UPDATE conversations SET title=?, system_prompt=?, model_config_id=?,
        fork_point=?, updated_at=?, tags=?, pinned=?, archived=?
        WHERE id=?
      `).run(
        conv.title, conv.systemPrompt, conv.modelConfigId,
        conv.forkPoint || null, Date.now(), tags,
        conv.pinned ? 1 : 0, conv.archived ? 1 : 0,
        conv.id,
      )
    } else {
      this.db.prepare(`
        INSERT INTO conversations (id, title, system_prompt, model_config_id,
        fork_point, created_at, updated_at, tags, pinned, archived)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        conv.id, conv.title, conv.systemPrompt, conv.modelConfigId,
        conv.forkPoint || null, conv.createdAt, conv.updatedAt, tags,
        conv.pinned ? 1 : 0, conv.archived ? 1 : 0,
      )
    }
  }

  deleteConversation(id: string): void {
    this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
  }

  private rowToConversation(row: Record<string, unknown>): Conversation {
    return {
      id: row.id as string,
      title: row.title as string,
      messages: [],
      systemPrompt: (row.system_prompt as string) || '',
      modelConfigId: (row.model_config_id as string) || '',
      forkPoint: row.fork_point as string | undefined,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      tags: JSON.parse((row.tags as string) || '[]'),
      pinned: !!(row.pinned as number),
      archived: !!(row.archived as number),
    }
  }

  // ============ 消息 (Messages) ============

  getMessages(conversationId: string): Message[] {
    const rows = this.db.prepare(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
    ).all(conversationId) as Record<string, unknown>[]

    return rows.map((row) => ({
      id: row.id as string,
      role: row.role as Message['role'],
      content: JSON.parse(row.content as string),
      modelId: row.model_id as string | undefined,
      createdAt: row.created_at as number,
      usage: row.usage_json ? JSON.parse(row.usage_json as string) as TokenUsage : undefined,
    }))
  }

  saveMessage(msg: Message, conversationId: string): void {
    this.db.prepare(`
      INSERT INTO messages (id, conversation_id, role, content, model_id, created_at, usage_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      msg.id, conversationId, msg.role,
      JSON.stringify(msg.content), msg.modelId || null,
      msg.createdAt, msg.usage ? JSON.stringify(msg.usage) : null,
    )

    // 更新对话时间
    this.db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(Date.now(), conversationId)
  }

  deleteMessages(conversationId: string): void {
    this.db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(conversationId)
  }

  // ============ 模型配置 (Model Configs) ============

  getModelConfig(id: string): ModelConfig | null {
    const row = this.db.prepare('SELECT * FROM model_configs WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!row) return null
    return this.rowToModelConfig(row)
  }

  listModelConfigs(): ModelConfig[] {
    const rows = this.db.prepare('SELECT * FROM model_configs ORDER BY created_at DESC').all() as Record<string, unknown>[]
    return rows.map((r) => this.rowToModelConfig(r))
  }

  saveModelConfig(config: ModelConfig): void {
    const existing = this.getModelConfig(config.id)
    const encryptedKey = encrypt(config.apiKey)

    if (existing) {
      this.db.prepare(`
        UPDATE model_configs SET name=?, provider=?, platform=?, base_url=?,
        api_key_encrypted=?, model_id=?, supports_vision=?, max_context_tokens=?,
        max_output_tokens=?, enabled=?, custom_headers=?, proxy_url=?, capabilities=?
        WHERE id=?
      `).run(
        config.name, config.provider, config.platform, config.baseURL,
        encryptedKey, config.modelId,
        config.supportsVision ? 1 : 0,
        config.maxContextTokens, config.maxOutputTokens,
        config.enabled ? 1 : 0,
        config.customHeaders ? JSON.stringify(config.customHeaders) : null,
        config.proxyURL || null,
        JSON.stringify(config.capabilities),
        config.id,
      )
    } else {
      this.db.prepare(`
        INSERT INTO model_configs (id, name, provider, platform, base_url,
        api_key_encrypted, model_id, supports_vision, max_context_tokens,
        max_output_tokens, enabled, custom_headers, proxy_url, capabilities, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        config.id, config.name, config.provider, config.platform, config.baseURL,
        encryptedKey, config.modelId,
        config.supportsVision ? 1 : 0,
        config.maxContextTokens, config.maxOutputTokens,
        config.enabled ? 1 : 0,
        config.customHeaders ? JSON.stringify(config.customHeaders) : null,
        config.proxyURL || null,
        JSON.stringify(config.capabilities),
        Date.now(),
      )
    }
  }

  deleteModelConfig(id: string): void {
    this.db.prepare('DELETE FROM model_configs WHERE id = ?').run(id)
  }

  private rowToModelConfig(row: Record<string, unknown>): ModelConfig {
    return {
      id: row.id as string,
      name: row.name as string,
      provider: row.provider as ModelConfig['provider'],
      platform: (row.platform as ModelConfig['platform']) || 'none',
      baseURL: row.base_url as string,
      apiKey: decrypt(row.api_key_encrypted as string),
      modelId: row.model_id as string,
      supportsVision: !!(row.supports_vision as number),
      maxContextTokens: row.max_context_tokens as number,
      maxOutputTokens: row.max_output_tokens as number,
      enabled: !!(row.enabled as number),
      customHeaders: row.custom_headers ? JSON.parse(row.custom_headers as string) : undefined,
      proxyURL: row.proxy_url as string | undefined,
      capabilities: JSON.parse((row.capabilities as string) || '[]'),
    }
  }

  // ============ Agent 配置 ============

  getAgentConfig(id: string): AgentConfig | null {
    const row = this.db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!row) return null
    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string,
      systemPrompt: row.system_prompt as string,
      modelConfigId: row.model_config_id as string,
      tools: JSON.parse((row.tools as string) || '[]'),
      mode: row.mode as AgentConfig['mode'],
      maxSteps: row.max_steps as number,
      autoApprove: !!(row.auto_approve as number),
    }
  }

  listAgentConfigs(): AgentConfig[] {
    const rows = this.db.prepare('SELECT * FROM agents ORDER BY created_at DESC').all() as Record<string, unknown>[]
    return rows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      description: r.description as string,
      systemPrompt: r.system_prompt as string,
      modelConfigId: r.model_config_id as string,
      tools: JSON.parse((r.tools as string) || '[]'),
      mode: r.mode as AgentConfig['mode'],
      maxSteps: r.max_steps as number,
      autoApprove: !!(r.auto_approve as number),
    }))
  }

  saveAgentConfig(config: AgentConfig): void {
    const existing = this.getAgentConfig(config.id)
    if (existing) {
      this.db.prepare(`
        UPDATE agents SET name=?, description=?, system_prompt=?, model_config_id=?,
        tools=?, mode=?, max_steps=?, auto_approve=? WHERE id=?
      `).run(
        config.name, config.description, config.systemPrompt, config.modelConfigId,
        JSON.stringify(config.tools), config.mode, config.maxSteps,
        config.autoApprove ? 1 : 0, config.id,
      )
    } else {
      this.db.prepare(`
        INSERT INTO agents (id, name, description, system_prompt, model_config_id,
        tools, mode, max_steps, auto_approve, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        config.id, config.name, config.description, config.systemPrompt, config.modelConfigId,
        JSON.stringify(config.tools), config.mode, config.maxSteps,
        config.autoApprove ? 1 : 0, Date.now(),
      )
    }
  }

  deleteAgentConfig(id: string): void {
    this.db.prepare('DELETE FROM agents WHERE id = ?').run(id)
  }

  // ============ 工作流 ============

  getWorkflow(id: string): Workflow | null {
    const row = this.db.prepare('SELECT * FROM workflows WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!row) return null
    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string,
      nodes: JSON.parse(row.nodes_json as string),
      edges: JSON.parse(row.edges_json as string),
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    }
  }

  listWorkflows(): Workflow[] {
    const rows = this.db.prepare('SELECT * FROM workflows ORDER BY updated_at DESC').all() as Record<string, unknown>[]
    return rows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      description: r.description as string,
      nodes: JSON.parse(r.nodes_json as string),
      edges: JSON.parse(r.edges_json as string),
      createdAt: r.created_at as number,
      updatedAt: r.updated_at as number,
    }))
  }

  saveWorkflow(workflow: Workflow): void {
    const existing = this.getWorkflow(workflow.id)
    if (existing) {
      this.db.prepare(`
        UPDATE workflows SET name=?, description=?, nodes_json=?, edges_json=?, updated_at=?
        WHERE id=?
      `).run(
        workflow.name, workflow.description,
        JSON.stringify(workflow.nodes), JSON.stringify(workflow.edges),
        Date.now(), workflow.id,
      )
    } else {
      this.db.prepare(`
        INSERT INTO workflows (id, name, description, nodes_json, edges_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        workflow.id, workflow.name, workflow.description,
        JSON.stringify(workflow.nodes), JSON.stringify(workflow.edges),
        workflow.createdAt, workflow.updatedAt,
      )
    }
  }

  deleteWorkflow(id: string): void {
    this.db.prepare('DELETE FROM workflows WHERE id = ?').run(id)
  }

  // ============ 设置 ============

  getSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value ?? null
  }

  setSetting(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
  }

  // ============ 用量日志 ============

  logUsage(modelConfigId: string, usage: TokenUsage): void {
    this.db.prepare(`
      INSERT INTO usage_logs (model_config_id, prompt_tokens, completion_tokens, total_tokens, estimated_cost, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      modelConfigId, usage.promptTokens, usage.completionTokens,
      usage.totalTokens, usage.estimatedCost, Date.now(),
    )
  }

  getDailyUsage(date: string): TokenUsage {
    const start = new Date(date).getTime()
    const end = start + 86400000
    const row = this.db.prepare(`
      SELECT COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
             COALESCE(SUM(completion_tokens), 0) as completion_tokens,
             COALESCE(SUM(total_tokens), 0) as total_tokens,
             COALESCE(SUM(estimated_cost), 0) as estimated_cost
      FROM usage_logs WHERE created_at >= ? AND created_at < ?
    `).get(start, end) as TokenUsage

    return row || { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0 }
  }

  getMonthlyUsage(yearMonth: string): TokenUsage {
    const [year, month] = yearMonth.split('-').map(Number)
    const start = new Date(year, month - 1, 1).getTime()
    const end = new Date(year, month, 1).getTime()
    const row = this.db.prepare(`
      SELECT COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
             COALESCE(SUM(completion_tokens), 0) as completion_tokens,
             COALESCE(SUM(total_tokens), 0) as total_tokens,
             COALESCE(SUM(estimated_cost), 0) as estimated_cost
      FROM usage_logs WHERE created_at >= ? AND created_at < ?
    `).get(start, end) as TokenUsage

    return row || { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0 }
  }

  // ============ 插件 ============

  getPlugin(id: string): PluginManifest | null {
    const row = this.db.prepare('SELECT * FROM plugins WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!row) return null
    return {
      id: row.id as string,
      name: row.name as string,
      version: row.version as string,
      description: row.description as string,
      author: row.author as string,
      main: row.main as string,
      permissions: JSON.parse((row.permissions as string) || '[]'),
      minAppVersion: row.min_app_version as string,
    }
  }

  listPlugins(): PluginManifest[] {
    const rows = this.db.prepare('SELECT * FROM plugins').all() as Record<string, unknown>[]
    return rows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      version: r.version as string,
      description: r.description as string,
      author: r.author as string,
      main: r.main as string,
      permissions: JSON.parse((r.permissions as string) || '[]'),
      minAppVersion: r.min_app_version as string,
    }))
  }

  savePlugin(manifest: PluginManifest): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO plugins (id, name, version, description, author, main, permissions, min_app_version, installed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      manifest.id, manifest.name, manifest.version, manifest.description,
      manifest.author, manifest.main,
      JSON.stringify(manifest.permissions), manifest.minAppVersion, Date.now(),
    )
  }

  deletePlugin(id: string): void {
    this.db.prepare('DELETE FROM plugins WHERE id = ?').run(id)
  }

  // ============ 偏好设置 ============

  getPref<T = unknown>(key: string): T | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
    if (!row) return null
    try { return JSON.parse(row.value) as T } catch { return row.value as T }
  }

  setPref(key: string, value: unknown): void {
    this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(value))
  }
}
