/**
 * Preload 脚本 - 渲染进程与主进程的安全桥接
 * 
 * 设计原则：
 * 1. 只暴露必要的 API，最小权限原则
 * 2. 所有数据传输经过序列化/反序列化
 * 3. 不在 preload 中执行任何业务逻辑
 */

import { contextBridge, ipcRenderer } from 'electron'

// ============ API 类型定义 ============

export interface ElectronAPI {
  // 文件系统
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, content: string) => Promise<boolean>
  selectFile: (options?: { filters?: Array<{ name: string; extensions: string[] }> }) => Promise<string[]>
  selectDirectory: () => Promise<string | null>

  // Shell
  shellExecute: (command: string, cwd?: string, timeout?: number) => Promise<{ code: number; stdout: string; stderr: string }>

  // 剪贴板
  clipboardWrite: (text: string) => void
  clipboardRead: () => string

  // 窗口控制
  minimize: () => void
  maximize: () => void
  close: () => void

  // 外部链接
  openExternal: (url: string) => void

  // 数据库（通过 IPC 调用主进程的 StorageService）
  dbQuery: (sql: string, params?: unknown[]) => Promise<unknown>

  // 主题
  getNativeTheme: () => Promise<'dark' | 'light'>

  // 事件监听（主进程 -> 渲染进程）
  on: (channel: string, callback: (...args: unknown[]) => void) => void
  off: (channel: string, callback: (...args: unknown[]) => void) => void

  // 通用 IPC 调用
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
}

// ============ 安全桥接 ============

const electronAPI: ElectronAPI = {
  // 文件系统
  readFile: (path: string) => ipcRenderer.invoke('fs:readFile', path),
  writeFile: (path: string, content: string) => ipcRenderer.invoke('fs:writeFile', path, content),
  selectFile: (options?) => ipcRenderer.invoke('fs:selectFile', options),
  selectDirectory: () => ipcRenderer.invoke('fs:selectDirectory'),

  // Shell
  shellExecute: (command, cwd?, timeout?) => ipcRenderer.invoke('shell:execute', command, cwd, timeout),

  // 剪贴板
  clipboardWrite: (text) => ipcRenderer.send('clipboard:write', text),
  clipboardRead: () => ipcRenderer.sendSync('clipboard:read'),

  // 窗口控制
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),

  // 外部链接
  openExternal: (url) => ipcRenderer.send('shell:openExternal', url),

  // 数据库
  dbQuery: (sql, params?) => ipcRenderer.invoke('db:query', sql, params),

  // 主题
  getNativeTheme: () => ipcRenderer.invoke('theme:getNative'),

  // 通用 IPC 调用
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),

  // 事件监听
  on: (channel, callback) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subscription = (_event: Electron.IpcRendererEvent, ...args: any[]) => callback(...args)
    ipcRenderer.on(channel, subscription)

    // 存储以便清理
    if (!listenerMap.has(channel)) {
      listenerMap.set(channel, new Map())
    }
    listenerMap.get(channel)!.set(callback, subscription as (...args: unknown[]) => void)
  },

  off: (channel, callback) => {
    const channelMap = listenerMap.get(channel)
    if (channelMap) {
      const subscription = channelMap.get(callback)
      if (subscription) {
        ipcRenderer.removeListener(channel, subscription)
        channelMap.delete(callback)
      }
    }
  },
}

// 存储回调映射用于清理
const listenerMap = new Map<string, Map<Function, (...args: unknown[]) => void>>()

// 暴露 API 到渲染进程
contextBridge.exposeInMainWorld('electronAPI', electronAPI)
