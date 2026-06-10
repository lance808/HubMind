import { useState } from 'react'
import { Globe, Wifi, Shield, Coins, Palette, Laptop, Moon, Sun, Monitor, Puzzle, Trash2, Plus } from 'lucide-react'
import { useSettingsStore } from '../stores'

/**
 * 设置页面 - 通用 / 网络 / 隐私 / 成本控制
 */
export function SettingsPage() {
  const { settings, updateGeneral, updateNetwork, updateSettings } = useSettingsStore()
  const [activeSection, setActiveSection] = useState<'general' | 'network' | 'privacy' | 'cost' | 'plugin'>('general')
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    updateSettings({})
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const sections = [
    { id: 'general' as const, label: '通用', icon: Palette },
    { id: 'network' as const, label: '网络', icon: Wifi },
    { id: 'privacy' as const, label: '隐私', icon: Shield },
    { id: 'cost' as const, label: '成本', icon: Coins },
    { id: 'plugin' as const, label: '插件', icon: Puzzle },
  ]

  return (
    <div className="flex h-full" style={{ padding: '24px' }}>
      {/* 左侧导航 */}
      <div className="flex w-[200px] flex-shrink-0 flex-col border-r border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-[#12122a]">
        <div className="border-b border-gray-200 p-4 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">设置</h2>
        </div>
        <nav className="flex-1 p-2">
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                activeSection === id
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* 右侧内容 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-3 dark:border-gray-700">
          <h3 className="text-lg font-semibold">
            {sections.find((s) => s.id === activeSection)?.label}
          </h3>
          <button
            onClick={handleSave}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm text-white transition-colors hover:bg-blue-700"
          >
            {saved ? '已保存 ✓' : '保存'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* === 通用设置 === */}
          {activeSection === 'general' && (
            <div className="max-w-xl space-y-6">
              {/* 语言 */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">语言</label>
                <select
                  value={settings.general.language}
                  onChange={(e) => updateGeneral({ language: e.target.value as 'zh-CN' | 'en' })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-[#0f0f23] dark:text-gray-200"
                >
                  <option value="zh-CN">简体中文</option>
                  <option value="en">English</option>
                </select>
              </div>

              {/* 主题 */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">主题</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: 'light' as const, label: '浅色', icon: Sun },
                    { value: 'dark' as const, label: '深色', icon: Moon },
                    { value: 'system' as const, label: '跟随系统', icon: Monitor },
                  ].map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      onClick={() => updateGeneral({ theme: value })}
                      className={`flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition-colors ${
                        settings.general.theme === value
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 hover:border-gray-300 dark:border-gray-600'
                      }`}
                    >
                      <Icon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                      <span className="text-xs">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 字号 */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  字号: {settings.general.fontSize}px
                </label>
                <input
                  type="range"
                  min={12}
                  max={20}
                  value={settings.general.fontSize}
                  onChange={(e) => updateGeneral({ fontSize: Number(e.target.value) })}
                  className="w-full"
                />
              </div>

              {/* 启动恢复 */}
              <div>
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={settings.general.restoreSession}
                    onChange={(e) => updateGeneral({ restoreSession: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300">启动时恢复上次会话</div>
                    <div className="text-xs text-gray-400">打开应用时自动恢复上次的对话</div>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* === 网络设置 === */}
          {activeSection === 'network' && (
            <div className="max-w-xl space-y-6">
              {/* 全局代理 */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">全局代理地址</label>
                <input
                  type="text"
                  value={settings.network.proxyURL || ''}
                  onChange={(e) => updateNetwork({ proxyURL: e.target.value || undefined })}
                  placeholder="例如: http://127.0.0.1:7890"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-[#0f0f23] dark:text-gray-200"
                />
                <p className="mt-1 text-xs text-gray-400">设置后，所有 API 请求将通过此代理发出</p>
              </div>

              {/* 请求超时 */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  请求超时: {settings.network.timeout / 1000}s
                </label>
                <input
                  type="range"
                  min={10000}
                  max={120000}
                  step={10000}
                  value={settings.network.timeout}
                  onChange={(e) => updateNetwork({ timeout: Number(e.target.value) })}
                  className="w-full"
                />
              </div>

              {/* 自动重试 */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">自动重试次数: {settings.network.maxRetries}</label>
                <input
                  type="range"
                  min={0}
                  max={5}
                  value={settings.network.maxRetries}
                  onChange={(e) => updateNetwork({ maxRetries: Number(e.target.value) })}
                  className="w-full"
                />
              </div>

              {/* 断路阈值 */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  断路保护阈值: {settings.network.circuitBreakerThreshold} 次
                </label>
                <input
                  type="range"
                  min={3}
                  max={10}
                  value={settings.network.circuitBreakerThreshold}
                  onChange={(e) => updateNetwork({ circuitBreakerThreshold: Number(e.target.value) })}
                  className="w-full"
                />
                <p className="mt-1 text-xs text-gray-400">连续失败达到该次数后自动禁用该模型</p>
              </div>
            </div>
          )}

          {/* === 隐私设置 === */}
          {activeSection === 'privacy' && (
            <div className="max-w-xl space-y-6">
              {/* 数据加密 */}
              <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-600">
                <h4 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">数据加密</h4>
                <p className="mb-3 text-xs text-gray-400">
                  API 密钥使用 AES-256-GCM 加密存储，密钥从主密码派生（PBKDF2）
                </p>
                <label className="mb-1.5 block text-sm text-gray-600 dark:text-gray-400">加密主密码</label>
                <input
                  type="password"
                  value={settings.privacy.encryptionKey || ''}
                  onChange={(e) => updateSettings({ privacy: { ...settings.privacy, encryptionKey: e.target.value || undefined } })}
                  placeholder="输入主密码以保护 API 密钥..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-[#0f0f23] dark:text-gray-200"
                />
              </div>

              {/* 本地模型 */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Ollama 本地模型路径</label>
                <input
                  type="text"
                  value={settings.privacy.localModelPath || ''}
                  onChange={(e) => updateSettings({ privacy: { ...settings.privacy, localModelPath: e.target.value || undefined } })}
                  placeholder="例如: http://localhost:11434"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-[#0f0f23] dark:text-gray-200"
                />
                <p className="mt-1 text-xs text-gray-400">接入本地 Ollama 模型，数据完全本地处理</p>
              </div>

              {/* 匿名统计 */}
              <div>
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={settings.privacy.allowTelemetry}
                    onChange={(e) => updateSettings({ privacy: { ...settings.privacy, allowTelemetry: e.target.checked } })}
                    className="h-4 w-4"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300">允许匿名使用统计</div>
                    <div className="text-xs text-gray-400">帮助我们改进产品，不包含任何个人信息</div>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* === 成本设置 === */}
          {activeSection === 'cost' && (
            <div className="max-w-xl space-y-6">
              {/* 日预算 */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  日预算上限: ¥{settings.costControl.dailyBudget}
                </label>
                <input
                  type="range"
                  min={10}
                  max={1000}
                  step={10}
                  value={settings.costControl.dailyBudget}
                  onChange={(e) => updateSettings({ costControl: { ...settings.costControl, dailyBudget: Number(e.target.value) } })}
                  className="w-full"
                />
                <div className="mt-1 flex justify-between text-xs text-gray-400">
                  <span>¥10</span>
                  <span>¥1000</span>
                </div>
              </div>

              {/* 月预算 */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  月预算上限: ¥{settings.costControl.monthlyBudget}
                </label>
                <input
                  type="range"
                  min={100}
                  max={10000}
                  step={100}
                  value={settings.costControl.monthlyBudget}
                  onChange={(e) => updateSettings({ costControl: { ...settings.costControl, monthlyBudget: Number(e.target.value) } })}
                  className="w-full"
                />
                <div className="mt-1 flex justify-between text-xs text-gray-400">
                  <span>¥100</span>
                  <span>¥10,000</span>
                </div>
              </div>

              {/* 警告比例 */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  预算警告比例: {(settings.costControl.warningRatio * 100).toFixed(0)}%
                </label>
                <input
                  type="range"
                  min={50}
                  max={95}
                  step={5}
                  value={settings.costControl.warningRatio * 100}
                  onChange={(e) => updateSettings({ costControl: { ...settings.costControl, warningRatio: Number(e.target.value) / 100 } })}
                  className="w-full"
                />
                <p className="mt-1 text-xs text-gray-400">达到该比例时弹出预算警告</p>
              </div>

              {/* 当前用量摘要 */}
              <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-600">
                <h4 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">当前用量摘要</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg bg-gray-50 p-3 dark:bg-[#0f0f23]">
                    <div className="text-xs text-gray-400">今日用量</div>
                    <div className="mt-1 text-lg font-semibold">¥0.00</div>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3 dark:bg-[#0f0f23]">
                    <div className="text-xs text-gray-400">本月用量</div>
                    <div className="mt-1 text-lg font-semibold">¥0.00</div>
                  </div>
                </div>
              </div>

              {/* 模型定价速查 */}
              <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-600">
                <h4 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">模型定价速查</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-600">
                        <th className="pb-2 text-left text-gray-500">模型</th>
                        <th className="pb-2 text-right text-gray-500">输入</th>
                        <th className="pb-2 text-right text-gray-500">输出</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {[
                        { name: 'DeepSeek-V4-Flash', input: 2, output: 8 },
                        { name: 'DeepSeek-V4-Pro', input: 4, output: 16 },
                        { name: 'Qwen3-235B', input: 4, output: 12 },
                        { name: 'GLM-4-Plus', input: 50, output: 50 },
                        { name: 'Doubao-1.5-pro', input: 5, output: 9 },
                        { name: 'Hunyuan-Turbo', input: 15, output: 50 },
                        { name: 'Kimi-K2', input: 8, output: 8 },
                        { name: 'ERNIE-4.0-Turbo', input: 30, output: 90 },
                      ].map((m) => (
                        <tr key={m.name}>
                          <td className="py-1.5 text-gray-700 dark:text-gray-300">{m.name}</td>
                          <td className="py-1.5 text-right text-gray-500">¥{m.input}/M</td>
                          <td className="py-1.5 text-right text-gray-500">¥{m.output}/M</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-gray-400">单位：元/百万 tokens</p>
              </div>
            </div>
          )}

          {/* === 插件管理 === */}
          {activeSection === 'plugin' && (
            <div className="max-w-xl space-y-4">
              <p className="text-sm text-gray-500">管理已安装的插件，启用或禁用扩展功能</p>
              {[
                { id: 'file-parser', name: '文件解析引擎', desc: 'PDF/DOCX/XLSX/PPTX 解析', active: true, version: '0.1.0' },
                { id: 'web-search', name: '联网搜索', desc: 'DuckDuckGo 搜索集成', active: true, version: '0.1.0' },
                { id: 'shell-executor', name: 'Shell 执行器', desc: '安全终端命令执行', active: true, version: '0.1.0' },
                { id: 'exporter', name: '对话导出', desc: 'Markdown / JSON 格式导出', active: true, version: '0.1.0' },
              ].map((plugin) => (
                <div
                  key={plugin.id}
                  className="flex items-center gap-4 rounded-lg border border-gray-200 p-4 dark:border-gray-600"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                    <Puzzle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{plugin.name}</span>
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-gray-700">v{plugin.version}</span>
                    </div>
                    <div className="text-xs text-gray-400">{plugin.desc}</div>
                  </div>
                  {/* TODO: implement plugin enable/disable toggle */}
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      plugin.active
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-gray-100 text-gray-400 dark:bg-gray-700'
                    }`}
                  >
                    {plugin.active ? '已启用' : '已禁用'}
                  </span>
                </div>
              ))}
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 p-6 text-center dark:border-gray-600">
                <div className="flex-1 text-xs text-gray-400">
                  拖放 .zip 插件包或 <button className="text-blue-500 hover:underline">选择文件</button> 安装新插件
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
