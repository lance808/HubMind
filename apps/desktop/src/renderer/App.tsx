import { useEffect, useState } from 'react'
import { useUIStore, useChatStore, useModelStore, useSettingsStore } from './stores'
import { TitleBar } from './components/common/TitleBar'
import { Sidebar } from './components/common/Sidebar'
import { ChatPage } from './pages/ChatPage'
import { AgentPage } from './pages/AgentPage'
import { SettingsPage } from './pages/SettingsPage'
import { WorkflowPage } from './pages/WorkflowPage'

/** 根据设置应用暗色模式 */
function useTheme() {
  const theme = useSettingsStore((s) => s.settings.general.theme)

  const applyTheme = () => {
    const root = document.documentElement
    let isDark = false
    if (theme === 'dark') {
      isDark = true
    } else if (theme === 'light') {
      isDark = false
    } else {
      isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    root.classList.toggle('dark', isDark)
  }

  applyTheme()

  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      document.documentElement.classList.toggle('dark', mq.matches)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])
}

/** 根据设置应用字号 */
function useFontSize() {
  const fontSize = useSettingsStore((s) => s.settings.general.fontSize)

  // 每次渲染立即生效
  document.documentElement.style.fontSize = `${fontSize}px`
}

function App() {
  const { sidebarOpen, activeTab } = useUIStore()
  const { loadConversations, createConversation } = useChatStore()
  const { loadConfigs } = useModelStore()
  const [initialized, setInitialized] = useState(false)

  useTheme()
  useFontSize()

  useEffect(() => {
    let mounted = true

    const init = async () => {
      try {
        await Promise.all([
          loadConfigs(),
          loadConversations(),
        ])

        if (!mounted) return

        // 从 getState() 获取最新值，避免闭包过期状态
        const { conversations, activeConversationId } = useChatStore.getState()

        if (conversations.length === 0 && !activeConversationId) {
          await createConversation()
        }
      } catch (err) {
        console.error('[App] init failed:', err)
      } finally {
        if (mounted) {
          setInitialized(true)
        }
      }
    }
    init()

    return () => { mounted = false }
  }, [])

  if (!initialized) {
    return (
      <div className="flex h-screen w-screen flex-col bg-white dark:bg-[#1a1a2e]">
        {/* 骨架标题栏 */}
        <div className="flex h-10 items-center justify-between border-b border-gray-200 px-3 dark:border-gray-700">
          <div className="h-4 w-16 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          <div className="flex gap-1">
            <div className="h-3 w-8 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-3 w-8 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-3 w-8 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          </div>
        </div>
        <div className="flex flex-1 overflow-hidden">
          {/* 骨架侧边栏 */}
          <div className="flex w-[260px] flex-shrink-0 flex-col gap-3 border-r border-gray-200 p-3 dark:border-gray-700">
            <div className="h-9 w-full animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
            <div className="h-8 w-full animate-pulse rounded-md bg-gray-200 dark:bg-gray-700" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-8 w-8 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
                <div className="h-3 flex-1 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
              </div>
            ))}
          </div>
          {/* 骨架主区 */}
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
            <div className="h-6 w-32 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-4 w-48 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            <div className="mt-4 h-10 w-64 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-gray-50 text-gray-900 dark:bg-[#0f0f23] dark:text-gray-100">
      {/* 自定义标题栏 */}
      <TitleBar />

      <div className="flex flex-1 overflow-hidden">
        {/* 侧边栏 */}
        {sidebarOpen && <Sidebar />}

        {/* 主内容区 */}
        <main className="flex-1 overflow-hidden bg-white dark:bg-[#12122a]">
          {activeTab === 'chat' && <ChatPage />}
          {activeTab === 'agent' && <AgentPage />}
          {activeTab === 'workflow' && <WorkflowPage />}
          {activeTab === 'settings' && <SettingsPage />}
        </main>
      </div>
    </div>
  )
}

export { App }
