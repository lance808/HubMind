/**
 * 模型管理器 - 一站式管理所有模型配置
 * 
 * 职责：
 * 1. 模型配置的 CRUD
 * 2. 模型切换与对比
 * 3. Token 用量统计与成本预算
 * 4. API 断路保护与自动重试
 * 5. 代理/中转配置管理
 */

import type { ModelConfig, ModelProvider, ModelCapability, TokenUsage, AggregationPlatform } from '@hubmind/shared'
import { AdapterFactory } from '../adapters/base-adapter'

// ============ 内置模型预设 ============

interface ModelPreset {
  provider: ModelProvider
  platform: AggregationPlatform
  name: string
  modelId: string
  baseURL: string
  capabilities: ModelCapability[]
  maxContextTokens: number
  maxOutputTokens: number
  supportsVision: boolean
  /** 价格(元/百万tokens) */
  pricing: {
    input: number
    output: number
  }
}

/** 内置国产模型预设列表 */
export const BUILTIN_PRESETS: ModelPreset[] = [
  // DeepSeek (V4 系列，2026年更新)
  {
    provider: 'deepseek', platform: 'none',
    name: 'DeepSeek-V4-Flash', modelId: 'deepseek-v4-flash',
    baseURL: 'https://api.deepseek.com',
    capabilities: ['chat', 'function-calling', 'streaming', 'json-mode'],
    maxContextTokens: 65536, maxOutputTokens: 8192, supportsVision: false,
    pricing: { input: 2, output: 8 },
  },
  {
    provider: 'deepseek', platform: 'none',
    name: 'DeepSeek-V4-Pro', modelId: 'deepseek-v4-pro',
    baseURL: 'https://api.deepseek.com',
    capabilities: ['chat', 'function-calling', 'streaming'],
    maxContextTokens: 65536, maxOutputTokens: 8192, supportsVision: false,
    pricing: { input: 4, output: 16 },
  },
  // 阿里通义
  {
    provider: 'qwen', platform: 'none',
    name: 'Qwen3-235B-A22B', modelId: 'qwen3-235b-a22b',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    capabilities: ['chat', 'function-calling', 'streaming', 'vision'],
    maxContextTokens: 131072, maxOutputTokens: 8192, supportsVision: true,
    pricing: { input: 4, output: 12 },
  },
  {
    provider: 'qwen', platform: 'none',
    name: 'Qwen-Max', modelId: 'qwen-max',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    capabilities: ['chat', 'function-calling', 'streaming', 'json-mode'],
    maxContextTokens: 32768, maxOutputTokens: 8192, supportsVision: false,
    pricing: { input: 20, output: 60 },
  },
  // 智谱 GLM
  {
    provider: 'glm', platform: 'none',
    name: 'GLM-4-Plus', modelId: 'glm-4-plus',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    capabilities: ['chat', 'function-calling', 'streaming', 'vision', 'json-mode'],
    maxContextTokens: 131072, maxOutputTokens: 4096, supportsVision: true,
    pricing: { input: 50, output: 50 },
  },
  // 字节豆包
  {
    provider: 'doubao', platform: 'none',
    name: 'Doubao-1.5-pro-256k', modelId: 'doubao-1-5-pro-256k',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    capabilities: ['chat', 'function-calling', 'streaming'],
    maxContextTokens: 262144, maxOutputTokens: 8192, supportsVision: false,
    pricing: { input: 5, output: 9 },
  },
  // 腾讯混元
  {
    provider: 'hunyuan', platform: 'none',
    name: 'Hunyuan-Turbo', modelId: 'hunyuan-turbo',
    baseURL: 'https://api.hunyuan.cloud.tencent.com/v1',
    capabilities: ['chat', 'function-calling', 'streaming'],
    maxContextTokens: 32768, maxOutputTokens: 8192, supportsVision: false,
    pricing: { input: 15, output: 50 },
  },
  // 月之暗面 Kimi
  {
    provider: 'moonshot', platform: 'none',
    name: 'Kimi-K2', modelId: 'kimi-k2-0905-preview',
    baseURL: 'https://api.moonshot.cn/v1',
    capabilities: ['chat', 'function-calling', 'streaming'],
    maxContextTokens: 131072, maxOutputTokens: 8192, supportsVision: false,
    pricing: { input: 8, output: 8 },
  },
  // 百度文心
  {
    provider: 'ernie', platform: 'none',
    name: 'ERNIE-4.0-Turbo', modelId: 'ernie-4.0-turbo',
    baseURL: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1',
    capabilities: ['chat', 'function-calling', 'streaming'],
    maxContextTokens: 32768, maxOutputTokens: 4096, supportsVision: false,
    pricing: { input: 30, output: 90 },
  },
  // Ollama 本地
  {
    provider: 'ollama', platform: 'none',
    name: 'Ollama (本地)', modelId: 'llama3.2',
    baseURL: 'http://localhost:11434/v1',
    capabilities: ['chat', 'streaming'],
    maxContextTokens: 8192, maxOutputTokens: 4096, supportsVision: false,
    pricing: { input: 0, output: 0 },
  },
  // 聚合平台 — MoMA
  {
    provider: 'openai', platform: 'moma',
    name: 'MoMA 聚合平台', modelId: 'gpt-4o',
    baseURL: 'https://api.momacloud.com/v1',
    capabilities: ['chat', 'function-calling', 'streaming'],
    maxContextTokens: 128000, maxOutputTokens: 16384, supportsVision: true,
    pricing: { input: 1, output: 3 },
  },
  // 聚合平台 — 阿里百炼
  {
    provider: 'qwen', platform: 'bailian',
    name: '百炼 聚合平台', modelId: 'qwen-plus',
    baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    capabilities: ['chat', 'function-calling', 'streaming', 'vision'],
    maxContextTokens: 131072, maxOutputTokens: 8192, supportsVision: true,
    pricing: { input: 2, output: 8 },
  },
  // 聚合平台 — 千问云
  {
    provider: 'openai', platform: 'qianwen',
    name: '千问云 聚合平台', modelId: 'qwen-turbo',
    baseURL: 'https://api.qianwen.com/v1',
    capabilities: ['chat', 'streaming'],
    maxContextTokens: 32000, maxOutputTokens: 8192, supportsVision: false,
    pricing: { input: 1, output: 2 },
  },
]

