// env.d.ts - 环境类型声明

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Electron API (preload 暴露到渲染进程)
interface ElectronAPI {
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, content: string) => Promise<boolean>
  selectFile: (options?: { filters?: Array<{ name: string; extensions: string[] }> }) => Promise<string[]>
  selectDirectory: () => Promise<string | null>
  shellExecute: (command: string, cwd?: string, timeout?: number) => Promise<{ code: number; stdout: string; stderr: string }>
  clipboardWrite: (text: string) => void
  clipboardRead: () => string
  minimize: () => void
  maximize: () => void
  close: () => void
  openExternal: (url: string) => void
  dbQuery: (sql: string, params?: unknown[]) => Promise<unknown>
  getNativeTheme: () => Promise<'dark' | 'light'>
  on: (channel: string, callback: (...args: unknown[]) => void) => void
  off: (channel: string, callback: (...args: unknown[]) => void) => void
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
}

interface Window {
  electronAPI: ElectronAPI
}
