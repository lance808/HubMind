/**
 * Agent 运行时 - 智能体框架核心
 * 
 * 职责：
 * 1. Agent 生命周期管理（创建、执行、停止）
 * 2. 工具注册与调用（Function Calling 协议）
 * 3. 多步推理循环（ReAct 模式）
 * 4. 安全沙箱（权限控制、操作审批）
 * 5. 工作流编排（串行/并行/条件分支）
 */

import type {
  AgentConfig,
  AgentMode,
  ToolDefinition,
  ToolExecution,
  Message,
  ContentBlock,
  StreamChunk,
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  ToolCallContent,
} from '@hubmind/shared'

// ============ 工具接口 ============

/** 工具执行上下文 */
export interface ToolContext {
  /** 当前 Agent 配置 */
  agentConfig: AgentConfig
  /** 临时工作目录 */
  workspaceDir: string
  /** 是否沙箱模式 */
  sandbox: boolean
  /** 回调：请求用户批准 */
  requestApproval: (toolName: string, args: Record<string, unknown>) => Promise<boolean>
}

/** 工具定义（实现侧） */
export interface Tool {
  /** 工具定义（给 LLM 看的） */
  definition: ToolDefinition
  /** 执行工具 */
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<string>
}

// ============ 内置工具 ============

/** Shell 命令执行工具 */
export class ShellTool implements Tool {
  definition: ToolDefinition = {
    name: 'shell_execute',
    description: '在本地终端执行 Shell 命令。返回命令输出结果。仅用于系统操作，不要执行破坏性命令。',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '要执行的 Shell 命令' },
        cwd: { type: 'string', description: '工作目录（可选）' },
        timeout: { type: 'number', description: '超时时间(毫秒)，默认 30000' },
      },
      required: ['command'],
    },
  }

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
    // 高风险操作需审批
    const command = args.command as string
    const dangerous = ['rm -rf', 'sudo', 'chmod 777', '>', '| sh'].some((p) => command.includes(p))

    if (dangerous && !ctx.agentConfig.autoApprove) {
      const approved = await ctx.requestApproval('shell_execute', args)
      if (!approved) return '操作被用户拒绝'
    }

    // 实际执行（通过 Electron IPC 调用主进程的 child_process）
    return `[Shell] 执行命令: ${command}\n(实际执行需桥接 Electron IPC)`
  }
}

/** 网页搜索工具 */
export class WebSearchTool implements Tool {
  definition: ToolDefinition = {
    name: 'web_search',
    description: '联网搜索最新信息。返回搜索结果摘要和 URL 列表。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        num: { type: 'number', description: '返回结果数量，默认 5' },
      },
      required: ['query'],
    },
  }

  async execute(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
    const query = args.query as string
    const num = (args.num as number) || 5
    // 通过搜索引擎 API 或内置搜索服务
    return `[WebSearch] 搜索: ${query}, 返回 ${num} 条结果\n(实际执行需集成搜索 API)`
  }
}

/** 文件操作工具 */
export class FileTool implements Tool {
  definition: ToolDefinition = {
    name: 'file_operations',
    description: '读取、写入、列出本地文件。支持文本文件和代码文件的读写。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['read', 'write', 'list', 'delete'], description: '操作类型' },
        path: { type: 'string', description: '文件路径' },
        content: { type: 'string', description: '写入的内容（write 操作需要）' },
      },
      required: ['action', 'path'],
    },
  }

  async execute(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
    return `[File] 操作: ${args.action} ${args.path}`
  }
}

// ============ Agent 运行时 ============

export interface AgentRunCallbacks {
  /** 流式输出的每一块 */
  onChunk?: (chunk: StreamChunk) => void
  /** 工具调用开始 */
  onToolCall?: (toolName: string, args: Record<string, unknown>) => void
  /** 工具调用结束 */
  onToolResult?: (execution: ToolExecution) => void
  /** Agent 思考日志 */
  onThought?: (thought: string) => void
  /** 请求用户批准 */
  onApprovalRequest?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>
}

export class AgentRuntime {
  private tools: Map<string, Tool> = new Map()
  private running = new Map<string, AbortController>()
  private workspaceDir: string

  constructor(workspaceDir: string) {
    this.workspaceDir = workspaceDir
    this.registerBuiltinTools()
  }

