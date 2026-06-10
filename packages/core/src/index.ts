// 模型适配器
export { AdapterFactory, OpenAICompatibleAdapter } from './adapters/base-adapter'
export type { IModelAdapter, AdapterResponse, ModelInfo } from './adapters/base-adapter'

// 模型管理器
export { ModelManager, BUILTIN_PRESETS } from './adapters/model-manager'

// Agent 运行时
export { AgentRuntime, WorkflowEngine, ShellTool, WebSearchTool, FileTool } from './agent/runtime'
export type { Tool, ToolContext, AgentRunCallbacks, WorkflowContext } from './agent/runtime'

// 文件解析
export { FileParseGateway } from './file-parser/gateway'

// 存储
export { SqliteStorage } from './storage/storage'
export { SCHEMA_SQL } from './storage/storage'
export type { IStorage } from './storage/storage'

// 插件
export { PluginLoader } from './plugins/loader'
export type { PluginSDK, PluginExtensionPoints, UIInjectionPoint } from './plugins/loader'