// ============ 模型管理器 ============

export class ModelManager {
  private configs: Map<string, ModelConfig> = new Map()
  /** 用量统计：日期 -> 模型ID -> 用量 */
  private usageStats: Map<string, Map<string, TokenUsage>> = new Map()
  /** 连续失败计数（断路保护） */
  private failureCounts: Map<string, number> = new Map()
  /** 月度预算上限 */
  private monthlyBudget: number = 2000
  /** 日预算上限 */
  private dailyBudget: number = 100

  // ============ 配置管理 ============

  /** 从预设创建模型配置 */
  createFromPreset(preset: ModelPreset, apiKey: string): ModelConfig {
    const config: ModelConfig = {
      id: crypto.randomUUID(),
      name: preset.name,
      provider: preset.provider,
      platform: preset.platform,
      baseURL: preset.baseURL,
      apiKey,
      modelId: preset.modelId,
      supportsVision: preset.supportsVision,
      maxContextTokens: preset.maxContextTokens,
      maxOutputTokens: preset.maxOutputTokens,
      enabled: true,
      capabilities: preset.capabilities,
    }
    this.configs.set(config.id, config)
    return config
  }

  /** 添加自定义模型（兼容 OpenAI API 格式） */
  addCustomConfig(config: Omit<ModelConfig, 'id' | 'enabled'>): ModelConfig {
    const fullConfig: ModelConfig = {
      ...config,
      id: crypto.randomUUID(),
      enabled: true,
    }
    this.configs.set(fullConfig.id, fullConfig)
    return fullConfig
  }

  /** 获取所有配置 */
  getAllConfigs(): ModelConfig[] {
    return Array.from(this.configs.values())
  }