  // ============ 工具注册 ============

  registerTool(tool: Tool): void {
    this.tools.set(tool.definition.name, tool)
  }

  registerTools(tools: Tool[]): void {
    for (const tool of tools) {
      this.registerTool(tool)
    }
  }

  private registerBuiltinTools(): void {
    this.registerTools([
      new ShellTool(),
      new WebSearchTool(),
      new FileTool(),
    ])
  }

  getToolDefinitions(toolNames: string[]): ToolDefinition[] {
    return toolNames
      .map((name) => this.tools.get(name))
      .filter((t): t is Tool => !!t)
      .map((t) => t.definition)
  }

  // ============ Agent 执行 ============

  /**
   * 运行 Agent（ReAct 循环）
   * 1. 发送用户消息 + 工具列表给 LLM
   * 2. LLM 返回文本或工具调用
   * 3. 如果是工具调用，执行工具并将结果返回 LLM
   * 4. 重复直到 LLM 返回纯文本或达到最大步数
   */
  async run(
    config: AgentConfig,
    messages: Message[],
    callbacks: AgentRunCallbacks,
  ): Promise<Message[]> {
    const abort = new AbortController()
    this.running.set(config.id, abort)

    const context: ToolContext = {
      agentConfig: config,
      workspaceDir: this.workspaceDir,
      sandbox: !config.autoApprove,
      requestApproval: callbacks.onApprovalRequest || (async () => true),
    }

    let steps = 0
    const conversation = [...messages]

    while (steps < config.maxSteps && !abort.signal.aborted) {
      steps++

      // 构建工具定义
      const toolDefs = this.getToolDefinitions(config.tools)

      // TODO: 调用 LLM 适配器
      // const response = await adapter.chat(config, params, { messages, tools: toolDefs })
      // 这里需要注入实际的模型调用逻辑

      // 模拟：检查是否需要工具调用
      const lastMsg = conversation[conversation.length - 1]
      const hasToolCall = lastMsg?.content.some(
        (c): c is ToolCallContent => c.type === 'tool_call'
      )

      if (hasToolCall) {
        // 执行工具
        const toolContent = lastMsg.content.find(
          (c): c is ToolCallContent => c.type === 'tool_call'
        )
        if (toolContent) {
          const tool = this.tools.get(toolContent.toolName)
          if (tool) {
            callbacks.onToolCall?.(toolContent.toolName, toolContent.arguments)
            const result = await tool.execute(toolContent.arguments, context)
            const execution: ToolExecution = {
              toolName: toolContent.toolName,
              arguments: toolContent.arguments,
              result,
              duration: 0,
            }
            callbacks.onToolResult?.(execution)

            conversation.push({
              id: crypto.randomUUID(),
              role: 'tool',
              content: [{ type: 'tool_result', toolCallId: toolContent.toolCallId, result }],
              createdAt: Date.now(),
            })
          }
        }
      } else {
        // LLM 返回了最终答案，结束循环
        break
      }

      if (steps >= config.maxSteps) {
        conversation.push({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: [{ type: 'text', text: '已达到最大迭代步数，任务未完成。' }],
          createdAt: Date.now(),
        })
      }
    }

    this.running.delete(config.id)
    return conversation
  }

  /** 停止 Agent */
  stop(agentId: string): void {
    const abort = this.running.get(agentId)
    if (abort) {
      abort.abort()
      this.running.delete(agentId)
    }
  }

  // ============ 安全沙箱 ============

  /**
   * 高风险操作的审批流程：
   * 1. 检测操作风险等级
   * 2. 如果 autoApprove=false，弹出确认对话框
   * 3. 记录操作审计日志
   * 4. 在沙箱环境中执行（可选）
   */
  evaluateRisk(toolName: string, args: Record<string, unknown>): 'low' | 'medium' | 'high' {
    switch (toolName) {
      case 'shell_execute': {
        const cmd = (args.command as string) || ''
        if (cmd.includes('rm ') || cmd.includes('sudo') || cmd.includes('chmod')) return 'high'
        if (cmd.includes('curl') || cmd.includes('wget')) return 'medium'
        return 'low'
      }
      case 'file_operations': {
        if (args.action === 'delete') return 'medium'
        return 'low'
      }
      default:
        return 'low'
    }
  }
}

