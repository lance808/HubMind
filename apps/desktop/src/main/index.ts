/**
 * Electron 主进程入口
 * 
 * 职责：
 * 1. 窗口管理（主窗口、设置窗口等）
 * 2. 应用生命周期管理
 * 3. 原生功能桥接（文件系统、Shell、剪贴板等）
 * 4. 数据库管理
 * 5. 自动更新
 * 6. 托盘与全局快捷键
 */

import { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, Tray, Menu, globalShortcut } from 'electron'
import path from 'node:path'
import { StorageService } from './services/storage'
import type { Conversation, Message, ModelConfig, AgentConfig, Workflow, TokenUsage, ValidationResult } from '@hubmind/shared'
import type { LLMRequest, ModelParams, StreamChunk } from '@hubmind/shared'

// 主窗口引用
let mainWindow: BrowserWindow | null = null
let storage: StorageService | null = null
let dbInitError: string | null = null

// ============ 应用生命周期 ============

app.whenReady().then(async () => {
  try {
    storage = new StorageService()
    dbInitError = null
    console.log('[StorageService] 数据库初始化成功')
  } catch (err) {
    const e = err as Error
    dbInitError = e.stack || e.message
    console.warn('[StorageService] 数据库初始化失败:', dbInitError)
    storage = null
  }
  createMainWindow()
  setupTray()
  setupShortcut()
  setupIPC()
  setupStorageIPC()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  storage?.close()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// ============ 系统托盘 ============

let tray: Tray | null = null

function setupTray(): void {
  try {
    const { nativeImage } = require('electron')
    // 创建一个 16x16 的简单图标
    const icon = nativeImage.createEmpty()
    tray = new Tray(icon)
    tray.setToolTip('HubMind')
    const contextMenu = Menu.buildFromTemplate([
      { label: '显示窗口', click: () => { mainWindow?.show(); mainWindow?.focus() } },
      { type: 'separator' },
      { label: '退出', click: () => { (app as unknown as { isQuitting: boolean }).isQuitting = true; app.quit() } },
    ])
    tray.setContextMenu(contextMenu)
    tray.on('click', () => { mainWindow?.show(); mainWindow?.focus() })
  } catch {
    tray = null // 托盘不可用
  }
}

// ============ 全局快捷键 ============

function setupShortcut(): void {
  globalShortcut.register('CommandOrControl+Alt+H', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide()
      } else {
        mainWindow.show()
        mainWindow.focus()
      }
    }
  })
}

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

function createMainWindow(): void {
  // 恢复窗口尺寸
  const stored = storage?.getPref('windowBounds') as { width: number; height: number; x?: number; y?: number } | null
  const bounds = stored || { width: 1280, height: 860 }

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 900,
    minHeight: 600,
    title: 'HubMind',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a1a2e' : '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    frame: false,
    titleBarStyle: 'hidden',
    show: false,
  })

  // 就绪后显示（避免白屏闪现）
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // 关闭时保存窗口尺寸
  mainWindow.on('close', (event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const [w, h] = mainWindow.getSize()
      const [x, y] = mainWindow.getPosition()
      storage?.setPref('windowBounds', { width: w, height: h, x, y })
    }
    if (tray && !(app as unknown as { isQuitting?: boolean }).isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  // 开发环境加载 Vite 开发服务器
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// ============ IPC 通信注册 ============

function setupIPC(): void {
  // --- 文件系统 ---
  ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
    const fs = await import('node:fs/promises')
    return fs.readFile(filePath, 'utf-8')
  })

  ipcMain.handle('fs:writeFile', async (_event, filePath: string, content: string) => {
    const fs = await import('node:fs/promises')
    await fs.writeFile(filePath, content, 'utf-8')
    return true
  })

  ipcMain.handle('fs:selectFile', async (_event, options?: { filters?: Array<{ name: string; extensions: string[] }> }) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile', 'multiSelections'],
      filters: options?.filters || [
        { name: '所有支持的文件', extensions: ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'csv', 'pptx', 'ppt', 'txt', 'md', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'js', 'ts', 'py', 'json'] },
      ],
    })
    return result.filePaths
  })

  ipcMain.handle('fs:selectDirectory', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
    })
    return result.filePaths[0] || null
  })

  // --- Shell 执行 ---
  ipcMain.handle('shell:execute', async (_event, command: string, cwd?: string, timeout?: number) => {
    const { exec } = await import('node:child_process')
    return new Promise((resolve) => {
      const child = exec(command, {
        cwd: cwd || app.getPath('home'),
        timeout: timeout || 30000,
        maxBuffer: 1024 * 1024 * 10, // 10MB
      })
      let stdout = ''
      let stderr = ''
      child.stdout?.on('data', (data) => { stdout += data })
      child.stderr?.on('data', (data) => { stderr += data })
      child.on('close', (code) => {
        resolve({ code, stdout, stderr })
      })
    })
  })

  // --- 剪贴板 ---
  ipcMain.handle('clipboard:write', (_event, text: string) => {
    const { clipboard } = require('electron')
    clipboard.writeText(text)
  })

  ipcMain.handle('clipboard:read', () => {
    const { clipboard } = require('electron')
    return clipboard.readText()
  })

  // --- 窗口控制 ---
  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })
  ipcMain.on('window:close', () => mainWindow?.close())

  // --- 外部链接 ---
  ipcMain.on('shell:openExternal', (_event, url: string) => {
    shell.openExternal(url)
  })

  // --- 主题 ---
  ipcMain.handle('theme:getNative', () => nativeTheme.shouldUseDarkColors ? 'dark' : 'light')
}

