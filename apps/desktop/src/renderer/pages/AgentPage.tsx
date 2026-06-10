import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, Play, Square, Bot, Wrench, Shield, Terminal, Loader2 } from 'lucide-react'
import { useAgentStore, useModelStore, useChatStore } from '../stores'
import { api } from '../lib/api'
import type { AgentConfig, AgentMode, ModelConfig } from '@hubmind/shared'

/**
 * Agent 页面 - 智能体管理、配置与执行
 */
export function AgentPage() {
  const {
    agents, activeAgentId, executingAgents,
    loadAgents, addAgent, updateAgent, deleteAgent, setActiveAgent,
    markExecuting, markDone,
  } = useAgentStore()
  const { modelConfigs } = useModelStore()
  const { activeConversationId, addMessage } = useChatStore()

  const [showConfig, setShowConfig] = useState(false)
  const [showConsole, setShowConsole] = useState(false)
  const [consoleLogs, setConsoleLogs] = useState<Array<{ time: string; type: 'thought' | 'tool' | 'result' | 'error'; text: string }>>([])
  const [editingAgent, setEditingAgent] = useState<Partial<AgentConfig> | null>(null)
  const [loading, setLoading] = useState(true)
  const [approval, setApproval] = useState<{ tool: string; args: Record<string, unknown>; channel: string } | null>(null)

  useEffect(() => { loadAgents().then(() => setLoading(false)) }, [])

  const activeAgent = agents.find((a) => a.id === activeAgentId)
  const isRunning = activeAgentId ? executingAgents.includes(activeAgentId) : false
  const enabledModels = modelConfigs.filter((m) => m.enabled)

  const addLog = (type: 'thought' | 'tool' | 'result' | 'error', text: string) => {
    setConsoleLogs((prev) => [...prev, { time: new Date().toLocaleTimeString(), type, text }])
  }

  // 创建新 Agent
  const handleCreate = async () => {
    const id = crypto.randomUUID()
    const agent: AgentConfig = {
      id,
      name: `Agent ${agents.length + 1}`,
      description: '',
      systemPrompt: '你是一个专业的 AI 助手。',
      modelConfigId: enabledModels[0]?.id || '',
      tools: ['web_search', 'file_operations'],
      mode: 'agent',
      maxSteps: 10,
      autoApprove: false,
    }
    await addAgent(agent)
    setActiveAgent(id)
    setEditingAgent(agent)
    setShowConfig(true)
  }

  // 保存编辑
  const handleSave = async () => {
    if (!editingAgent || !activeAgentId) return
    await updateAgent(activeAgentId, editingAgent)
    setShowConfig(false)
  }

  // 删除 Agent
  const handleDelete = async (id: string) => {
    await deleteAgent(id)
    if (activeAgentId === id) {
      setActiveAgent(agents.find((a) => a.id !== id)?.id || '')
    }
  }

  // 执行 Agent
  const handleRun = async () => {
    if (!activeAgent || isRunning) return
    markExecuting(activeAgent.id)
    setConsoleLogs([])
    setShowConsole(true)

    const modelConfig = modelConfigs.find((m) => m.id === activeAgent.modelConfigId)
    if (!modelConfig) {
      addLog('error', '未配置模型，请先在模型管理中添加模型')
      markDone(activeAgent.id)
      return
    }

    addLog('thought', `启动 Agent: ${activeAgent.name}`)
    addLog('thought', `使用模型: ${modelConfig.name}`)
    addLog('thought', `可用工具: ${activeAgent.tools.join(', ') || '无'}`)
    addLog('thought', '开始 ReAct 循环...')

    // 监听 ReAct 循环事件
    const onStep = (_event: unknown, data: { step: number; type: string; message?: string; tool?: string; args?: unknown; result?: string }) => {
      if (data.type === 'thinking') addLog('thought', data.message || '')
      else if (data.type === 'tool_call') addLog('tool', `调用工具: ${data.tool}(${JSON.stringify(data.args)})`)
      else if (data.type === 'tool_result') addLog('result', `工具结果: ${data.result}`)
      else if (data.type === 'complete') addLog('result', data.message || '')
    }

    const onDone = () => {
      cleanup()
      markDone(activeAgent!.id)
      addLog('thought', 'Agent 执行完成')
    }

    const onError = (_event: unknown, error: string) => {
      addLog('error', error)
      onDone()
    }

    window.electronAPI.on('agent:step', onStep)
    window.electronAPI.on('agent:done', onDone)
    window.electronAPI.on('agent:error', onError)

    // 监听审批请求
    const onApproval = (_event: unknown, data: { tool: string; args: Record<string, unknown>; risk: string; channel: string }) => {
      addLog('tool', `⚠ 需要审批: ${data.tool}(${JSON.stringify(data.args)})`)
      setApproval({ tool: data.tool, args: data.args, channel: data.channel })
    }
    window.electronAPI.on('agent:approval', onApproval)

    const cleanup = () => {
      window.electronAPI.off('agent:step', onStep)
      window.electronAPI.off('agent:done', onDone)
      window.electronAPI.off('agent:error', onError)
      window.electronAPI.off('agent:approval', onApproval)
    }
    cleanupRef.current = cleanup

    try {
      const result = await api.agents.run(
        activeAgent,
        `你好，请介绍一下你能帮我做什么？`,
      )
      if (!result.success) addLog('error', result.error || '执行失败')
    } catch (err) {
      addLog('error', `执行失败: ${(err as Error).message}`)
      cleanup()
      markDone(activeAgent.id)
    }
  }

  // 工具名称映射
  const toolLabels: Record<string, string> = {
    shell_execute: 'Shell 命令',
    web_search: '联网搜索',
    file_operations: '文件操作',
  }

  const toolIcons: Record<string, React.ReactNode> = {
    shell_execute: <Terminal className="h-3.5 w-3.5" />,
    web_search: <Globe className="h-3.5 w-3.5" />,
    file_operations: <FileCode className="h-3.5 w-3.5" />,
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center text-gray-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
  }

  return (
    <div className="flex h-full" style={{ padding: '24px' }}>
      {/* Agent 列表 */}
      <div className="flex w-[260px] flex-shrink-0 flex-col border-r border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-[#12122a]">
        <div className="border-b border-gray-200 p-3 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Agent 列表</h2>
            <button
              onClick={handleCreate}
              className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {agents.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-gray-400">暂无 Agent，点击 + 创建</p>
          ) : (
            agents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => setActiveAgent(agent.id)}
                className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-sm transition-colors ${
                  activeAgentId === agent.id
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                }`}
              >
                <Bot className="h-4 w-4 flex-shrink-0" />
                <div className="flex-1 truncate text-left">
                  <div className="truncate font-medium">{agent.name}</div>
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <span>{agent.mode}</span>
                    <span>·</span>
                    <span>{agent.tools.length} 个工具</span>
                  </div>
                </div>
                {executingAgents.includes(agent.id) && (
                  <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-blue-500" />
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(agent.id) }}
                  className="flex-shrink-0 rounded p-0.5 text-gray-300 opacity-0 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 dark:hover:bg-red-900/30"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </button>
            ))
          )}
        </div>
      </div>

      {/* 右侧主区域 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {!activeAgent ? (
          <div className="flex h-full flex-col items-center justify-center text-gray-400">
            <Bot className="mb-4 h-12 w-12" />
            <p className="text-lg font-medium">选择或创建一个 Agent</p>
            <p className="mt-1 text-sm">Agent 可以自主调用工具完成复杂任务</p>
          </div>
        ) : (
          <>
            {/* 顶部工具栏 */}
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <span className="font-medium text-sm">{activeAgent.name}</span>
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500 dark:bg-gray-700">
                  {activeAgent.mode}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setEditingAgent(activeAgent); setShowConfig(true) }}
                  className="rounded px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Wrench className="mr-1 inline-block h-3.5 w-3.5" />
                  配置
                </button>
                <button
                  onClick={() => setShowConsole(!showConsole)}
                  className={`rounded px-3 py-1.5 text-xs ${
                    showConsole ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <Terminal className="mr-1 inline-block h-3.5 w-3.5" />
                  控制台
                </button>
                <button
                  onClick={handleRun}
                  disabled={isRunning}
                  className={`inline-flex items-center gap-1.5 rounded px-4 py-1.5 text-xs font-medium text-white transition-colors ${
                    isRunning
                      ? 'cursor-not-allowed bg-gray-400'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {isRunning ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  {isRunning ? '运行中' : '运行'}
                </button>
              </div>
            </div>

            {/* 主内容 */}
            <div className={`flex flex-1 overflow-hidden ${showConsole ? '' : ''}`}>
              {/* Agent 配置面板 */}
              <div className={`${showConsole ? 'flex-1' : 'flex-1'} overflow-y-auto p-6`}>
                {/* 系统提示词 */}
                <div className="mb-6">
                  <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">系统提示词</h3>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-600 dark:bg-[#0f0f23]">
                    <p className="whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-400">
                      {activeAgent.systemPrompt || '未设置'}
                    </p>
                  </div>
                </div>

                {/* 工具列表 */}
                <div className="mb-6">
                  <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">已启用工具</h3>
                  {activeAgent.tools.length === 0 ? (
                    <p className="text-sm text-gray-400">未启用任何工具</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {activeAgent.tools.map((toolName) => (
                        <div
                          key={toolName}
                          className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-600"
                        >
                          <span className="text-gray-500">{toolIcons[toolName]}</span>
                          <span className="text-sm">{toolLabels[toolName] || toolName}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 安全设置 */}
                <div className="mb-6">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <Shield className="h-4 w-4" /> 安全设置
                  </h3>
                  <div className="space-y-2 rounded-lg border border-gray-200 p-4 dark:border-gray-600">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">自动批准操作</span>
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                        activeAgent.autoApprove
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      }`}>
                        {activeAgent.autoApprove ? '高风险' : '安全'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">最大迭代步数</span>
                      <span className="text-sm font-medium">{activeAgent.maxSteps}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">执行模式</span>
                      <span className="text-sm font-medium capitalize">{activeAgent.mode}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 控制台面板 */}
              {showConsole && (
                <div className="w-[420px] flex-shrink-0 border-l border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-[#0a0a1a]">
                  <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2 dark:border-gray-700">
                    <h3 className="text-sm font-medium">执行控制台</h3>
                    <button
                      onClick={() => {
                        if (isRunning) markDone(activeAgent.id)
                      }}
                      className="rounded p-1 text-gray-400 hover:text-red-500"
                    >
                      <Square className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="h-full overflow-y-auto p-4 font-mono text-xs">
                    {consoleLogs.length === 0 ? (
                      <p className="text-gray-400">等待执行...</p>
                    ) : (
                      consoleLogs.map((log, i) => (
                        <div key={i} className="mb-2">
                          <span className="text-gray-500">[{log.time}]</span>{' '}
                          <span className={
                            log.type === 'error' ? 'text-red-500' :
                            log.type === 'tool' ? 'text-yellow-500' :
                            log.type === 'result' ? 'text-green-500' :
                            'text-blue-400'
                          }>
                            {log.type === 'thought' && '💭'}
                            {log.type === 'tool' && '🔧'}
                            {log.type === 'result' && '✅'}
                            {log.type === 'error' && '❌'}
                          </span>{' '}
                          <span className="text-gray-300">{log.text}</span>
                        </div>
                      ))
                    )}
                    {isRunning && (
                      <div className="mt-2 flex items-center gap-2 text-blue-400">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>执行中...</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 配置侧滑面板 */}
            {showConfig && editingAgent && (
              <div className="absolute inset-0 z-20 flex justify-end bg-black/30" onClick={() => setShowConfig(false)}>
                <div
                  className="h-full w-[420px] overflow-y-auto border-l border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-[#1a1a2e]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h2 className="mb-6 text-lg font-semibold">编辑 Agent</h2>

                  {/* 名称 */}
                  <div className="mb-4">
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">名称</label>
                    <input
                      value={editingAgent.name || ''}
                      onChange={(e) => setEditingAgent({ ...editingAgent, name: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-[#0f0f23] dark:text-gray-200"
                    />
                  </div>

                  {/* 描述 */}
                  <div className="mb-4">
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">描述</label>
                    <input
                      value={editingAgent.description || ''}
                      onChange={(e) => setEditingAgent({ ...editingAgent, description: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-[#0f0f23] dark:text-gray-200"
                    />
                  </div>

                  {/* 模型选择 */}
                  <div className="mb-4">
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">使用模型</label>
                    <select
                      value={editingAgent.modelConfigId || ''}
                      onChange={(e) => setEditingAgent({ ...editingAgent, modelConfigId: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-[#0f0f23] dark:text-gray-200"
                    >
                      {enabledModels.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* 系统提示词 */}
                  <div className="mb-4">
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">系统提示词</label>
                    <textarea
                      value={editingAgent.systemPrompt || ''}
                      onChange={(e) => setEditingAgent({ ...editingAgent, systemPrompt: e.target.value })}
                      rows={4}
                      className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-[#0f0f23] dark:text-gray-200"
                    />
                  </div>

                  {/* 工具选择 */}
                  <div className="mb-4">
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">工具</label>
                    <div className="space-y-1 rounded-lg border border-gray-200 p-2 dark:border-gray-600">
                      {['shell_execute', 'web_search', 'file_operations'].map((tool) => (
                        <label key={tool} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700">
                          <input
                            type="checkbox"
                            checked={(editingAgent.tools || []).includes(tool)}
                            onChange={(e) => {
                              const tools = editingAgent.tools || []
                              setEditingAgent({
                                ...editingAgent,
                                tools: e.target.checked
                                  ? [...tools, tool]
                                  : tools.filter((t) => t !== tool),
                              })
                            }}
                            className="h-4 w-4"
                          />
                          <span className="text-gray-500">{toolIcons[tool]}</span>
                          <span className="text-sm">{toolLabels[tool]}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* 执行模式 */}
                  <div className="mb-4">
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">执行模式</label>
                    <select
                      value={editingAgent.mode || 'agent'}
                      onChange={(e) => setEditingAgent({ ...editingAgent, mode: e.target.value as AgentMode })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-[#0f0f23] dark:text-gray-200"
                    >
                      <option value="chat">聊天模式</option>
                      <option value="agent">Agent 模式</option>
                      <option value="workflow">工作流模式</option>
                    </select>
                  </div>

                  {/* 最大步数 */}
                  <div className="mb-4">
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">最大迭代步数: {editingAgent.maxSteps || 10}</label>
                    <input
                      type="range"
                      min={1}
                      max={50}
                      value={editingAgent.maxSteps || 10}
                      onChange={(e) => setEditingAgent({ ...editingAgent, maxSteps: Number(e.target.value) })}
                      className="w-full"
                    />
                  </div>

                  {/* 自动批准 */}
                  <div className="mb-6">
                    <label className="flex cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        checked={editingAgent.autoApprove || false}
                        onChange={(e) => setEditingAgent({ ...editingAgent, autoApprove: e.target.checked })}
                        className="h-4 w-4"
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-700 dark:text-gray-300">自动批准</div>
                        <div className="text-xs text-gray-400">跳过高风险操作确认（不推荐）</div>
                      </div>
                    </label>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex gap-2">
                    <button onClick={handleSave} className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">
                      保存
                    </button>
                    <button
                      onClick={() => setShowConfig(false)}
                      className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      取消
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 审批弹窗 */}
      {approval && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => {}}>
          <div className="w-[400px] rounded-xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-600 dark:bg-[#1a1a2e]">
            <div className="mb-2 flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
              <Shield className="h-5 w-5" />
              <span className="font-semibold">操作审批</span>
            </div>
            <p className="mb-1 text-sm text-gray-600 dark:text-gray-400">
              Agent 请求执行高风险操作
            </p>
            <div className="mb-4 rounded-lg bg-gray-100 p-3 font-mono text-xs dark:bg-[#0f0f23]">
              <div className="font-semibold">{approval.tool}</div>
              <pre className="mt-1 text-gray-500">{JSON.stringify(approval.args, null, 2)}</pre>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  window.electronAPI.invoke(approval.channel, { approved: true })
                  addLog('tool', `已批准: ${approval.tool}`)
                  setApproval(null)
                }}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                批准
              </button>
              <button
                onClick={() => {
                  window.electronAPI.invoke(approval.channel, { approved: false })
                  addLog('tool', `已拒绝: ${approval.tool}`)
                  setApproval(null)
                }}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                拒绝
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** 补充图标（lucide 中没有 Globe 和 FileCode 的替代） */
function Globe({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  )
}

function FileCode({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
      <polyline points="14 2 14 8 20 8"/>
      <path d="m10 13-2 2 2 2"/>
      <path d="m14 17 2-2-2-2"/>
    </svg>
  )
}
