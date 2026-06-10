﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿/**
 * 模型适配器层 - 统一的多厂商 LLM 接入接口
 * 
 * 设计原则：
 * 1. 所有厂商统一通过 BaseAdapter 接入
 * 2. 国内模型 90% 兼容 OpenAI API 格式，使用 OpenAICompatibleAdapter
 * 3. 少数不兼容的厂商（如百度文心），独立实现适配器
 * 4. 支持聚合平台（移动MoMA、阿里云百炼等）一次配置多模型
 */

import type {
  LLMRequest,
  StreamChunk,
  ModelConfig,
  ModelProvider,
  ModelParams,
  TokenUsage,
  AdapterResponse,
  ValidationResult,
} from '@hubmind/shared'

// ============ 适配器基类 ============

export interface IModelAdapter {
  /** 适配器唯一标识 */
  readonly provider: ModelProvider

  /** 发送对话请求（非流式） */
  chat(config: ModelConfig, params: ModelParams, request: LLMRequest): Promise<AdapterResponse>

  /** 发送对话请求（流式） */
  chatStream(config: ModelConfig, params: ModelParams, request: LLMRequest): AsyncGenerator<StreamChunk>

  /** 验证 API 连接 */
  validateConnection(config: ModelConfig): Promise<ValidationResult>

  /** 获取模型列表 */
  listModels(config: ModelConfig): Promise<ModelInfo[]>

  /** 将内部消息格式转为厂商 API 格式 */
  convertMessages(messages: LLMRequest['messages']): unknown[]

  /** 估算 Token 数量 */
  estimateTokens(text: string): number
}

// ============ 响应类型 ============

export type { AdapterResponse } from '@hubmind/shared'

export interface ModelInfo {
  id: string
  name: string
  /** 是否可用 */
  available: boolean
}

// ============ OpenAI 兼容适配器（覆盖 DeepSeek/通义/GLM/豆包/混元/Moonshot） ============

/**
 * 所有兼容 OpenAI Chat Completions API 的国内模型共用此适配器
 * 
 * 兼容厂商列表：
 * - DeepSeek:      https://api.deepseek.com/v1
 * - 阿里通义(Qwen): https://dashscope.aliyuncs.com/compatible-mode/v1
 * - 智谱(GLM):     https://open.bigmodel.cn/api/paas/v4
 * - 字节豆包:       https://ark.cn-beijing.volces.com/api/v3
 * - 腾讯混元:       https://api.hunyuan.cloud.tencent.com/v1
 * - 月之暗面(Kimi): https://api.moonshot.cn/v1
 * - 百度文心(部分):  https://aip.baidubce.com/rpc/2.0/ai_custom/v1
 */
export class OpenAICompatibleAdapter implements IModelAdapter {
  readonly provider: ModelProvider

  constructor(provider: ModelProvider) {
    this.provider = provider
  }

  async chat(config: ModelConfig, params: ModelParams, request: LLMRequest): Promise<AdapterResponse> {
    const body = this.buildRequestBody(config, params, request, false)
    const response = await this.fetchWithRetry(config, body)
    return await this.parseResponse(response)
  }