// ============ 存储 IPC 通道 ============

function setupStorageIPC(): void {
  if (!storage) {
    // 数据库不可用，注册返回空数组/空值的桩方法
    const listChannels = [
      'storage:conversation:list', 'storage:message:list',
      'storage:model:list', 'storage:agent:list',
      'storage:workflow:list',
    ]
    listChannels.forEach((ch) => ipcMain.handle(ch, () => []))

    const nullChannels = [
      'storage:conversation:get', 'storage:message:get',
      'storage:model:get', 'storage:agent:get',
      'storage:workflow:get',
    ]
    nullChannels.forEach((ch) => ipcMain.handle(ch, () => null))

    const emptyHandler = () => true
    ;['storage:conversation:save', 'storage:conversation:delete', 'storage:message:save',
      'storage:message:delete', 'storage:model:save', 'storage:model:delete',
      'storage:agent:save', 'storage:agent:delete', 'storage:workflow:save',
      'storage:workflow:delete', 'storage:usage:log',
    ].forEach((ch) => ipcMain.handle(ch, emptyHandler))

    // LLM 调用桩（数据库不可用时返回错误）
    ipcMain.handle('llm:validate', (): ValidationResult => ({
      success: false,
      code: 'DB_ERROR',
      message: dbInitError || '数据库未能初始化',
      suggestion: '请重新打包 (pnpm dist)，确保 better-sqlite3 及其依赖被正确拷贝',
    }))
    ipcMain.handle('llm:chat', () => ({ content: '', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0 }, finishReason: 'error' }))
    ipcMain.handle('llm:chatStream', () => ({ success: false }))

    // 数据库状态查询
    ipcMain.handle('db:status', () => ({
      ok: false,
      error: dbInitError || '数据库未初始化',
    }))
    return
  }

  // === 数据库状态 ===
  ipcMain.handle('db:status', () => ({ ok: true, error: null }))

  // === 对话 ===
  ipcMain.handle('storage:conversation:list', () => storage!.listConversations())
  ipcMain.handle('storage:conversation:get', (_e, id: string) => storage!.getConversation(id))
  ipcMain.handle('storage:conversation:save', (_e, conv: Conversation) => {
    storage!.saveConversation(conv)
    return true
  })
  ipcMain.handle('storage:conversation:delete', (_e, id: string) => {
    storage!.deleteConversation(id)
    return true
  })

  // === 消息 ===
  ipcMain.handle('storage:message:list', (_e, conversationId: string) => storage!.getMessages(conversationId))
  ipcMain.handle('storage:message:save', (_e, msg: Message, conversationId: string) => {
    storage!.saveMessage(msg, conversationId)
    return true
  })
  ipcMain.handle('storage:message:delete', (_e, conversationId: string) => {
    storage!.deleteMessages(conversationId)
    return true
  })

  // === 模型配置 ===
  ipcMain.handle('storage:model:list', () => storage!.listModelConfigs())
  ipcMain.handle('storage:model:get', (_e, id: string) => storage!.getModelConfig(id))
  ipcMain.handle('storage:model:save', (_e, config: ModelConfig) => {
    storage!.saveModelConfig(config)
    return true
  })
  ipcMain.handle('storage:model:delete', (_e, id: string) => {
    storage!.deleteModelConfig(id)
    return true
  })

  // === Agent ===
  ipcMain.handle('storage:agent:list', () => storage!.listAgentConfigs())
  ipcMain.handle('storage:agent:get', (_e, id: string) => storage!.getAgentConfig(id))
  ipcMain.handle('storage:agent:save', (_e, config: AgentConfig) => {
    storage!.saveAgentConfig(config)
    return true
  })
  ipcMain.handle('storage:agent:delete', (_e, id: string) => {
    storage!.deleteAgentConfig(id)
    return true
  })

  // === 工作流 ===
  ipcMain.handle('storage:workflow:list', () => storage!.listWorkflows())
  ipcMain.handle('storage:workflow:get', (_e, id: string) => storage!.getWorkflow(id))
  ipcMain.handle('storage:workflow:save', (_e, wf: Workflow) => {
    storage!.saveWorkflow(wf)
    return true
  })
  ipcMain.handle('storage:workflow:delete', (_e, id: string) => {
    storage!.deleteWorkflow(id)
    return true
  })

  // === 设置 ===
  ipcMain.handle('storage:setting:get', (_e, key: string) => storage!.getSetting(key))
  ipcMain.handle('storage:setting:set', (_e, key: string, value: string) => {
    storage!.setSetting(key, value)
    return true
  })

  // === 用量 ===
  ipcMain.handle('storage:usage:log', (_e, modelConfigId: string, usage: TokenUsage) => {
    storage!.logUsage(modelConfigId, usage)
    return true
  })
  ipcMain.handle('storage:usage:daily', (_e, date: string) => storage!.getDailyUsage(date))
  ipcMain.handle('storage:usage:monthly', (_e, yearMonth: string) => storage!.getMonthlyUsage(yearMonth))

  // === LLM 调用（主进程发起，避免渲染进程直接 fetch） ===
  ipcMain.handle('llm:chat', async (_event, config: ModelConfig, params: ModelParams, request: LLMRequest) => {
    const { AdapterFactory } = await import('@hubmind/core')
    const adapter = AdapterFactory.getAdapter(config.provider)
    const response = await adapter.chat(config, params, request)
    return response
  })

  // LLM 流式调用（通过 event.sender.send 回传每个 chunk）
  ipcMain.handle('llm:chatStream', async (event, config: ModelConfig, params: ModelParams, request: LLMRequest) => {
    const { AdapterFactory } = await import('@hubmind/core')
    const adapter = AdapterFactory.getAdapter(config.provider)

    try {
      const stream = adapter.chatStream(config, params, request)
      for await (const chunk of stream) {
        event.sender.send('llm:streamChunk', chunk)
      }
    } catch (err) {
      event.sender.send('llm:streamError', (err as Error).message)
    }

    return { success: true }
  })

  // 验证 API 连接

  // === 设置持久化 ===
  ipcMain.handle('settings:load', async () => {
    return storage?.getPref('app_settings') || null
  })

  ipcMain.handle('settings:save', async (_event, settings: unknown) => {
    storage?.setPref('app_settings', settings)
    return true
  })

  ipcMain.handle('llm:validate', async (_event, config: ModelConfig): Promise<ValidationResult> => {
    const { AdapterFactory } = await import('@hubmind/core')
    const adapter = AdapterFactory.getAdapter(config.provider)
    return adapter.validateConnection(config)
  })

  // === 文件解析 ===

  // === 图片转 Base64 ===

  // === 对话导出 ===
  ipcMain.handle('export:conversation', async (_event, conv: Conversation) => {
    try {
      const fs = await import('node:fs/promises')
      const result = await dialog.showSaveDialog(mainWindow!, {
        title: '导出对话',
        defaultPath: `${conv.title}.md`,
        filters: [
          { name: 'Markdown', extensions: ['md'] },
          { name: 'JSON', extensions: ['json'] },
        ],
      })
      if (result.canceled || !result.filePath) return { success: false, error: '取消' }

      const ext = result.filePath.split('.').pop()?.toLowerCase()
      if (ext === 'json') {
        await fs.writeFile(result.filePath, JSON.stringify(conv, null, 2), 'utf-8')
      } else {
        let md = `# ${conv.title}\n\n`
        for (const msg of conv.messages) {
          const role = msg.role === 'user' ? '🧑 用户' : msg.role === 'assistant' ? '🤖 AI' : '📋 系统'
          md += `### ${role}\n\n`
          for (const block of msg.content) {
            if (block.type === 'text') md += `${block.text}\n\n`
            else if (block.type === 'image') md += `![image](data:${block.mimeType};base64,${block.data.slice(0, 100)}...)\n\n`
          }
          md += `---\n\n`
        }
        await fs.writeFile(result.filePath, md, 'utf-8')
      }
      return { success: true, path: result.filePath }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('image:toBase64', async (_event, filePath: string) => {
    try {
      const fs = await import('node:fs/promises')
      const path = await import('node:path')
      const ext = path.extname(filePath).toLowerCase()
      const mimeMap: Record<string, string> = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
      }
      const mime = mimeMap[ext] || 'image/png'
      const buffer = await fs.readFile(filePath)
      const base64 = buffer.toString('base64')
      return { success: true, data: base64, mime, size: buffer.length }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  /** 增强解析结果：LaTeX 检测 + 阅读时间 */
  function enrichResult(input: { success: boolean; content: string; duration: number }): {
    success: boolean; content: string; duration: number;
    metadata?: { wordCount: number; readTime: string; hasLatex: boolean }
  } {
    const wc = input.content.split(/\s+/).filter(Boolean).length
    const latexPattern = /\\[a-zA-Z]+\{|\$\$|\$\s|[_\^]\{/g
    const hasLatex = latexPattern.test(input.content)
    let content = input.content
    if (hasLatex) content = '> ⚠️ 检测到 LaTeX 数学公式\n\n' + content
    return { ...input, content, metadata: { wordCount: wc, readTime: `${Math.max(1, Math.ceil(wc / 200))} 分钟`, hasLatex } }
  }

  ipcMain.handle('file:parse', async (_event, filePath: string, fileType: string) => {
    const startTime = Date.now()
    try {
      const fs = await import('node:fs/promises')

      switch (fileType) {
        case 'pdf': {
          const pdfParse = (await import('pdf-parse')).default
          const buffer = await fs.readFile(filePath)
          const data = await pdfParse(buffer)
          return {
            ...enrichResult({
              success: true,
              content: data.text,
              duration: Date.now() - startTime,
            }),
            pageCount: data.numpages,
          }
        }
        case 'docx':
        case 'doc': {
          const mammoth = await import('mammoth')
          const result = await mammoth.extractRawText({ path: filePath })
          return enrichResult({
            success: true,
            content: result.value,
            duration: Date.now() - startTime,
          })
        }
        case 'xlsx':
        case 'xls':
        case 'csv': {
          const XLSX = await import('xlsx')
          const workbook = XLSX.readFile(filePath)
          const sheets: Array<{ name: string; rows: unknown[] }> = []
          workbook.SheetNames.forEach((name) => {
            sheets.push({
              name,
              rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 }),
            })
          })
          // 转为 Markdown 表格
          let content = ''
          for (const sheet of sheets) {
            content += `## ${sheet.name}\n\n`
            if (sheet.rows.length === 0) { content += '(空表)\n\n'; continue }
            const rows = sheet.rows as unknown[][]
            // 表头
            content += '| ' + (rows[0] || []).map(String).join(' | ') + ' |\n'
            content += '| ' + (rows[0] || []).map(() => '---').join(' | ') + ' |\n'
            // 数据行（最多 100 行）
            for (const row of rows.slice(1, 101)) {
              content += '| ' + row.map(String).join(' | ') + ' |\n'
            }
            if (rows.length > 101) content += `\n*(共 ${rows.length - 1} 行数据，仅显示前 100 行)*\n\n`
          }
          return {
            success: true,
            content,
            structuredData: sheets,
            duration: Date.now() - startTime,
          }
        }
        case 'pptx':
        case 'ppt': {
          // pptx 解析简化版：提取文本
          const JSZip = await import('jszip')
          const buffer = await fs.readFile(filePath)
          const zip = await JSZip.loadAsync(buffer)
          const slides: string[] = []
          // 遍历 ppt/slides/slide*.xml
          const slideFiles = Object.keys(zip.files).filter((f) => f.match(/ppt\/slides\/slide\d+\.xml/))
          for (const file of slideFiles.sort()) {
            const xml = await zip.files[file].async('text')
            // 简单提取 <a:t> 标签中的文本
            const texts = [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)].map((m) => m[1])
            slides.push(texts.join(' '))
          }
          return {
            success: true,
            content: slides.map((s, i) => `幻灯片 ${i + 1}: ${s}`).join('\n\n'),
            duration: Date.now() - startTime,
          }
        }
        case 'txt':
        case 'md':
        default: {
          const content = await fs.readFile(filePath, 'utf-8')
          return enrichResult({
            success: true,
            content: content.slice(0, 100000),
            duration: Date.now() - startTime,
          })
        }
      }
    } catch (err) {
      return {
        success: false,
        content: '',
        error: (err as Error).message,
        duration: Date.now() - startTime,
      }
    }
  })

  // === Agent 运行时 ReAct 循环 ===

  /** Agent 工具定义 */
  function getAgentToolDefs(toolNames: string[]): Array<{ name: string; description: string; parameters: Record<string, unknown> }> {
    return toolNames.map((name) => {
      switch (name) {
        case 'shell_execute': return {
          name: 'shell_execute',
          description: '在本地终端执行Shell命令，返回输出结果',
          parameters: {
            type: 'object',
            properties: {
              command: { type: 'string', description: '要执行的命令' },
              cwd: { type: 'string', description: '工作目录(可选)' },
            },
            required: ['command'],
          },
        }
        case 'web_search': return {
          name: 'web_search',
          description: '联网搜索最新信息，返回结果摘要和链接',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: '搜索关键词' },
              num: { type: 'number', description: '结果数量，默认5' },
            },
            required: ['query'],
          },
        }
        case 'file_operations': return {
          name: 'file_operations',
          description: '读取、写入或列出本地文件',
          parameters: {
            type: 'object',
            properties: {
              action: { type: 'string', enum: ['read', 'write', 'list', 'delete'], description: '操作类型' },
              path: { type: 'string', description: '文件路径' },
              content: { type: 'string', description: '写入内容(write时)' },
            },
            required: ['action', 'path'],
          },
        }
        default: return { name, description: name, parameters: { type: 'object', properties: {} } }
      }
    })
  }

  /** 风险评级 */
  function evaluateRisk(toolName: string, args: Record<string, unknown>): 'low' | 'medium' | 'high' {
    switch (toolName) {
      case 'shell_execute': {
        const cmd = (args.command as string) || ''
        if (cmd.includes('rm ') || cmd.includes('sudo') || cmd.includes('chmod') || cmd.includes('> ')) return 'high'
        return 'low'
      }
      case 'file_operations': {
        if (args.action === 'delete' || args.action === 'write') return 'high'
        return 'low'
      }
      default: return 'low'
    }
  }

  /** 执行 Agent 工具并返回结果 */
  async function executeToolForAgent(toolName: string, args: Record<string, unknown>): Promise<{ success: boolean; result: string; error?: string }> {
    try {
      switch (toolName) {
        case 'shell_execute': {
          const command = args.command as string
          const dangerous = ['rm -rf', 'sudo', 'chmod 777', '> /dev/', 'mkfs', 'dd if=', ':(){']
          if (dangerous.some((p) => (command || '').includes(p))) return { success: false, result: '', error: '危险命令被拦截' }
          const { exec } = await import('node:child_process')
          return new Promise((resolve) => {
            const child = exec(command, { cwd: (args.cwd as string) || app.getPath('home'), timeout: 30000, maxBuffer: 1024 * 1024 * 5 })
            let stdout = ''; let stderr = ''
            child.stdout?.on('data', (d: string) => { stdout += d })
            child.stderr?.on('data', (d: string) => { stderr += d })
            child.on('close', (code) => resolve({ success: code === 0, result: (stdout || stderr).slice(0, 10000), error: code !== 0 ? stderr : undefined }))
            child.on('error', (err) => resolve({ success: false, result: '', error: err.message }))
          })
        }
        case 'web_search': {
          const query = args.query as string
          try {
            const resp = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`)
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
            const data = await resp.json() as { AbstractText?: string; RelatedTopics?: Array<{ Text: string; FirstURL: string }> }
            const results = [data.AbstractText].filter(Boolean) as string[]
            if (data.RelatedTopics) {
              for (const t of data.RelatedTopics.slice(0, (args.num as number) || 5)) {
                if (t.Text) results.push(`- ${t.Text} ${t.FirstURL || ''}`)
              }
            }
            return { success: true, result: results.join('\n') || '无结果' }
          } catch { return { success: true, result: `搜索 "${query}" 未获取到结果，请手动搜索` } }
        }
        case 'file_operations': {
          const fs = await import('node:fs/promises')
          const action = args.action as string
          switch (action) {
            case 'read': return { success: true, result: (await fs.readFile(args.path as string, 'utf-8')).slice(0, 50000) }
            case 'list': {
              const entries = await fs.readdir(args.path as string, { withFileTypes: true })
              return { success: true, result: entries.map((e) => `${e.isDirectory() ? '[DIR]' : '[FILE]'} ${e.name}`).join('\n') || '(空)' }
            }
            case 'write': { await fs.writeFile(args.path as string, (args.content as string) || '', 'utf-8'); return { success: true, result: '写入成功' } }
            default: return { success: false, result: '', error: `不支持的操作: ${action}` }
          }
        }
        default: return { success: false, result: '', error: `未知工具: ${toolName}` }
      }
    } catch (err) { return { success: false, result: '', error: (err as Error).message } }
  }

  ipcMain.handle('agent:run', async (event, agentConfig: AgentConfig, userMessage: string) => {
    const { AdapterFactory } = await import('@hubmind/core')
    const toolDefs = getAgentToolDefs(agentConfig.tools)
    const modelConfig = storage?.getModelConfig(agentConfig.modelConfigId)

    if (!modelConfig) {
      event.sender.send('agent:error', '未找到模型配置')
      return { success: false, error: '未找到模型配置' }
    }

    const adapter = AdapterFactory.getAdapter(modelConfig.provider)
    const conversation: Array<{ role: string; content: string }> = [
      { role: 'system', content: agentConfig.systemPrompt || '你是一个AI助手，可以使用工具完成任务。' },
      { role: 'user', content: userMessage },
    ]

    let steps = 0
    const maxSteps = agentConfig.maxSteps || 10

    try {
      while (steps < maxSteps) {
        steps++

        // 调用 LLM，带上工具定义
        const request: LLMRequest = {
          model: modelConfig.modelId,
          messages: conversation.map((m) => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content })),
          tools: toolDefs.length > 0 ? toolDefs.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) : undefined,
          stream: false,
        }

        event.sender.send('agent:step', { step: steps, type: 'thinking', message: `第 ${steps} 步推理中...` })

        const response = await adapter.chat(modelConfig, {
          temperature: 0.7, topP: 1, maxTokens: 4096,
          frequencyPenalty: 0, presencePenalty: 0, stop: [], jsonMode: false,
        }, request)

        // 检查是否有工具调用
        if (response.toolCalls && response.toolCalls.length > 0) {
          // 添加助手消息（含工具调用）
          conversation.push({ role: 'assistant', content: response.content || '(调用工具)' })

          for (const tc of response.toolCalls) {
            event.sender.send('agent:step', { step: steps, type: 'tool_call', tool: tc.name, args: tc.arguments })

            // 高危操作审批
            const risk = evaluateRisk(tc.name, tc.arguments)
            if (risk === 'high' && !agentConfig.autoApprove) {
              const ch = `agent:approval:${steps}:${Date.now()}`
              event.sender.send('agent:approval', { tool: tc.name, args: tc.arguments, risk, channel: ch })
              const approved = await new Promise<boolean>((resolve) => {
                ipcMain.handleOnce(ch, (_e, response: { approved: boolean }) => resolve(response.approved))
                setTimeout(() => { resolve(false) }, 30000)
              })
              if (!approved) {
                event.sender.send('agent:step', { step: steps, type: 'tool_result', tool: tc.name, result: '操作被用户拒绝' })
                conversation.push({ role: 'tool', content: `工具 ${tc.name}: 操作被用户拒绝` })
                continue
              }
            }

            // 执行工具
            const toolResult = await executeToolForAgent(tc.name, tc.arguments)
            event.sender.send('agent:step', {
              step: steps, type: 'tool_result', tool: tc.name,
              result: toolResult.success ? toolResult.result.substring(0, 5000) : `错误: ${toolResult.error}`,
            })

            // 添加工具结果到对话
            conversation.push({
              role: 'tool',
              content: `工具 ${tc.name} 结果: ${toolResult.success ? toolResult.result : toolResult.error}`,
            })
          }
        } else {
          // 纯文本响应 → 结束循环
          event.sender.send('agent:step', { step: steps, type: 'complete', message: response.content })
          event.sender.send('agent:done', { content: response.content, steps })
          return { success: true, content: response.content, steps }
        }
      }

      event.sender.send('agent:done', { content: '已达到最大迭代步数', steps: maxSteps })
      return { success: true, content: '已达到最大迭代步数', steps: maxSteps }
    } catch (err) {
      event.sender.send('agent:error', (err as Error).message)
      return { success: false, error: (err as Error).message }
    }
  })

  // === Agent 工具执行 ===
  // 执行 Agent 工具调用（带安全检查和审计）
  ipcMain.handle('agent:tool:execute', async (event, toolName: string, args: Record<string, unknown>) => {
    try {
      switch (toolName) {
        case 'shell_execute': {
          const command = args.command as string
          const cwd = args.cwd as string | undefined
          const timeout = (args.timeout as number) || 30000

          // 危险命令检测
          const dangerous = ['rm -rf', 'sudo', 'chmod 777', '> /dev/', 'mkfs', 'dd if=', ':(){']
          for (const pattern of dangerous) {
            if (command.includes(pattern)) {
              return { success: false, result: '', error: `危险命令被拦截: ${pattern}` }
            }
          }

          const { exec } = await import('node:child_process')
          return new Promise((resolve) => {
            const child = exec(command, {
              cwd: cwd || app.getPath('home'),
              timeout,
              maxBuffer: 1024 * 1024 * 5,
            })
            let stdout = ''
            let stderr = ''
            child.stdout?.on('data', (data) => { stdout += data })
            child.stderr?.on('data', (data) => { stderr += data })
            child.on('close', (code) => {
              resolve({ success: code === 0, result: stdout || stderr, error: code !== 0 ? stderr : undefined })
            })
            child.on('error', (err) => {
              resolve({ success: false, result: '', error: err.message })
            })
          })
        }

        case 'file_operations': {
          const action = args.action as string
          const filePath = args.path as string

          switch (action) {
            case 'read': {
              const fs = await import('node:fs/promises')
              const content = await fs.readFile(filePath, 'utf-8')
              // 截断大文件
              return { success: true, result: content.slice(0, 50000) }
            }
            case 'write': {
              const content = args.content as string
              const fs = await import('node:fs/promises')
              await fs.writeFile(filePath, content, 'utf-8')
              return { success: true, result: `文件写入成功: ${filePath}` }
            }
            case 'list': {
              const fs = await import('node:fs/promises')
              const path = await import('node:path')
              const entries = await fs.readdir(filePath, { withFileTypes: true })
              const listing = entries.map((e) => `${e.isDirectory() ? '[DIR]' : '[FILE]'} ${e.name}`)
              return { success: true, result: listing.join('\n') || '(空目录)' }
            }
            case 'delete': {
              const fs = await import('node:fs/promises')
              await fs.unlink(filePath)
              return { success: true, result: `文件已删除: ${filePath}` }
            }
            default:
              return { success: false, result: '', error: `不支持的文件操作: ${action}` }
          }
        }

        case 'web_search': {
          // 使用内置 web fetch 进行搜索（DuckDuckGo 或 Bing）
          const query = args.query as string
          const num = (args.num as number) || 5
          try {
            const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`
            const response = await fetch(searchUrl)
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            const data = await response.json() as { AbstractText?: string; RelatedTopics?: Array<{ Text: string; FirstURL: string }> }
            const results: string[] = []
            if (data.AbstractText) results.push(data.AbstractText)
            if (data.RelatedTopics) {
              for (const topic of data.RelatedTopics.slice(0, num)) {
                if (topic.Text) results.push(`- ${topic.Text} ${topic.FirstURL ? `(${topic.FirstURL})` : ''}`)
              }
            }
            return { success: true, result: results.join('\n') || `未找到关于 "${query}" 的搜索结果` }
          } catch (err) {
            // DuckDuckGo 降级：返回提示
            return { success: true, result: `[联网搜索] 查询: "${query}"。建议手动搜索或配置搜索引擎 API。错误: ${(err as Error).message}` }
          }
        }

        default:
          return { success: false, result: '', error: `未知工具: ${toolName}` }
      }
    } catch (err) {
      return { success: false, result: '', error: (err as Error).message }
    }
  })
}