  /** 获取已启用的配置 */
  getEnabledConfigs(): ModelConfig[] {
    return this.getAllConfigs().filter((c) => c.enabled)
  }

  /** 获取单个配置 */
  getConfig(id: string): ModelConfig | undefined {
    return this.configs.get(id)
  }

  /** 更新配置 */
  updateConfig(id: string, updates: Partial<ModelConfig>): void {
    const config = this.configs.get(id)
    if (config) {
      Object.assign(config, updates)
    }
  }

  /** 删除配置 */
  deleteConfig(id: string): void {
    this.configs.delete(id)
  }

  // ============ 成本估算 ============

  /** 计算单次 API 调用的预估费用 */
  estimateCost(modelId: string, usage: { promptTokens: number; completionTokens: number }): number {
    const config = this.findConfigByModelId(modelId)
    if (!config) return 0

    const preset = BUILTIN_PRESETS.find((p) => p.modelId === modelId)
    if (!preset) return 0

    const inputCost = (usage.promptTokens / 1_000_000) * preset.pricing.input
    const outputCost = (usage.completionTokens / 1_000_000) * preset.pricing.output
    return inputCost + outputCost
  }

  /** 获取当日累计费用 */
  getDailyCost(): number {
    const today = new Date().toISOString().split('T')[0]
    const dayStats = this.usageStats.get(today)
    if (!dayStats) return 0

    let total = 0
    for (const usage of dayStats.values()) {
      total += usage.estimatedCost
    }
    return total
  }

  /** 检查是否超出预算 */
  isOverBudget(modelId: string, estimatedTokens: number): { over: boolean; warning: boolean; message?: string } {
    const estimatedCost = this.estimateCost(modelId, { promptTokens: estimatedTokens, completionTokens: 0 })
    const dailyCost = this.getDailyCost()
    const newDailyCost = dailyCost + estimatedCost

    if (newDailyCost >= this.dailyBudget) {
      return { over: true, warning: true, message: `已超过日预算上限 ${this.dailyBudget} 元` }
    }
    if (newDailyCost >= this.dailyBudget * 0.8) {
      return { over: false, warning: true, message: `已使用日预算的 80%，当日剩余约 ${(this.dailyBudget - dailyCost).toFixed(2)} 元` }
    }
    return { over: false, warning: false }
  }

  // ============ 断路保护 ============

  /** 记录失败 */
  recordFailure(modelId: string): void {
    const count = (this.failureCounts.get(modelId) || 0) + 1
    this.failureCounts.set(modelId, count)

    // 连续失败 5 次，自动禁用
    if (count >= 5) {
      const config = this.findConfigByModelId(modelId)
      if (config) {
        config.enabled = false
        console.warn(`[CircuitBreaker] ${modelId} 已自动禁用（连续失败 ${count} 次）`)
      }
    }
  }

  /** 记录成功 */
  recordSuccess(modelId: string): void {
    this.failureCounts.delete(modelId)
  }

  /** 检查是否熔断 */
  isCircuitBroken(modelId: string): boolean {
    return (this.failureCounts.get(modelId) || 0) >= 5
  }

  // ============ 模型对比 ============

  /** 同时向多个模型发送请求并对比结果 */
  async compareModels(
    modelIds: string[],
    prompt: string,
  ): Promise<Array<{ modelId: string; response: string; usage: TokenUsage }>> {
    const results = await Promise.allSettled(
      modelIds.map(async (modelId) => {
        const config = this.findConfigByModelId(modelId)
        if (!config) throw new Error(`模型 ${modelId} 未配置`)
        const adapter = AdapterFactory.getAdapter(config.provider)
        // 简化调用 - 实际实现需要完整 LLMRequest
        throw new Error('compareModels not fully implemented')
      }),
    )

    return results
      .filter((r) => r.status === 'fulfilled')
      .map((r) => (r as PromiseFulfilledResult<{ modelId: string; response: string; usage: TokenUsage }>).value)
  }

  // ============ 辅助方法 ============

  private findConfigByModelId(modelId: string): ModelConfig | undefined {
    return this.getAllConfigs().find((c) => c.modelId === modelId)
  }
}
