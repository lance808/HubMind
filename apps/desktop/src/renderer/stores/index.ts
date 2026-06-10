/**
 * 前端全局状态管理（Zustand）
 * 
 * 所有 store 通过 IPC 与主进程 StorageService 同步
 */

import { create } from 'zustand'
import type {
  Conversation,
  Message,
  ModelConfig,
  AgentConfig,
  Workflow,
  AppSettings,
} from '@hubmind/shared'
import { api } from '../lib/api'

// ============ Chat Store ============

interface ChatState {
  conversations: Conversation[]
  activeConversationId: string | null
  streamingMessage: string
  isStreaming: boolean
  allowInput: boolean
  loaded: boolean

  // Actions
  loadConversations: () => Promise<void>
  setActiveConversation: (id: string) => void
  createConversation: (title?: string) => Promise<string>
  deleteConversation: (id: string) => Promise<void>
  addMessage: (convId: string, msg: Message) => void
  appendStreamChunk: (chunk: string) => void
  clearStreaming: () => void
  setStreaming: (streaming: boolean) => void
}

export const useChatStore = create<ChatState>()((set, get) => ({
  conversations: [],
  activeConversationId: null,
  streamingMessage: '',
  isStreaming: false,
  allowInput: true,
  loaded: false,

  loadConversations: async () => {
    try {
      const convs = await api.conversations.list() || []
      // 并行加载每个对话的消息
      await Promise.all(convs.map(async (conv) => {
        conv.messages = await api.messages.list(conv.id) || []
      }))
      set({ conversations: convs, loaded: true })
    } catch {
      set({ conversations: [], loaded: true })
    }
  },

  setActiveConversation: (id) => set({ activeConversationId: id }),

  createConversation: async (title) => {
    const id = crypto.randomUUID()
    const conv: Conversation = {
      id,
      title: title || '新对话',
      messages: [],
      systemPrompt: '',
      modelConfigId: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tags: [],
      pinned: false,
      archived: false,
    }
    await api.conversations.save(conv)
    set((s) => ({
      conversations: [conv, ...s.conversations],
      activeConversationId: id,
    }))
    return id
  },

  deleteConversation: async (id) => {
    await api.conversations.delete(id)
    set((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
      activeConversationId:
        s.activeConversationId === id
          ? s.conversations.find((c) => c.id !== id)?.id || null
          : s.activeConversationId,
    }))
  },

  addMessage: (convId, msg) => {
    api.messages.save(msg, convId).catch(console.error)
    set((s) => {
      const conv = s.conversations.find((c) => c.id === convId)
      // 自动标题：第一条 AI 回复的前 30 字
      const hasAi = conv?.messages.some((m) => m.role === 'assistant')
      let title = conv?.title || '新对话'
      if (!hasAi && msg.role === 'assistant') {
        const firstText = msg.content.find((c) => c.type === 'text')?.text || ''
        title = firstText.replace(/[#*\n\r]/g, '').trim().slice(0, 30) || '新对话'
        api.conversations.save({ ...conv!, title }).catch(console.error)
      }
      return {
        conversations: s.conversations.map((c) =>
          c.id === convId
            ? { ...c, messages: [...c.messages, msg], updatedAt: Date.now(), title }
            : c,
        ),
      }
    })
  },

  appendStreamChunk: (chunk) =>
    set((s) => ({ streamingMessage: s.streamingMessage + chunk })),

  clearStreaming: () => set({ streamingMessage: '', isStreaming: false }),

  setStreaming: (streaming) => set({ isStreaming: streaming, allowInput: !streaming }),
}))

// ============ Model Store ============

interface ModelState {
  modelConfigs: ModelConfig[]
  activeModelId: string | null
  comparisonModelIds: string[]
  loaded: boolean

  // Actions
  loadConfigs: () => Promise<void>
  addConfig: (config: ModelConfig) => Promise<void>
  updateConfig: (id: string, updates: Partial<ModelConfig>) => Promise<void>
  deleteConfig: (id: string) => Promise<void>
  setActiveModel: (id: string) => void
  toggleComparison: (id: string) => void
}

export const useModelStore = create<ModelState>()((set, get) => ({
  modelConfigs: [],
  activeModelId: null,
  comparisonModelIds: [],
  loaded: false,

  loadConfigs: async () => {
    try {
      const configs = await api.models.list() || []
      set({ modelConfigs: configs, loaded: true })
      // 如果没有活跃模型，选第一个启用的
      const state = get()
      if (!state.activeModelId) {
        const first = configs.find((c) => c.enabled)
        if (first) set({ activeModelId: first.id })
      }
    } catch {
      set({ modelConfigs: [], loaded: true })
    }
  },

  addConfig: async (config) => {
    await api.models.save(config)
    set((s) => ({
      modelConfigs: [...s.modelConfigs, config],
      activeModelId: s.activeModelId || config.id,
    }))
  },

  updateConfig: async (id, updates) => {
    const current = get().modelConfigs.find((c) => c.id === id)
    if (!current) return
    const updated = { ...current, ...updates }
    await api.models.save(updated)
    set((s) => ({
      modelConfigs: s.modelConfigs.map((c) => (c.id === id ? updated : c)),
    }))
  },

  deleteConfig: async (id) => {
    await api.models.delete(id)
    set((s) => ({
      modelConfigs: s.modelConfigs.filter((c) => c.id !== id),
      activeModelId: s.activeModelId === id ? null : s.activeModelId,
    }))
  },

  setActiveModel: (id) => set({ activeModelId: id }),

  toggleComparison: (id) =>
    set((s) => ({
      comparisonModelIds: s.comparisonModelIds.includes(id)
        ? s.comparisonModelIds.filter((m) => m !== id)
        : [...s.comparisonModelIds, id],
    })),
}))

// ============ Agent Store ============

interface AgentState {
  agents: AgentConfig[]
  activeAgentId: string | null
  executingAgents: string[]
  loaded: boolean

  loadAgents: () => Promise<void>
  addAgent: (agent: AgentConfig) => Promise<void>
  updateAgent: (id: string, updates: Partial<AgentConfig>) => Promise<void>
  deleteAgent: (id: string) => Promise<void>
  setActiveAgent: (id: string) => void
  markExecuting: (id: string) => void
  markDone: (id: string) => void
}

export const useAgentStore = create<AgentState>()((set, get) => ({
  agents: [],
  activeAgentId: null,
  executingAgents: [],
  loaded: false,

  loadAgents: async () => {
    const agents = await api.agents.list()
    set({ agents, loaded: true })
  },

  addAgent: async (agent) => {
    await api.agents.save(agent)
    set((s) => ({ agents: [...s.agents, agent] }))
  },

  updateAgent: async (id, updates) => {
    const current = get().agents.find((a) => a.id === id)
    if (!current) return
    const updated = { ...current, ...updates }
    await api.agents.save(updated)
    set((s) => ({
      agents: s.agents.map((a) => (a.id === id ? updated : a)),
    }))
  },

  deleteAgent: async (id) => {
    await api.agents.delete(id)
    set((s) => ({
      agents: s.agents.filter((a) => a.id !== id),
      activeAgentId: s.activeAgentId === id ? null : s.activeAgentId,
    }))
  },

  setActiveAgent: (id) => set({ activeAgentId: id }),
  markExecuting: (id) =>
    set((s) => ({ executingAgents: [...s.executingAgents, id] })),
  markDone: (id) =>
    set((s) => ({ executingAgents: s.executingAgents.filter((a) => a !== id) })),
}))

// ============ Workflow Store ============

interface WorkflowState {
  workflows: Workflow[]
  activeWorkflowId: string | null
  loaded: boolean

  loadWorkflows: () => Promise<void>
  addWorkflow: (wf: Workflow) => Promise<void>
  updateWorkflow: (id: string, updates: Partial<Workflow>) => Promise<void>
  deleteWorkflow: (id: string) => Promise<void>
  setActiveWorkflow: (id: string) => void
}

export const useWorkflowStore = create<WorkflowState>()((set, get) => ({
  workflows: [],
  activeWorkflowId: null,
  loaded: false,

  loadWorkflows: async () => {
    const workflows = await api.workflows.list()
    set({ workflows, loaded: true })
  },

  addWorkflow: async (wf) => {
    await api.workflows.save(wf)
    set((s) => ({ workflows: [...s.workflows, wf] }))
  },

  updateWorkflow: async (id, updates) => {
    const current = get().workflows.find((w) => w.id === id)
    if (!current) return
    const updated = { ...current, ...updates }
    await api.workflows.save(updated)
    set((s) => ({
      workflows: s.workflows.map((w) => (w.id === id ? updated : w)),
    }))
  },

  deleteWorkflow: async (id) => {
    await api.workflows.delete(id)
    set((s) => ({
      workflows: s.workflows.filter((w) => w.id !== id),
      activeWorkflowId: s.activeWorkflowId === id ? null : s.activeWorkflowId,
    }))
  },

  setActiveWorkflow: (id) => set({ activeWorkflowId: id }),
}))

// ============ Settings Store ============

/** 深合并 AppSettings，确保嵌套字段不丢失 */
function deepMergeSettings(base: AppSettings, updates: Partial<AppSettings>): AppSettings {
  return {
    ...base,
    ...updates,
    general: { ...base.general, ...updates.general },
    network: { ...base.network, ...updates.network },
    privacy: { ...base.privacy, ...updates.privacy },
    costControl: { ...base.costControl, ...updates.costControl },
  }
}

interface SettingsState {
  settings: AppSettings
  loaded: boolean

  loadSettings: () => Promise<void>
  updateSettings: (updates: Partial<AppSettings>) => void
  updateGeneral: (updates: Partial<AppSettings['general']>) => void
  updateNetwork: (updates: Partial<AppSettings['network']>) => void
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  settings: {
    general: { language: 'zh-CN', theme: 'system', fontSize: 14, restoreSession: true },
    network: { timeout: 60000, maxRetries: 3, circuitBreakerThreshold: 5 },
    privacy: { allowTelemetry: false },
    costControl: { dailyBudget: 100, monthlyBudget: 2000, warningRatio: 0.8 },
  },
  loaded: false,

  loadSettings: async () => {
    try {
      const saved = await window.electronAPI.invoke('settings:load') as AppSettings | null
      if (saved) set({ settings: deepMergeSettings(get().settings, saved) })
    } catch { /* ignore */ }
    set({ loaded: true })
  },

  updateSettings: (updates) =>
    set((s) => {
      const merged = deepMergeSettings(s.settings, updates)
      window.electronAPI.invoke('settings:save', merged).catch(console.error)
      return { settings: merged }
    }),
  updateGeneral: (updates) =>
    set((s) => {
      const merged = deepMergeSettings(s.settings, { general: updates })
      window.electronAPI.invoke('settings:save', merged).catch(console.error)
      return { settings: merged }
    }),
  updateNetwork: (updates) =>
    set((s) => {
      const merged = deepMergeSettings(s.settings, { network: updates })
      window.electronAPI.invoke('settings:save', merged).catch(console.error)
      return { settings: merged }
    }),
}))

// ============ UI Store ============

interface UIState {
  sidebarOpen: boolean
  sidebarWidth: number
  settingsPanelOpen: boolean
  modelPanelOpen: boolean
  activeTab: 'chat' | 'agent' | 'workflow' | 'settings'

  toggleSidebar: () => void
  setSidebarWidth: (w: number) => void
  setSettingsPanel: (open: boolean) => void
  setModelPanel: (open: boolean) => void
  setActiveTab: (tab: UIState['activeTab']) => void
}

export const useUIStore = create<UIState>()((set) => ({
  sidebarOpen: true,
  sidebarWidth: 260,
  settingsPanelOpen: false,
  modelPanelOpen: false,
  activeTab: 'chat',

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarWidth: (w) => set({ sidebarWidth: w }),
  setSettingsPanel: (open) => set({ settingsPanelOpen: open }),
  setModelPanel: (open) => set({ modelPanelOpen: open }),
  setActiveTab: (tab) => set({ activeTab: tab }),
}))