// ============ 工作流引擎 ============

export interface WorkflowContext {
  /** 输入数据 */
  input: Record<string, unknown>
  /** 节点输出缓存 */
  outputs: Map<string, unknown>
  /** 中止信号 */
  abort?: AbortController
}

export class WorkflowEngine {
  /**
   * 执行工作流
   * 策略：拓扑排序 → 按层级并行执行
   */
  async execute(workflow: Workflow, context: WorkflowContext): Promise<Record<string, unknown>> {
    const { nodes, edges } = workflow

    // 1. 拓扑排序
    const sorted = this.topologicalSort(nodes, edges)

    // 2. 按层级执行（同级节点可并行）
    const levels = this.groupByLevel(sorted, edges)

    for (const level of levels) {
      if (context.abort?.signal.aborted) break

      // 同层级节点并行执行
      const results = await Promise.allSettled(
        level.map((node) => this.executeNode(node, context))
      )

      for (let i = 0; i < level.length; i++) {
        const result = results[i]
        if (result.status === 'fulfilled') {
          context.outputs.set(level[i].id, result.value)
        } else {
          context.outputs.set(level[i].id, { error: result.reason?.message })
        }
      }
    }

    // 3. 收集最终输出
    const output: Record<string, unknown> = {}
    for (const node of nodes) {
      if (node.type === 'output') {
        output[node.id] = context.outputs.get(node.id)
      }
    }

    return output
  }

  private async executeNode(node: WorkflowNode, ctx: WorkflowContext): Promise<unknown> {
    switch (node.type) {
      case 'llm':
        // 调用 LLM
        return `[LLM] 节点 ${node.label} 执行结果`
      case 'tool':
        // 执行工具
        return `[Tool] 节点 ${node.label} 执行结果`
      case 'condition':
        // 条件判断
        return true
      case 'code':
        // 执行代码
        return `[Code] 节点 ${node.label} 执行结果`
      case 'input':
        return ctx.input[node.label] || null
      default:
        return null
    }
  }

  /**
   * 拓扑排序（Kahn 算法）
   */
  private topologicalSort(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
    const inDegree = new Map<string, number>()
    const adjacency = new Map<string, string[]>()

    for (const node of nodes) {
      inDegree.set(node.id, 0)
      adjacency.set(node.id, [])
    }

    for (const edge of edges) {
      adjacency.get(edge.source)?.push(edge.target)
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1)
    }

    const queue: string[] = []
    for (const [id, degree] of inDegree) {
      if (degree === 0) queue.push(id)
    }

    const sorted: WorkflowNode[] = []
    while (queue.length > 0) {
      const current = queue.shift()!
      const node = nodes.find((n) => n.id === current)
      if (node) sorted.push(node)

      for (const neighbor of adjacency.get(current) || []) {
        const newDegree = (inDegree.get(neighbor) || 1) - 1
        inDegree.set(neighbor, newDegree)
        if (newDegree === 0) queue.push(neighbor)
      }
    }

    return sorted
  }

  /**
   * 按执行层级分组（同一层的节点可并行执行）
   */
  private groupByLevel(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[][] {
    const levels: WorkflowNode[][] = []
    const nodeLevel = new Map<string, number>()

    // BFS 计算每个节点的层级
    const queue: string[] = []
    for (const node of nodes) {
      const hasIncoming = edges.some((e) => e.target === node.id)
      if (!hasIncoming) {
        nodeLevel.set(node.id, 0)
        queue.push(node.id)
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!
      const currentLevel = nodeLevel.get(current) || 0

      for (const edge of edges) {
        if (edge.source === current) {
          const nextLevel = currentLevel + 1
          if (!nodeLevel.has(edge.target) || (nodeLevel.get(edge.target) || 0) < nextLevel) {
            nodeLevel.set(edge.target, nextLevel)
            queue.push(edge.target)
          }
        }
      }
    }

    // 按层级分组
    const maxLevel = Math.max(...nodeLevel.values(), 0)
    for (let i = 0; i <= maxLevel; i++) {
      const levelNodes = nodes.filter((n) => nodeLevel.get(n.id) === i)
      if (levelNodes.length > 0) levels.push(levelNodes)
    }

    return levels
  }
}
