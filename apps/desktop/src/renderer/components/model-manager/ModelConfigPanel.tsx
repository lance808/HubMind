import { useState } from 'react'
import { Plus, Trash2, CheckCircle, XCircle, Loader2, Key, AlertTriangle } from 'lucide-react'
import { api } from '../../lib/api'
import { useModelStore } from '../../stores'
import { BUILTIN_PRESETS } from '@hubmind/core'
import type { ModelConfig, ValidationResult } from '@hubmind/shared'

interface ModelConfigPanelProps {
  onClose: () => void
}

/**
 * 模型配置面板
 * - 从预设快速添加
 * - 自定义配置
 * - 连接测试
 * - 已配置模型列表
 */
export function ModelConfigPanel({ onClose }: ModelConfigPanelProps) {
  const { modelConfigs, addConfig, updateConfig, deleteConfig } = useModelStore()
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, ValidationResult>>({})
  const [showAdd, setShowAdd] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [selectedPreset, setSelectedPreset] = useState('')
  const [errorDialog, setErrorDialog] = useState<ValidationResult | null>(null)

  const handleAddFromPreset = async () => {
    if (!selectedPreset || !apiKey.trim()) return

    const preset = BUILTIN_PRESETS.find((p) => p.name === selectedPreset)
    if (!preset) return

    const config: ModelConfig = {
      id: crypto.randomUUID(),
      name: preset.name,
      provider: preset.provider,
      platform: preset.platform,
      baseURL: preset.baseURL,
      apiKey: apiKey.trim(),
      modelId: preset.modelId,
      supportsVision: preset.supportsVision,
      maxContextTokens: preset.maxContextTokens,
      maxOutputTokens: preset.maxOutputTokens,
      enabled: true,
      capabilities: preset.capabilities,
    }

    await addConfig(config)
    setApiKey('')
    setSelectedPreset('')
    setShowAdd(false)
  }

  const handleToggle = (config: ModelConfig) => {
    updateConfig(config.id, { enabled: !config.enabled })
  }

  const handleDelete = async (id: string) => {
    await deleteConfig(id)
  }

  const handleTest = async (config: ModelConfig) => {
    setTestingId(config.id)
    try {
      const result = await api.llm.validate(config)
      setTestResults((prev) => ({ ...prev, [config.id]: result }))
      if (!result.success) {
        setErrorDialog(result)
      }
    } catch {
      const fallback: ValidationResult = {
        success: false,
        code: 'IPC_ERROR',
        message: '进程通信异常',
        suggestion: '请重启应用后重试',
      }
      setTestResults((prev) => ({ ...prev, [config.id]: fallback }))
      setErrorDialog(fallback)
    } finally {
      setTestingId(null)
    }
  }

  // 已配置的模型 ID 集合
  const addedModelIds = new Set(modelConfigs.map((c) => c.modelId))
  const availablePresets = BUILTIN_PRESETS.filter((p) => !addedModelIds.has(p.modelId))

  return (
    <div className="flex h-full flex-col">
      {/* 头部 */}
      <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-700">
        <h2 className="text-lg font-semibold">模型管理</h2>
        <button onClick={onClose} className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-700">
          <XCircle className="h-5 w-5" />
        </button>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* 添加按钮 */}
        {!showAdd && (
          <button
            onClick={() => setShowAdd(true)}
            className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 py-3 text-sm text-gray-500 transition-colors hover:border-blue-400 hover:text-blue-600 dark:border-gray-600 dark:hover:border-blue-500 dark:hover:text-blue-400"
          >
            <Plus className="h-4 w-4" />
            添加模型
          </button>
        )}

        {/* 添加表单 */}
        {showAdd && (
          <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-600 dark:bg-[#12122a]">
            <h3 className="mb-3 text-sm font-medium">从预设快速添加</h3>

            {/* 预设选择 */}
            <div className="mb-3">
              <label className="mb-1 block text-xs text-gray-500">选择模型</label>
              <select
                value={selectedPreset}
                onChange={(e) => setSelectedPreset(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-[#1a1a3a] dark:text-gray-200"
              >
                <option value="">-- 选择一个模型 --</option>
                {availablePresets.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} ({p.provider})
                  </option>
                ))}
              </select>
            </div>

            {/* API Key */}
            <div className="mb-3">
              <label className="mb-1 block text-xs text-gray-500">API Key</label>
              <div className="relative">
                <Key className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="输入 API Key..."
                  className="w-full rounded-md border border-gray-300 bg-white py-2 pl-8 pr-3 text-sm dark:border-gray-600 dark:bg-[#1a1a3a] dark:text-gray-200"
                />
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-2">
              <button
                onClick={handleAddFromPreset}
                disabled={!selectedPreset || !apiKey.trim()}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                添加
              </button>
              <button
                onClick={() => setShowAdd(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {/* 配置列表 */}
        {modelConfigs.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">
            暂无模型配置，点击上方按钮添加
          </div>
        ) : (
          <div className="space-y-2">
            {modelConfigs.map((config) => (
              <div
                key={config.id}
                className="rounded-lg border border-gray-200 p-3 dark:border-gray-600"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${
                          config.enabled ? 'bg-green-500' : 'bg-gray-300'
                        }`}
                      />
                      <span className="font-medium text-sm">{config.name}</span>
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500 dark:bg-gray-700">
                        {config.provider}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-400">{config.baseURL}</p>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* 测试按钮 */}
                    <button
                      onClick={() => {
                        const result = testResults[config.id]
                        if (result && !result.success) {
                          setErrorDialog(result)
                        } else {
                          handleTest(config)
                        }
                      }}
                      disabled={testingId === config.id}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
                      title={testResults[config.id]?.success === false ? '点击查看错误详情' : '测试连接'}
                    >
                      {testingId === config.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : testResults[config.id] !== undefined ? (
                        testResults[config.id].success ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500 cursor-pointer" />
                        )
                      ) : (
                        <span className="text-xs">测试</span>
                      )}
                    </button>

                    {/* 启用/禁用 */}
                    <button
                      onClick={() => handleToggle(config)}
                      className="rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      {config.enabled ? '禁用' : '启用'}
                    </button>

                    {/* 删除 */}
                    <button
                      onClick={() => handleDelete(config.id)}
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 错误详情弹窗 */}
      {errorDialog && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-sm rounded-lg border border-red-200 bg-white shadow-xl dark:border-red-800 dark:bg-[#1a1a3a]">
            <div className="flex items-center gap-3 border-b border-red-100 p-4 dark:border-red-800/50">
              <AlertTriangle className="h-5 w-5 flex-shrink-0 text-red-500" />
              <h3 className="font-semibold text-sm">连接测试失败</h3>
              <button
                onClick={() => setErrorDialog(null)}
                className="ml-auto rounded p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <XCircle className="h-4 w-4 text-gray-400" />
              </button>
            </div>
            <div className="space-y-3 p-4 text-sm">
              <div>
                <span className="text-xs text-gray-400">错误码</span>
                <p className="mt-0.5 font-mono text-xs text-red-600 dark:text-red-400">
                  {errorDialog.code || 'UNKNOWN'}
                </p>
              </div>
              {errorDialog.message && (
                <div>
                  <span className="text-xs text-gray-400">错误信息</span>
                  <p className="mt-0.5 text-gray-700 dark:text-gray-300">
                    {errorDialog.message}
                  </p>
                </div>
              )}
              {errorDialog.suggestion && (
                <div>
                  <span className="text-xs text-gray-400">排查建议</span>
                  <p className="mt-0.5 text-gray-600 dark:text-gray-400">
                    {errorDialog.suggestion}
                  </p>
                </div>
              )}
            </div>
            <div className="flex justify-end border-t border-gray-100 p-3 dark:border-gray-700">
              <button
                onClick={() => setErrorDialog(null)}
                className="rounded-md bg-gray-100 px-4 py-1.5 text-xs text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