  async *chatStream(config: ModelConfig, params: ModelParams, request: LLMRequest): AsyncGenerator<StreamChunk> {
    const body = this.buildRequestBody(config, params, request, true)
    const response = await this.fetchWithRetry(config, body, true)

    if (!response.ok || !response.body) {
      throw new Error(`API error: ${response.status} ${response.statusText}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') {
          yield { delta: '', done: true }
          return
        }
        try {
          const parsed = JSON.parse(data)
          const chunk = this.parseStreamChunk(parsed)
          if (chunk) yield chunk
        } catch {
          // 跳过无法解析的行
        }
      }
    }
  }

  async validateConnection(config: ModelConfig): Promise<ValidationResult> {
    try {
      const controller = new AbortController()
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => {
          controller.abort()
          reject(new Error('TIMEOUT'))
        }, 10000),
      )
      const response = await Promise.race([
        fetch(`${config.baseURL}/models`, {
          headers: this.buildHeaders(config),
          signal: controller.signal,
        }),
        timeout,
      ])
      if (response.ok) return { success: true }
      return {
        success: false,
        code: String(response.status),
        message: `${response.status} ${response.statusText}`,
        suggestion: statusSuggestion(response.status),
      }
    } catch (err) {
      const msg = (err as Error).message || ''
      if (msg === 'TIMEOUT' || (err as Error).name === 'AbortError') {
        return {
          success: false,
          code: 'TIMEOUT',
          message: '连接超时（10s）',
          suggestion: '请检查 API 地址是否正确、网络是否可达，或尝试配置代理',
        }
      }
      return {
        success: false,
        code: 'NETWORK_ERROR',
        message: msg || '网络请求失败',
        suggestion: '请检查网络连接、防火墙设置，或尝试配置代理地址',
      }
    }
  }

  async listModels(config: ModelConfig): Promise<ModelInfo[]> {
    const response = await fetch(`${config.baseURL}/models`, {
      headers: this.buildHeaders(config),
    })
    if (!response.ok) return []

    const data = await response.json() as { data?: Array<{ id: string }> }
    if (!data.data) return []
    return data.data.map((m: { id: string }) => ({
      id: m.id,
      name: m.id,
      available: true,
    }))
  }

  convertMessages(messages: LLMRequest['messages']): unknown[] {
    return messages.map((msg) => {
      // 如果 content 是字符串直接返回
      if (typeof msg.content === 'string') {
        return { role: msg.role, content: msg.content }
      }

      // 多模态消息：分离文本和图片
      const textParts = msg.content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map((c) => ({ type: 'text', text: c.text }))

      const imageParts = msg.content
        .filter((c): c is { type: 'image'; data: string; mimeType: string } => c.type === 'image')
        .map((c) => ({
          type: 'image_url',
          image_url: { url: `data:${c.mimeType};base64,${c.data}` },
        }))

      return {
        role: msg.role,
        content: [...textParts, ...imageParts],
      }
    })
  }

  estimateTokens(text: string): number {
    // 中文约 1.5 字符/token，英文约 4 字符/token
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length
    const otherChars = text.length - chineseChars
    return Math.ceil(chineseChars / 1.5 + otherChars / 4)
  }

  // ============ 私有方法 ============

  private buildHeaders(config: ModelConfig): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      ...config.customHeaders,
    }
  }

  private buildRequestBody(
    config: ModelConfig,
    params: ModelParams,
    request: LLMRequest,
    stream: boolean,  // 标记：跳过 data: 行
  ): { url: string; init: RequestInit } {
    const body = {
      model: config.modelId,
      messages: this.convertMessages(request.messages),
      temperature: params.temperature,
      top_p: params.topP,
      max_tokens: params.maxTokens,
      frequency_penalty: params.frequencyPenalty,
      presence_penalty: params.presencePenalty,
      stop: params.stop.length > 0 ? params.stop : undefined,
      stream,
      ...(request.tools?.length && { tools: request.tools }),
      ...(request.responseFormat && { response_format: request.responseFormat }),
    }

    return {
      url: `${config.baseURL}/chat/completions`,
      init: {
        method: 'POST',
        headers: this.buildHeaders(config),
        body: JSON.stringify(body),
      },
    }
  }

  private async fetchWithRetry(
    config: ModelConfig,
    request: { url: string; init: RequestInit },
    stream?: boolean,
  ): Promise<Response> {
    // 简单重试逻辑（后续替换为完整的断路保护）
    const maxRetries = 3
    let lastError: Error | null = null

    for (let i = 0; i < maxRetries; i++) {
      try {
        const url = config.proxyURL
          ? request.url.replace(config.baseURL, config.proxyURL)
          : request.url

        const response = await fetch(url, request.init)
        if (response.ok || stream) return response

        // 4xx 错误不重试
        if (response.status >= 400 && response.status < 500) return response

        lastError = new Error(`HTTP ${response.status}`)
      } catch (e) {
        lastError = e as Error
      }

      // 指数退避
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, i)))
    }

    throw lastError || new Error('Max retries exceeded')
  }

  private async parseResponse(response: Response): Promise<AdapterResponse> {
    const data = (await response.json()) as {
      choices: Array<{
        message: {
          content: string
          tool_calls?: Array<{
            id: string
            function: { name: string; arguments: string }
          }>
        }
        finish_reason: string
      }>
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
    }

    // 实际用 await，这里简化为同步示意
    const choice = data.choices[0]
    return {
      content: choice.message.content || '',
      toolCalls: choice.message.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      })),
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
        estimatedCost: 0, // 由上层根据模型定价计算
      },
      finishReason: choice.finish_reason as AdapterResponse['finishReason'],
    }
  }

  private parseStreamChunk(data: Record<string, unknown>): StreamChunk | null {
    const choices = data.choices as Array<{
      delta: { content?: string; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }> }
      finish_reason: string | null
    }>
    if (!choices?.[0]) return null

    const choice = choices[0]
    return {
      delta: choice.delta.content || '',
      done: choice.finish_reason !== null,
      toolCalls: choice.delta.tool_calls?.map((tc) => ({
        id: tc.id || '',
        name: tc.function?.name || '',
        arguments: tc.function?.arguments || '',
      })),
    }
  }
}

// ============ 百度文心适配器（非 OpenAI 兼容） ============

/**
 * 百度文心一言使用独立的 API 格式（OAuth 2.0 鉴权）
 * 
 * 鉴权流程：
 * 1. 使用 API Key + Secret Key 获取 access_token
 * 2. access_token 30天有效，需缓存
 * 
 * API Key 格式：在 apiKey 字段中存储 "client_id|client_secret"
 * 文档: https://cloud.baidu.com/doc/WENXINWORKSHOP/s/jlil56u11
 */
export class ErnieAdapter implements IModelAdapter {
  readonly provider: ModelProvider = 'ernie'

  // Token 缓存
  private tokenCache: Map<string, { token: string; expiresAt: number }> = new Map()

  // 各模型对应的 API 路径
  private static readonly MODEL_PATHS: Record<string, string> = {
    'ernie-4.0-turbo': 'completions_pro',
    'ernie-4.0': 'completions_pro',
    'ernie-3.5': 'completions',
    'ernie-speed': 'ernie_speed',
  }

  /** 获取 OAuth access_token */
  private async getAccessToken(config: ModelConfig): Promise<string> {
    const cacheKey = config.id
    const cached = this.tokenCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.token
    }

    // apiKey 格式: "client_id|client_secret" 或单独的 API Key (使用 client_credentials)
    const parts = config.apiKey.split('|')
    const clientId = parts[0]
    const clientSecret = parts[1] || parts[0]

    const url = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`

    const response = await fetch(url, { method: 'POST' })
    if (!response.ok) throw new Error(`OAuth token request failed: ${response.status}`)

    const data = await response.json() as { access_token: string; expires_in: number; error?: string; error_description?: string }
    if (data.error) throw new Error(`OAuth error: ${data.error} - ${data.error_description}`)

    // 缓存 token（提前 1 小时过期）
    const token = data.access_token
    const expiresAt = Date.now() + (data.expires_in - 3600) * 1000
    this.tokenCache.set(cacheKey, { token, expiresAt })

    return token
  }

  /** 获取模型 API 地址 */
  private getApiPath(modelId: string): string {
    return ErnieAdapter.MODEL_PATHS[modelId] || 'completions'
  }

  async chat(config: ModelConfig, params: ModelParams, request: LLMRequest): Promise<AdapterResponse> {
    const token = await this.getAccessToken(config)
    const apiPath = this.getApiPath(config.modelId)
    const url = `https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/${apiPath}?access_token=${token}`

    const body = {
      messages: this.convertMessages(request.messages),
      temperature: params.temperature,
      top_p: params.topP,
      max_output_tokens: params.maxTokens,
      ...(request.responseFormat?.type === 'json_object' && { response_format: 'json_object' }),
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) throw new Error(`Ernie API error: ${response.status}`)

    const data = await response.json() as {
      result: string
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
      is_end: boolean
      error_code?: number
      error_msg?: string
    }

    if (data.error_code) {
      throw new Error(`Ernie API error: ${data.error_code} - ${data.error_msg}`)
    }

    return {
      content: data.result,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
        estimatedCost: 0,
      },
      finishReason: 'stop',
    }
  }

  async *chatStream(config: ModelConfig, params: ModelParams, request: LLMRequest): AsyncGenerator<StreamChunk> {
    const token = await this.getAccessToken(config)
    const apiPath = this.getApiPath(config.modelId)
    const url = `https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/${apiPath}?access_token=${token}`

    const body = {
      messages: this.convertMessages(request.messages),
      temperature: params.temperature,
      top_p: params.topP,
      max_output_tokens: params.maxTokens,
      stream: true,
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) throw new Error(`Ernie API error: ${response.status}`)
    if (!response.body) throw new Error('No response body')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        try {
          const parsed = JSON.parse(data) as {
            result?: string
            is_end?: boolean
            error_code?: number
          }
          if (parsed.error_code) {
            yield { delta: '', done: true }
            return
          }
          yield {
            delta: parsed.result || '',
            done: parsed.is_end || false,
          }
        } catch {
          // skip
        }
      }
    }
  }

  async validateConnection(config: ModelConfig): Promise<ValidationResult> {
    try {
      await this.getAccessToken(config)
      return { success: true }
    } catch (err) {
      const msg = (err as Error).message || ''
      if (msg.includes('OAuth') || msg.includes('401') || msg.includes('unauthorized')) {
        return {
          success: false,
          code: 'AUTH_ERROR',
          message: msg,
          suggestion: '百度文心需要 API Key 和 Secret Key，格式为 "client_id|client_secret"',
        }
      }
      return {
        success: false,
        code: 'NETWORK_ERROR',
        message: msg || '网络请求失败',
        suggestion: '请检查网络连接，或确认百度文心 API 服务是否可用',
      }
    }
  }

  async listModels(_config: ModelConfig): Promise<ModelInfo[]> {
    // 百度文心不提供公开的模型列表 API
    return [
      { id: 'ernie-4.0-turbo', name: 'ERNIE-4.0-Turbo', available: true },
      { id: 'ernie-4.0', name: 'ERNIE-4.0', available: true },
      { id: 'ernie-3.5', name: 'ERNIE-3.5', available: true },
      { id: 'ernie-speed', name: 'ERNIE-Speed', available: true },
    ]
  }

  convertMessages(messages: LLMRequest['messages']): unknown[] {
    return messages.map((m) => ({
      role: m.role === 'tool' ? 'user' : m.role,
      content: typeof m.content === 'string' ? m.content : m.content.map((c) => c.type === 'text' ? c.text : '').join('\n'),
    }))
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 1.5)
  }
}

