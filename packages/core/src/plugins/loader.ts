/**
 * 插件系统架构
 * 
 * 设计原则：
 * 1. 插件运行在沙箱环境中（Node.js vm2 或 isolated-vm）
 * 2. 最小权限原则：插件需声明所需权限
 * 3. 动态加载：支持从本地文件或 npm 包加载插件
 * 4. 生命周期管理：安装、激活、停用、卸载
 * 
 * 插件可以扩展的能力点：
 * - 模型适配器：接入新的模型厂商
 * - 文件解析器：添加新的文件格式解析
 * - 工具：添加 Agent 可调用的工具
 * - UI 扩展：在特定位置注入 UI 组件（如侧边栏面板、消息渲染器）
 * - 命令：注册可被调用的命令
 */

import type { PluginManifest, PluginInstance, PluginPermission } from '@hubmind/shared/types'

// ============ 插件扩展点 ============

/** 插件可扩展的能力 */
export interface PluginExtensionPoints {
  /** 注册模型适配器 */
  registerAdapter?: (provider: string, adapter: unknown) => void
  /** 注册文件解析器 */
  registerParser?: (parser: unknown) => void
  /** 注册 Agent 工具 */
  registerTool?: (tool: unknown) => void
  /** 注册 UI 组件 */
  registerComponent?: (location: string, component: unknown) => void
}

/** UI 组件可注入的位置 */
export type UIInjectionPoint =
  | 'sidebar:bottom'        // 侧边栏底部
  | 'chat:toolbar'          // 聊天工具栏
  | 'chat:message:actions'  // 消息操作菜单
  | 'settings:panel'        // 设置面板
  | 'header:actions'        // 标题栏操作区

// ============ 插件加载器 ============

export class PluginLoader {
  private plugins: Map<string, PluginInstance> = new Map()
  private extensionPoints: PluginExtensionPoints

  constructor(extensions: PluginExtensionPoints) {
    this.extensionPoints = extensions
  }

  /** 从本地路径加载插件（Node.js 环境） */
  async loadFromPath(pluginPath: string): Promise<PluginInstance> {
    // 1. 读取 package.json 或 manifest.json
    // const manifest: PluginManifest = JSON.parse(readFile(path.join(pluginPath, 'manifest.json')))

    // 2. 验证权限
    // this.validatePermissions(manifest.permissions)

    // 3. 在沙箱中加载插件代码
    // const pluginModule = await this.loadInSandbox(manifest.main)

    // 4. 调用插件的 activate 钩子
    // await pluginModule.activate(this.extensionPoints)

    // 5. 注册插件
    // const instance: PluginInstance = { manifest, active: true, api: pluginModule.api }
    // this.plugins.set(manifest.id, instance)
    // return instance

    throw new Error('PluginLoader.loadFromPath not implemented')
  }

  /** 卸载插件 */
  async unload(pluginId: string): Promise<void> {
    const instance = this.plugins.get(pluginId)
    if (!instance) return

    // 调用插件的 deactivate 钩子
    // await instance.api.deactivate?.()

    this.plugins.delete(pluginId)
  }

  /** 获取所有已加载的插件 */
  getLoadedPlugins(): PluginInstance[] {
    return Array.from(this.plugins.values())
  }

  /** 检查插件是否激活 */
  isActive(pluginId: string): boolean {
    return this.plugins.get(pluginId)?.active ?? false
  }

  // ============ 权限验证 ============

  /** 危险权限（需要用户显式授权） */
  private static readonly DANGEROUS_PERMISSIONS: PluginPermission[] = [
    'shell:execute',
    'fs:write',
  ]

  validatePermissions(permissions: PluginPermission[]): { valid: boolean; dangerous: PluginPermission[] } {
    const dangerous = permissions.filter((p) =>
      PluginLoader.DANGEROUS_PERMISSIONS.includes(p)
    )
    return {
      valid: true,
      dangerous,
    }
  }
}

// ============ 插件开发 SDK ============

/** 插件开发者使用的 SDK 接口 */
export interface PluginSDK {
  /** 注册模型适配器 */
  registerModelAdapter: (config: {
    provider: string
    baseURL: string
    headers?: Record<string, string>
  }) => void

  /** 注册文件解析器 */
  registerFileParser: (config: {
    name: string
    extensions: string[]
    parse: (filePath: string) => Promise<string>
  }) => void

  /** 注册 Agent 工具 */
  registerTool: (tool: {
    name: string
    description: string
    parameters: Record<string, unknown>
    execute: (args: Record<string, unknown>) => Promise<string>
  }) => void

  /** 添加 UI 组件 */
  addUIComponent: (location: UIInjectionPoint, component: unknown) => void

  /** 获取应用设置 */
  getSettings: () => unknown

  /** 日志 */
  log: (message: string) => void
}
