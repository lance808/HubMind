import { useState, useEffect } from 'react'
import { Plus, MessageSquare, Settings, Bot, GitBranch, Coins } from 'lucide-react'
import { useChatStore, useUIStore, useSettingsStore } from '../../stores'
import { api } from '../../lib/api'

/**
 * 左侧边栏
 */
export function Sidebar() {
  const { conversations, activeConversationId, createConversation, setActiveConversation } = useChatStore()
  const { activeTab, setActiveTab } = useUIStore()
  const { settings } = useSettingsStore()
  const [dailyCost, setDailyCost] = useState(0)
  const [monthlyCost, setMonthlyCost] = useState(0)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    api.usage.daily(today).then((u) => setDailyCost(u.estimatedCost || 0)).catch(() => {})
    api.usage.monthly(ym).then((u) => setMonthlyCost(u.estimatedCost || 0)).catch(() => {})
  }, [conversations.length])

  const filtered = search.trim()
    ? conversations.filter((c) => c.title.toLowerCase().includes(search.toLowerCase()))
    : conversations

  return (
    <aside className="flex w-[260px] flex-shrink-0 flex-col border-r border-gray-200/80 bg-gray-50/80 dark:border-gray-700/50 dark:bg-[#0f0f23]/80" style={{ paddingLeft: 16, paddingBottom: 16 }}>
      {/* 新建对话 */}
      <div className="p-3 pb-2">
        <button
          onClick={() => createConversation()}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-600 shadow-sm transition-all hover:border-blue-300 hover:text-blue-600 hover:shadow dark:border-gray-600 dark:bg-[#1a1a3a] dark:text-gray-300 dark:hover:border-blue-500 dark:hover:text-blue-400"
        >
          <Plus className="h-5 w-5" />
          新建对话
        </button>
      </div>

      {/* 搜索框 */}
      <div className="px-3 pb-2.5">
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索对话..."
            className="w-full rounded-lg border border-gray-200 bg-white/80 py-2 pl-3 pr-3 text-sm text-gray-600 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-400 dark:border-gray-600 dark:bg-[#1a1a3a]/80 dark:text-gray-300 dark:focus:border-blue-500"
          />
        </div>
      </div>

      {/* 对话列表 */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {filtered.map((conv) => (
          <button
            key={conv.id}
            onClick={() => setActiveConversation(conv.id)}
            className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all ${
              activeConversationId === conv.id
                ? 'bg-white text-blue-600 shadow-sm dark:bg-[#1a1a3a] dark:text-blue-400'
                : 'text-gray-500 hover:bg-white/60 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-[#1a1a3a]/60 dark:hover:text-gray-200'
            }`}
          >
            <MessageSquare className={`h-4 w-4 flex-shrink-0 ${activeConversationId === conv.id ? 'text-blue-500' : 'text-gray-400'}`} />
            <span className="truncate">{conv.title}</span>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-gray-400">
            {search ? '无匹配对话' : '暂无对话，点击上方按钮开始'}
          </p>
        )}
      </div>

      {/* Token 用量 */}
      <div className="border-t border-gray-200/80 px-3 py-2.5 dark:border-gray-700/50">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
          <Coins className="h-3.5 w-3.5" />
          API 用量
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 dark:border-gray-600 dark:bg-[#1a1a3a]">
            <div className="text-[10px] text-gray-400">今日</div>
            <div className="text-xs font-semibold text-gray-700 dark:text-gray-200">
              ¥{dailyCost.toFixed(2)}
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
              <div
                className="h-full rounded-full bg-blue-500 transition-all"
                style={{ width: `${Math.min((dailyCost / Math.max(settings.costControl?.dailyBudget ?? 100, 0.01)) * 100, 100)}%` }}
              />
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 dark:border-gray-600 dark:bg-[#1a1a3a]">
            <div className="text-[10px] text-gray-400">本月</div>
            <div className="text-xs font-semibold text-gray-700 dark:text-gray-200">
              ¥{monthlyCost.toFixed(2)}
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
              <div
                className="h-full rounded-full bg-blue-500 transition-all"
                style={{ width: `${Math.min((monthlyCost / Math.max(settings.costControl?.monthlyBudget ?? 2000, 0.01)) * 100, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 底部导航 */}
      <div className="border-t border-gray-200/80 dark:border-gray-700/50">
        <nav className="flex flex-col gap-0.5 p-2">
          {[
            { id: 'chat' as const, label: '聊天', icon: MessageSquare },
            { id: 'agent' as const, label: 'Agent', icon: Bot },
            { id: 'workflow' as const, label: '工作流', icon: GitBranch },
            { id: 'settings' as const, label: '设置', icon: Settings },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                activeTab === id
                  ? 'bg-white text-blue-600 shadow-sm dark:bg-[#1a1a3a] dark:text-blue-400'
                  : 'text-gray-400 hover:bg-white/60 hover:text-gray-600 dark:hover:bg-[#1a1a3a]/60 dark:hover:text-gray-300'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>
    </aside>
  )
}