// ============ HTTP 状态码 → 排查建议 ============

function statusSuggestion(status: number): string {
  switch (status) {
    case 401:
      return '认证失败，请检查 API Key 是否正确，或是否已过期'
    case 403:
      return '访问被拒绝，请确认 API Key 具有相应权限，或账户余额是否充足'
    case 404:
      return 'API 端点不存在，请检查 API 地址 (baseURL) 配置是否正确'
    case 429:
      return '请求过于频繁，请稍后重试或检查 API 调用配额'
    case 500:
    case 502:
    case 503:
      return `服务器错误 (${status})，请检查 API 服务状态，或稍后重试`
    default:
      if (status >= 400 && status < 500) return `客户端错误 (${status})，请检查 API 配置参数`
      if (status >= 500) return `服务器错误 (${status})，请稍后重试或联系 API 提供商`
      return '未知错误，请检查网络和 API 配置'
  }
}

// ============ 适配器工厂 ============

/**
 * 适配器工厂 - 按厂商创建对应的适配器实例
 * 所有适配器实例为单例，避免重复初始化
 */
export class AdapterFactory {
  private static adapters = new Map<ModelProvider, IModelAdapter>()

  static getAdapter(provider: ModelProvider): IModelAdapter {
    if (!this.adapters.has(provider)) {
      this.adapters.set(provider, this.createAdapter(provider))
    }
    return this.adapters.get(provider)!
  }

  private static createAdapter(provider: ModelProvider): IModelAdapter {
    switch (provider) {
      case 'ernie':
        return new ErnieAdapter()
      // 所有 OpenAI 兼容的厂商共用同一个适配器类
      case 'deepseek':
      case 'qwen':
      case 'glm':
      case 'doubao':
      case 'hunyuan':
      case 'moonshot':
      case 'ollama':
      case 'openai':
      case 'custom':
      default:
        return new OpenAICompatibleAdapter(provider)
    }
  }
}
