import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Paperclip, Loader2, Settings, XCircle, Copy, Check, Columns2, Image, X, Download, RefreshCw, GitBranch } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import { useChatStore, useModelStore } from '../stores'
import { api } from '../lib/api'
import { ModelConfigPanel } from '../components/model-manager/ModelConfigPanel'
import type { ModelConfig, Message, ContentBlock, LLMRequest, StreamChunk, ModelParams } from '@hubmind/shared'
import { DEFAULT_MODEL_PARAMS } from '@hubmind/shared'
import 'highlight.js/styles/github-dark.css'

/** 代码块组件（支持复制） */
function CodeBlock({ language, children }: { language?: string; children: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  const handleCopy = () => {
    navigator.clipboard.writeText(children)
    setCopied(true)
  }

  return (
    <div className="group relative my-2 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-600">
      <div className="flex items-center justify-between bg-gray-100 px-3 py-1.5 dark:bg-gray-800">
        <span className="text-xs text-gray-500">{language || 'code'}</span>
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs text-gray-400 opacity-0 transition-opacity hover:bg-gray-200 group-hover:opacity-100 dark:hover:bg-gray-700"
        >
          {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre className="overflow-x-auto bg-gray-50 p-3 text-sm leading-relaxed dark:bg-[#0d1117]">
        <code>{children}</code>
      </pre>
    </div>
  )
}

/**
 * 聊天主页面
 */
export function ChatPage() {
  const {
    conversations, activeConversationId, streamingMessage, isStreaming,
    addMessage, appendStreamChunk, clearStreaming, setStreaming,
    createConversation, deleteConversation, setActiveConversation,
  } = useChatStore()

  const { modelConfigs, activeModelId } = useModelStore()

  const [input, setInput] = useState('')
  const [showModelPanel, setShowModelPanel] = useState(false)
  const [compareMode, setCompareMode] = useState(false)
  const [compareModelIds, setCompareModelIds] = useState<string[]>([])
  const [compareResponses, setCompareResponses] = useState<Record<string, string>>({})
  const [attachedImages, setAttachedImages] = useState<Array<{ path: string; data: string; mime: string; name: string }>>([])
  const [error, setError] = useState<string | null>(null)
  const msgEndRef = useRef<HTMLDivElement>(null)

  const activeConv = conversations.find((c) => c.id === activeConversationId)
  const activeModel = modelConfigs.find((m) => m.id === activeModelId)
  const initRef = useRef(false)

  // 初始化：确保有活跃对话（仅首次）
  useEffect(() => {
    if (initRef.current) return
    if (!activeConversationId && conversations.length === 0) {
      createConversation()
    }
    initRef.current = true
  }, [activeConversationId, conversations.length, createConversation])

  // 自动滚动到底部
  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeConv?.messages, streamingMessage])

  // 发送消息
  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming) return

    let convId = activeConversationId
    if (!convId) {
      // 没有活跃对话时自动创建
      try {
        convId = await createConversation()
      } catch (err) {
        setError(`创建对话失败: ${(err as Error).message}`)
        return
      }
    }

    if (compareMode && compareModelIds.length === 0) {
      setError('请至少选择一个模型进行对比')
      clearStreaming()
      return
    }
    if (!compareMode && !activeModel) {
      setError('请先在模型管理中配置并选择一个模型')
      return
    }

    setError(null)
    const userText = input.trim()
    setInput('')
    const images = [...attachedImages]
    setAttachedImages([])

    // 添加用户消息（含图片）
    const userContent: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> = [
      { type: 'text', text: userText },
    ]
    for (const img of images) {
      userContent.push({ type: 'image', data: img.data, mimeType: img.mime })
    }

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userContent,
      createdAt: Date.now(),
    }
    addMessage(convId, userMsg)
    setStreaming(true)

    // 构建请求消息体
    const messages = (activeConv?.messages || []).map((m) => ({
      role: m.role,
      content: m.content.map((c) =>
        c.type === 'text' ? { type: 'text' as const, text: c.text }
        : c.type === 'image' ? { type: 'image' as const, data: c.data, mimeType: c.mimeType }
        : c,
      ),
    }))
    // 追加当前用户消息
    const userMsgForModel: { role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> } = {
      role: 'user' as const,
      content: userText,
    }
    if (images.length > 0) {
      const parts: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [
        { type: 'text', text: userText },
      ]
      for (const img of images) {
        parts.push({ type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.data}` } })
      }
      userMsgForModel.content = parts as unknown as Array<{ type: string; text?: string; image_url?: { url: string } }>
    }

    const params: ModelParams = { ...DEFAULT_MODEL_PARAMS }

    if (compareMode) {
      // === 对比模式：并发请求多个模型 ===
      setCompareResponses({})
      const models = compareModelIds.map((id) => modelConfigs.find((m) => m.id === id)).filter(Boolean) as ModelConfig[]
      if (models.length === 0) { setError('未找到选中的模型'); clearStreaming(); return }

      const responses: Record<string, string> = {}

      await Promise.allSettled(
        models.map(async (model) => {
          let content = ''
          try {
            await api.llm.chatStream(
              model,
              params,
              { model: model.modelId, messages: [...messages, userMsgForModel], stream: true },
              (chunk: StreamChunk) => {
                if (chunk.delta) {
                  content += chunk.delta
                  responses[model.id] = content
                  setCompareResponses({ ...responses })
                }
              },
              (err: string) => {
                responses[model.id] = `错误: ${err}`
                setCompareResponses({ ...responses })
              },
            )
          } catch (err) {
            responses[model.id] = `请求失败: ${(err as Error).message}`
            setCompareResponses({ ...responses })
          }
        }),
      )

      // 保存对比结果
      const modelsContent = models.map((m) => `**${m.name}**\n\n${responses[m.id] || '(无响应)'}`).join('\n\n---\n\n')
      addMessage(convId, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: [{ type: 'text', text: modelsContent }],
        modelId: models[0]?.modelId,
        createdAt: Date.now(),
      })
    } else {
      // === 单模型模式 ===
      try {
        const request: LLMRequest = {
          model: activeModel!.modelId,
          messages: [...messages, userMsgForModel],
          stream: true,
        }

        let fullContent = ''

        await api.llm.chatStream(
          activeModel!,
          params,
          request,
          (chunk: StreamChunk) => {
            if (chunk.delta) {
              fullContent += chunk.delta
              appendStreamChunk(chunk.delta)
            }
          },
          (err: string) => {
            setError(`API 错误: ${err}`)
          },
        )

        if (fullContent) {
          addMessage(convId, {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: [{ type: 'text', text: fullContent }],
            modelId: activeModel!.modelId,
            createdAt: Date.now(),
          })
        }
      } catch (err) {
        setError(`请求失败: ${(err as Error).message}`)
      }
    }

    clearStreaming()
    setCompareResponses({})
  }, [input, isStreaming, activeConversationId, activeModel, compareMode, compareModelIds, modelConfigs, activeConv, addMessage, appendStreamChunk, clearStreaming, setStreaming, createConversation])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex h-full flex-col" style={{ padding: '0 24px 24px 24px' }}>
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between border-b border-gray-200/80 px-6 py-2.5 dark:border-gray-700/50">
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-medium text-gray-500">
            {compareMode
              ? `对比模式 (${compareModelIds.length} 个模型)`
              : activeModel ? activeModel.name : '未选择模型'}
          </span>
          {!compareMode && activeModel && (
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${activeModel.enabled ? 'bg-emerald-500' : 'bg-gray-300'}`} />
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setCompareMode(!compareMode)
              if (compareMode) { setCompareModelIds([]); setCompareResponses({}) }
            }}
            className={`rounded-lg p-2 transition-all ${
              compareMode
                ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300'
            }`}
            title="模型对比"
          >
            <Columns2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowModelPanel(!showModelPanel)}
            className={`rounded-lg p-2 transition-all ${
              showModelPanel
                ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300'
            }`}
            title="模型管理"
          >
            <Settings className="h-4 w-4" />
          </button>
          {activeConv && activeConv.messages.length > 0 && (
            <button
              onClick={async () => {
                const result = await api.exportConv(activeConv)
                if (result.error) setError(`导出失败: ${result.error}`)
              }}
              className="rounded-lg p-2 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
              title="导出对话"
            >
              <Download className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* 对比模式 - 模型选择器 */}
      {compareMode && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-200 bg-gray-50 px-4 py-2 dark:border-gray-700 dark:bg-[#0f0f23]">
          {modelConfigs.filter((m) => m.enabled).map((m) => (
            <button
              key={m.id}
              onClick={() => setCompareModelIds((prev) =>
                prev.includes(m.id) ? prev.filter((id) => id !== m.id) : [...prev, m.id]
              )}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                compareModelIds.includes(m.id)
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100 dark:bg-[#1a1a2e] dark:text-gray-400 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600'
              }`}
            >
              {m.name}
            </button>
          ))}
          {compareModelIds.length > 0 && (
            <button
              onClick={() => setCompareModelIds([])}
              className="ml-2 text-xs text-gray-400 hover:text-gray-600"
            >
              清除
            </button>
          )}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* 消息区域 */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {/* 错误提示 */}
            {error && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                <XCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
                <button
                  onClick={() => setError(null)}
                  className="ml-auto text-red-400 hover:text-red-600"
                >
                  <XCircle className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* 空状态 */}
            {!activeConv?.messages.length && !isStreaming && (
              <div className="flex h-full flex-col items-center justify-center text-gray-400">
                <h2 className="mb-2 text-xl font-semibold text-gray-500 dark:text-gray-300">
                  HubMind
                </h2>
                <p className="text-sm">
                  {activeModel ? '开始对话' : '请先配置模型（点击右上角齿轮图标）'}
                </p>
              </div>
            )}

            {/* 对比模式 — 实时分栏面板 */}
            {compareMode && isStreaming && Object.keys(compareResponses).length > 0 && (
              <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-800 dark:bg-blue-900/10">
                <div className="mb-2 text-xs font-medium text-blue-600 dark:text-blue-400">对比结果</div>
                <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(compareModelIds.length, 3)}, 1fr)` }}>
                  {compareModelIds.map((id) => {
                    const model = modelConfigs.find((m) => m.id === id)
                    return (
                      <div key={id} className="rounded border border-gray-200 bg-white p-2 dark:border-gray-600 dark:bg-[#0f0f23]">
                        <div className="mb-1 text-xs font-semibold text-gray-500">{model?.name || id}</div>
                        <div className="max-h-[300px] overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-gray-700 dark:text-gray-300">
                          {compareResponses[id] || <span className="animate-pulse text-gray-400">等待中...</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 消息列表 */}
            {activeConv?.messages.map((msg) => (
              <div
                key={msg.id}
                className={`mb-3 flex group ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'markdown-body bg-white text-gray-700 dark:bg-[#1a1a3a] dark:text-gray-200 border border-gray-100 dark:border-gray-700'
                  }`}
                >
                  {msg.content.map((block, i) => {
                    if (block.type === 'text') {
                      if (msg.role === 'user') {
                        return <p key={i} className="whitespace-pre-wrap">{block.text}</p>
                      }
                      return (
                        <ReactMarkdown
                          key={i}
                          rehypePlugins={[rehypeHighlight]}
                          components={{
                            code({ className, children, ...props }) {
                              const match = /language-(\w+)/.exec(className || '')
                              const inline = !match
                              if (inline) {
                                return <code className="rounded bg-black/10 px-1 py-0.5 text-xs dark:bg-white/10" {...props}>{children}</code>
                              }
                              return <CodeBlock language={match[1]}>{String(children).replace(/\n$/, '')}</CodeBlock>
                            },
                            pre({ children }) {
                              return <>{children}</>
                            },
                          }}
                        >
                          {block.text}
                        </ReactMarkdown>
                      )
                    }
                    if (block.type === 'image') {
                      return (
                        <div key={i} className="mb-1">
                          <img
                            src={`data:${block.mimeType};base64,${block.data}`}
                            alt="attached"
                            className="max-h-48 max-w-full rounded-lg object-contain"
                          />
                        </div>
                      )
                    }
                    return null
                  })}
                  {/* 操作按钮 */}
                  <div className="mt-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={async () => {
                        if (!activeConv) return
                        // 分叉：创建新对话，复制消息
                        const forkTitle = `分支: ${activeConv.title}`
                        const newId = await createConversation(forkTitle)
                        const msgIndex = activeConv.messages.indexOf(msg)
                        if (msgIndex >= 0) {
                          const forkedMsgs = activeConv.messages.slice(0, msgIndex + 1)
                          for (const m of forkedMsgs) {
                            addMessage(newId, { ...m, id: crypto.randomUUID() })
                          }
                        }
                      }}
                      className="rounded px-1.5 py-0.5 text-[10px] text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700"
                      title="从此处分叉"
                    >
                      <GitBranch className="mr-0.5 inline-block h-3 w-3" />
                      分叉
                    </button>
                    {msg.role === 'assistant' && msg.id === activeConv?.messages[activeConv.messages.length - 1]?.id && (
                      <button
                        onClick={async () => {
                          if (!activeConv) return
                          // 删除最后一条消息
                          useChatStore.setState((s) => ({
                            conversations: s.conversations.map((c) =>
                              c.id === activeConv.id
                                ? { ...c, messages: c.messages.slice(0, -1) }
                                : c
                            ),
                          }))
                        }}
                        className="rounded px-1.5 py-0.5 text-[10px] text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700"
                        title="重新生成"
                      >
                        <RefreshCw className="mr-0.5 inline-block h-3 w-3" />
                        重新生成
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* 流式输出 */}
            {isStreaming && streamingMessage && (
              <div className="mb-4 flex justify-start">
                <div className="max-w-[75%] rounded-xl bg-gray-100 px-4 py-2.5 text-sm leading-relaxed text-gray-800 dark:bg-gray-800 dark:text-gray-200">
                  <span className="whitespace-pre-wrap">{streamingMessage}</span>
                  <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-blue-500" />
                </div>
              </div>
            )}

            <div ref={msgEndRef} />
          </div>

          {/* 输入区域 */}
          <div className="border-t border-gray-200/80 bg-white/90 px-6 py-4 dark:border-gray-700/50 dark:bg-[#12122a]/90">
            {/* 图片预览 */}
            {attachedImages.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {attachedImages.map((img, i) => (
                  <div key={i} className="group relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-600">
                    <img
                      src={`data:${img.mime};base64,${img.data}`}
                      alt={img.name}
                      className="h-full w-full object-cover"
                    />
                    <button
                      onClick={() => setAttachedImages((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute right-0.5 top-0.5 rounded-full bg-black/50 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <span className="absolute bottom-0 left-0 right-0 truncate bg-black/50 px-1 text-[8px] text-white">
                      {img.name.length > 8 ? img.name.slice(0, 8) + '..' : img.name}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="mx-auto flex max-w-3xl items-end gap-2">
              <button
                className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
                title="上传文件"
                onClick={async () => {
                  const files = await window.electronAPI.selectFile()
                  if (files.length === 0) return
                  const filePath = files[0]
                  const ext = filePath.split('.').pop()?.toLowerCase() || ''
                  const fileName = filePath.split(/[/\\]/).pop() || filePath
                  setError(null)

                  // 图片：转 base64 预览，发给视觉模型
                  if (['jpg','jpeg','png','gif','webp','bmp'].includes(ext)) {
                    try {
                      const result = await api.image.toBase64(filePath)
                      if (result.success && result.data) {
                        setAttachedImages((prev) => [...prev, { path: filePath, data: result.data!, mime: result.mime!, name: fileName }])
                      } else {
                        setError('图片加载失败')
                      }
                    } catch {
                      setError('图片处理服务暂不可用')
                    }
                    return
                  }

                  // 文档类：解析为文本
                  const extToType: Record<string, string> = {
                    pdf: 'pdf', docx: 'docx', doc: 'doc',
                    xlsx: 'xlsx', xls: 'xls', csv: 'csv',
                    pptx: 'pptx', ppt: 'ppt',
                    txt: 'txt', md: 'md',
                  }
                  const fileType = extToType[ext] || 'txt'
                  if (['pdf','docx','doc','xlsx','xls','csv','pptx','ppt','txt','md'].includes(fileType)) {
                    try {
                      const result = await api.file.parse(filePath, fileType)
                      if (result.success) {
                        setInput((prev) => prev + `\n\n--- 文件: ${fileName} ---\n${result.content}\n--- 文件结束 ---\n`)
                      } else {
                        setError(`文件解析失败: ${result.error}`)
                      }
                    } catch {
                      setError('文件解析服务暂不可用')
                    }
                  }
                }}
              >
                <Paperclip className="h-5 w-5" />
              </button>

              <div className="relative flex-1">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={compareMode
                    ? compareModelIds.length > 0 ? '输入对比问题...(Enter 发送)'
                    : '请先选择要对比的模型'
                    : activeModel ? '输入消息...(Enter 发送, Shift+Enter 换行)'
                    : '请先配置模型'}
                  rows={1}
                  className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 pr-10 text-sm text-gray-700 outline-none transition-all placeholder:text-gray-400 focus:border-blue-400 focus:bg-white focus:shadow-sm dark:border-gray-600 dark:bg-[#0f0f23] dark:text-gray-200 dark:focus:border-blue-500 dark:focus:bg-[#0f0f23]"
                  disabled={isStreaming || (!compareMode && !activeModel)}
                />
              </div>

              <button
                onClick={handleSend}
                disabled={!input.trim() || isStreaming || (!compareMode && !activeModel)}
                className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm transition-all hover:bg-blue-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isStreaming ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 模型配置面板（侧滑） */}
        {showModelPanel && (
          <div className="w-[360px] flex-shrink-0 border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-[#1a1a2e]">
            <ModelConfigPanel onClose={() => setShowModelPanel(false)} />
          </div>
        )}
      </div>
    </div>
  )
}
