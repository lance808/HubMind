import { Minus, Square, X, Sun, Moon, Monitor } from 'lucide-react'
import { useSettingsStore } from '../../stores'

/**
 * 自定义标题栏（无边框窗口）
 */
export function TitleBar() {
  const win = window.electronAPI
  const theme = useSettingsStore((s) => s.settings.general.theme)
  const updateGeneral = useSettingsStore((s) => s.updateGeneral)

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'
    updateGeneral({ theme: next })
  }

  const Icon = theme === 'dark' ? Sun : theme === 'light' ? Moon : Monitor
  const title = theme === 'dark' ? '深色' : theme === 'light' ? '浅色' : '跟随系统'

  return (
    <header className="titlebar-drag flex h-11 items-center justify-between border-b border-gray-200/80 bg-white/90 px-3 backdrop-blur dark:border-gray-700/50 dark:bg-[#12122a]/90">
      {/* 左侧 */}
      <div className="flex items-center gap-2.5 pl-1">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white">
          <span className="text-sm font-bold">H</span>
        </div>
        <span className="text-sm font-semibold tracking-wide text-gray-600 dark:text-gray-300">
          HubMind
        </span>
      </div>

      {/* 右侧：主题切换 + 窗口控制 */}
      <div className="titlebar-no-drag flex items-center">
        <button
          onClick={toggleTheme}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-200/50 hover:text-gray-600 dark:hover:bg-gray-700/50 dark:hover:text-gray-200"
          title={`当前: ${title} — 点击切换`}
        >
          <Icon className="h-4 w-4" />
        </button>
        <div className="mx-1 h-4 w-px bg-gray-200 dark:bg-gray-700" />
        <button
          onClick={() => win.minimize()}
          className="inline-flex h-8 w-10 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-200/50 hover:text-gray-600 dark:hover:bg-gray-700/50 dark:hover:text-gray-200"
          title="最小化"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          onClick={() => win.maximize()}
          className="inline-flex h-8 w-10 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-200/50 hover:text-gray-600 dark:hover:bg-gray-700/50 dark:hover:text-gray-200"
          title="最大化"
        >
          <Square className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => win.close()}
          className="inline-flex h-8 w-10 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-500/90 hover:text-white"
          title="关闭"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}
