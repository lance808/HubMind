import { useState } from 'react'
import { GitBranch, Plus, Trash2, Play, Loader2, ArrowRight, Zap, Code2, Wrench } from 'lucide-react'
import { useWorkflowStore } from '../stores'
import type { WorkflowNode, WorkflowEdge, WorkflowNodeType } from '@hubmind/shared'

/** 节点类型定义 */
const NODE_TYPES: { type: WorkflowNodeType; label: string; color: string; icon: React.ReactNode }[] = [
  { type: 'llm', label: 'LLM', color: 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700', icon: <Zap className="h-3.5 w-3.5" /> },
  { type: 'tool', label: '工具', color: 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700', icon: <Wrench className="h-3.5 w-3.5" /> },
  { type: 'condition', label: '条件', color: 'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700', icon: <GitBranch className="h-3.5 w-3.5" /> },
  { type: 'code', label: '代码', color: 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700', icon: <Code2 className="h-3.5 w-3.5" /> },
  { type: 'input', label: '输入', color: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700', icon: <ArrowRight className="h-3.5 w-3.5" /> },
  { type: 'output', label: '输出', color: 'bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-700', icon: <ArrowRight className="h-3.5 w-3.5" /> },
]

/**
 * 工作流编辑器页面
 *
 * MVP 阶段使用简化的 Canvas 可视化，
 * 后续集成 React Flow 提供完整的拖拽编排体验。
 */
export function WorkflowPage() {
  const {
    workflows, activeWorkflowId,
    loadWorkflows, addWorkflow, updateWorkflow, deleteWorkflow, setActiveWorkflow,
  } = useWorkflowStore()

  const [loading, setLoading] = useState(true)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [showAddPanel, setShowAddPanel] = useState(false)

  useState(() => { loadWorkflows().then(() => setLoading(false)) })

  const activeWorkflow = workflows.find((w) => w.id === activeWorkflowId)

  // 添加节点
  const handleAddNode = (type: WorkflowNodeType) => {
    if (!activeWorkflow) return
    const newNode: WorkflowNode = {
      id: crypto.randomUUID(),
      type,
      label: NODE_TYPES.find((n) => n.type === type)?.label || type,
      config: {},
      position: {
        x: Math.random() * 300 + 50,
        y: Math.random() * 200 + 50,
      },
    }
    const updated = {
      ...activeWorkflow,
      nodes: [...activeWorkflow.nodes, newNode],
      updatedAt: Date.now(),
    }
    updateWorkflow(activeWorkflow.id, updated)
  }

  // 删除节点
  const handleDeleteNode = (nodeId: string) => {
    if (!activeWorkflow) return
    const updated = {
      ...activeWorkflow,
      nodes: activeWorkflow.nodes.filter((n) => n.id !== nodeId),
      edges: activeWorkflow.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      updatedAt: Date.now(),
    }
    updateWorkflow(activeWorkflow.id, updated)
    setSelectedNode(null)
  }

  // 连接两个节点
  const handleConnect = (sourceId: string, targetId: string) => {
    if (!activeWorkflow || sourceId === targetId) return
    // 检查是否已存在
    if (activeWorkflow.edges.some((e) => e.source === sourceId && e.target === targetId)) return
    const newEdge: WorkflowEdge = {
      id: crypto.randomUUID(),
      source: sourceId,
      target: targetId,
    }
    const updated = {
      ...activeWorkflow,
      edges: [...activeWorkflow.edges, newEdge],
      updatedAt: Date.now(),
    }
    updateWorkflow(activeWorkflow.id, updated)
  }

  // 创建新工作流
  const handleCreate = async () => {
    const workflow = {
      id: crypto.randomUUID(),
      name: `工作流 ${workflows.length + 1}`,
      description: '',
      nodes: [] as WorkflowNode[],
      edges: [] as WorkflowEdge[],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await addWorkflow(workflow)
    setActiveWorkflow(workflow.id)
  }

  const getNodeColor = (type: WorkflowNodeType) =>
    NODE_TYPES.find((n) => n.type === type)?.color || ''

  if (loading) {
    return <div className="flex h-full items-center justify-center text-gray-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
  }

  return (
    <div className="flex h-full" style={{ padding: '24px' }}>
      {/* 左侧节点面板 */}
      <div className="flex w-[220px] flex-shrink-0 flex-col border-r border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-[#12122a]">
        <div className="border-b border-gray-200 p-3 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">工作流</h2>
            <button
              onClick={handleCreate}
              className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {workflows.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-gray-400">暂无工作流</p>
          ) : (
            workflows.map((wf) => (
              <button
                key={wf.id}
                onClick={() => setActiveWorkflow(wf.id)}
                className={`group flex w-full items-center gap-2.5 px-3 py-2.5 text-sm transition-colors ${
                  activeWorkflowId === wf.id
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                }`}
              >
                <GitBranch className="h-4 w-4 flex-shrink-0" />
                <div className="flex-1 truncate text-left">
                  <div className="truncate font-medium">{wf.name}</div>
                  <div className="text-xs text-gray-400">
                    {wf.nodes.length} 节点 · {wf.edges.length} 连线
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteWorkflow(wf.id) }}
                  className="flex-shrink-0 rounded p-0.5 text-gray-300 opacity-0 hover:text-red-500 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </button>
            ))
          )}
        </div>
      </div>

      {/* 右侧编辑区 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {!activeWorkflow ? (
          <div className="flex h-full flex-col items-center justify-center text-gray-400">
            <GitBranch className="mb-4 h-12 w-12" />
            <p className="text-lg font-medium">选择或创建一个工作流</p>
            <p className="mt-1 text-sm">可视化编排多个模型和工具的串并行调用</p>
            <button
              onClick={handleCreate}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              创建工作流
            </button>
          </div>
        ) : (
          <>
            {/* 工具栏 */}
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <span className="font-medium text-sm">{activeWorkflow.name}</span>
                <span className="text-xs text-gray-400">
                  {activeWorkflow.nodes.length} 节点 · {activeWorkflow.edges.length} 连线
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAddPanel(!showAddPanel)}
                  className={`rounded px-3 py-1.5 text-xs ${
                    showAddPanel ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <Plus className="mr-1 inline-block h-3.5 w-3.5" />
                  添加节点
                </button>
                <button className="rounded px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                  <Play className="mr-1 inline-block h-3.5 w-3.5" />
                  执行
                </button>
              </div>
            </div>

            {/* Canvas 编辑区 */}
            <div className="relative flex-1 overflow-auto bg-gray-50 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] bg-[size:20px_20px] dark:bg-[#0a0a1a] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)]">
              {/* 工作流名称 */}
              <div className="absolute left-4 top-4 z-10">
                <input
                  value={activeWorkflow.name}
                  onChange={(e) => updateWorkflow(activeWorkflow.id, { ...activeWorkflow, name: e.target.value })}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium outline-none dark:border-gray-600 dark:bg-[#1a1a2e] dark:text-gray-200"
                />
              </div>

              {/* 节点 */}
              {activeWorkflow.nodes.map((node) => (
                <div
                  key={node.id}
                  onClick={() => {
                    setSelectedNode(node.id)
                    if (selectedNode && selectedNode !== node.id) {
                      handleConnect(selectedNode, node.id)
                    }
                  }}
                  className={`absolute cursor-pointer rounded-lg border-2 px-3 py-2 text-sm shadow-sm transition-shadow hover:shadow-md ${
                    selectedNode === node.id ? 'ring-2 ring-blue-400' : ''
                  } ${getNodeColor(node.type)}`}
                  style={{ left: node.position.x, top: node.position.y }}
                >
                  <div className="flex items-center gap-1.5">
                    {NODE_TYPES.find((n) => n.type === node.type)?.icon}
                    <span className="font-medium">{node.label}</span>
                  </div>
                  {/* 连线提示 */}
                  {selectedNode && selectedNode !== node.id && (
                    <div className="mt-1 text-center text-xs opacity-50">点击连接</div>
                  )}
                </div>
              ))}

              {/* 连线（SVG 层） */}
              {activeWorkflow.edges.length > 0 && (
                <svg className="pointer-events-none absolute inset-0 h-full w-full">
                  {activeWorkflow.edges.map((edge) => {
                    const source = activeWorkflow.nodes.find((n) => n.id === edge.source)
                    const target = activeWorkflow.nodes.find((n) => n.id === edge.target)
                    if (!source || !target) return null
                    const sx = source.position.x + 60 // 估算节点宽度一半
                    const sy = source.position.y + 15
                    const tx = target.position.x + 60
                    const ty = target.position.y + 15
                    return (
                      <g key={edge.id}>
                        <defs>
                          <marker id={`arrow-${edge.id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                            <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
                          </marker>
                        </defs>
                        <line
                          x1={sx} y1={sy} x2={tx} y2={ty}
                          stroke="#94a3b8" strokeWidth="2"
                          markerEnd={`url(#arrow-${edge.id})`}
                        />
                      </g>
                    )
                  })}
                </svg>
              )}

              {/* 空状态提示 */}
              {activeWorkflow.nodes.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center text-gray-400">
                  <p className="text-sm">点击"添加节点"开始编排</p>
                  <p className="mt-1 text-xs">节点之间可通过点击进行连线</p>
                </div>
              )}
            </div>

            {/* 添加节点面板 */}
            {showAddPanel && (
              <div className="border-t border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-[#1a1a2e]">
                <div className="flex flex-wrap gap-2">
                  {NODE_TYPES.map(({ type, label, color, icon }) => (
                    <button
                      key={type}
                      onClick={() => handleAddNode(type)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-80 ${color}`}
                    >
                      {icon}
                      {label}
                    </button>
                  ))}
                </div>
                {selectedNode && (
                  <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3 dark:border-gray-700">
                    <span className="text-xs text-gray-400">选中节点: {activeWorkflow.nodes.find((n) => n.id === selectedNode)?.label}</span>
                    <button
                      onClick={() => handleDeleteNode(selectedNode)}
                      className="rounded px-2 py-0.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      删除
                    </button>
                    <button
                      onClick={() => setSelectedNode(null)}
                      className="rounded px-2 py-0.5 text-xs text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      取消选择
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
