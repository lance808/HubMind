/**
 * 文件解析网关 - 统一的文件处理入口
 * 
 * 架构设计：
 * ┌─────────────────────────────────────────────────┐
 * │                 FileParserGateway                │
 * │  ┌──────────┐  ┌──────────┐  ┌───────────────┐ │
 * │  │ Type     │  │ Mode     │  │ Parser        │ │
 * │  │ Detector │→ │ Selector │→ │ Dispatcher    │ │
 * │  └──────────┘  └──────────┘  └───────────────┘ │
 * │                                    │            │
 * │         ┌──────────────────────────┤            │
 * │         ▼              ▼           ▼            │
 * │   ┌─────────┐   ┌──────────┐  ┌──────────┐    │
 * │   │ Image   │   │ Document │  │ Text/    │    │
 * │   │ Parser  │   │ Parser   │  │ Code     │    │
 * │   └─────────┘   └──────────┘  └──────────┘    │
 * └─────────────────────────────────────────────────┘
 * 
 * 解析策略：
 * 1. 图片: 视觉模型直接理解 > OCR 降级
 * 2. PDF: 结构化解析(pdf-parse) + 表格提取
 * 3. Office: mammoth(docx) / xlsx / pptx-extractor
 * 4. 纯文本/代码: 直接读取
 */

import type {
  ParseRequest,
  ParseResult,
  SupportedFileType,
  ParseMode,
  BoundingBox,
} from '@hubmind/shared'

// ============ 文件类型检测 ============

const EXTENSION_MAP: Record<string, SupportedFileType> = {
  '.pdf': 'pdf',
  '.docx': 'docx', '.doc': 'doc',
  '.xlsx': 'xlsx', '.xls': 'xls', '.csv': 'csv',
  '.pptx': 'pptx', '.ppt': 'ppt',
  '.txt': 'txt', '.md': 'md',
  '.jpg': 'jpg', '.jpeg': 'jpeg', '.png': 'png',
  '.gif': 'gif', '.webp': 'webp',
  '.js': 'code', '.ts': 'code', '.py': 'code',
  '.java': 'code', '.go': 'code', '.rs': 'code',
  '.cpp': 'code', '.c': 'code', '.h': 'code',
  '.json': 'code', '.xml': 'code', '.yaml': 'code',
  '.yml': 'code', '.toml': 'code',
}

const MIME_MAP: Record<string, SupportedFileType> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'text/csv': 'csv',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.ms-powerpoint': 'ppt',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

// ============ 解析器接口 ============

interface IFileParser {
  /** 支持的文件类型 */
  readonly supportedTypes: SupportedFileType[]
  /** 解析模式 */
  readonly mode: ParseMode
  /** 解析文件 */
  parse(request: ParseRequest): Promise<ParseResult>
  /** 是否支持该文件 */
  supports(fileType: SupportedFileType): boolean
}

// ============ 文本解析器 ============

class TextParser implements IFileParser {
  readonly supportedTypes: SupportedFileType[] = ['txt', 'md', 'code']
  readonly mode: ParseMode = 'raw'

  supports(fileType: SupportedFileType): boolean {
    return this.supportedTypes.includes(fileType)
  }

  async parse(request: ParseRequest): Promise<ParseResult> {
    const startTime = Date.now()
    try {
      // 通过 IPC 读取文件内容
      // const content = await window.electronAPI.readFile(request.filePath)
      const content = `[文件内容: ${request.filePath}]`

      return {
        success: true,
        content,
        duration: Date.now() - startTime,
      }
    } catch (e) {
      return {
        success: false,
        content: '',
        duration: Date.now() - startTime,
        error: (e as Error).message,
      }
    }
  }
}

// ============ 图片解析器 ============

class ImageParser implements IFileParser {
  readonly supportedTypes: SupportedFileType[] = ['jpg', 'jpeg', 'png', 'gif', 'webp']
  readonly mode: ParseMode = 'vision'

  supports(fileType: SupportedFileType): boolean {
    return this.supportedTypes.includes(fileType)
  }

  async parse(request: ParseRequest): Promise<ParseResult> {
    const startTime = Date.now()

    // 策略：
    // 1. vision 模式：读取图片为 base64，直接发给视觉模型（不做本地解析）
    // 2. ocr 模式：调用本地/云端 OCR 引擎提取文字

    if (request.parseMode === 'ocr') {
      // 调用 OCR 引擎（如 tesseract.js 或 PaddleOCR 服务）
      return {
        success: true,
        content: `[OCR 提取文本] ${request.filePath}`,
        boundingBoxes: [],
        duration: Date.now() - startTime,
      }
    }

    // vision 模式：返回 base64 数据，由上层发送给视觉模型
    return {
      success: true,
      content: `data:image/${request.fileType};base64,<encoded_data>`,
      duration: Date.now() - startTime,
    }
  }
}

// ============ 文档解析器 ============

class DocumentParser implements IFileParser {
  readonly supportedTypes: SupportedFileType[] = ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'csv', 'pptx', 'ppt']
  readonly mode: ParseMode = 'document'

  supports(fileType: SupportedFileType): boolean {
    return this.supportedTypes.includes(fileType)
  }

  async parse(request: ParseRequest): Promise<ParseResult> {
    const startTime = Date.now()

    try {
      let content = ''
      let structuredData: unknown = undefined
      let boundingBoxes: BoundingBox[] | undefined

      switch (request.fileType) {
        case 'pdf':
          ({ content, structuredData, boundingBoxes } = await this.parsePDF(request))
          break
        case 'docx':
        case 'doc':
          ({ content, structuredData } = await this.parseDOCX(request))
          break
        case 'xlsx':
        case 'xls':
        case 'csv':
          ({ content, structuredData } = await this.parseExcel(request))
          break
        case 'pptx':
        case 'ppt':
          ({ content } = await this.parsePPTX(request))
          break
      }

      return {
        success: true,
        content,
        structuredData,
        boundingBoxes,
        duration: Date.now() - startTime,
      }
    } catch (e) {
      return {
        success: false,
        content: '',
        duration: Date.now() - startTime,
        error: (e as Error).message,
      }
    }
  }

  private async parsePDF(request: ParseRequest): Promise<{
    content: string
    structuredData?: unknown
    boundingBoxes?: BoundingBox[]
  }> {
    // MVP 阶段使用 pdf-parse (pdf.js 的 Node 封装)
    // 完整版迁移到 Rust LiteParse 或 MinerU
    // const pdf = await import('pdf-parse')
    // const buffer = await readFile(request.filePath)
    // const data = await pdf.default(buffer)
    // return { content: data.text }

    return { content: `[PDF 解析内容] ${request.filePath}` }
  }

  private async parseDOCX(request: ParseRequest): Promise<{
    content: string
    structuredData?: unknown
  }> {
    // mammoth 提取 docx 文本 + 简单格式
    // const mammoth = await import('mammoth')
    // const result = await mammoth.extractRawText({ path: request.filePath })
    // return { content: result.value }

    return { content: `[DOCX 解析内容] ${request.filePath}` }
  }

  private async parseExcel(request: ParseRequest): Promise<{
    content: string
    structuredData?: unknown
  }> {
    // xlsx 库读取，转为 Markdown 表格或 JSON
    // const XLSX = await import('xlsx')
    // const workbook = XLSX.readFile(request.filePath)
    // const sheets = workbook.SheetNames.map(name => ({
    //   name,
    //   data: XLSX.utils.sheet_to_json(workbook.Sheets[name])
    // }))

    return {
      content: `[Excel 解析内容] ${request.filePath}`,
      structuredData: { sheets: [] },
    }
  }

  private async parsePPTX(request: ParseRequest): Promise<{ content: string }> {
    // pptx-parser 或 python-pptx
    return { content: `[PPTX 解析内容] ${request.filePath}` }
  }
}

// ============ 文件解析网关 ============

export class FileParseGateway {
  private parsers: IFileParser[] = []

  constructor() {
    this.registerDefaultParsers()
  }

  /** 注册自定义解析器（插件机制） */
  registerParser(parser: IFileParser): void {
    this.parsers.push(parser)
  }

  /** 根据文件类型和解析模式选择合适的解析器 */
  async parse(request: ParseRequest): Promise<ParseResult> {
    // 1. 检测文件类型
    const fileType = request.fileType || this.detectFileType(request.filePath)
    const actualRequest = { ...request, fileType }

    // 2. 选择合适的解析器
    const parser = this.selectParser(fileType, request.parseMode)
    if (!parser) {
      return {
        success: false,
        content: '',
        duration: 0,
        error: `不支持的文件类型: ${fileType}`,
      }
    }

    // 3. 执行解析
    return parser.parse(actualRequest)
  }

  /** 批量解析 */
  async parseBatch(requests: ParseRequest[]): Promise<ParseResult[]> {
    return Promise.all(requests.map((req) => this.parse(req)))
  }

  // ============ 私有方法 ============

  private registerDefaultParsers(): void {
    this.parsers.push(
      new TextParser(),
      new ImageParser(),
      new DocumentParser(),
    )
  }

  private detectFileType(filePath: string): SupportedFileType {
    const ext = filePath.toLowerCase().match(/\.[a-z0-9]+$/)?.[0]
    if (ext && EXTENSION_MAP[ext]) return EXTENSION_MAP[ext]
    return 'txt' // 默认按文本处理
  }

  private selectParser(fileType: SupportedFileType, mode: ParseMode): IFileParser | undefined {
    // 优先匹配 mode 完全一致的解析器
    for (const parser of this.parsers) {
      if (parser.supports(fileType) && parser.mode === mode) {
        return parser
      }
    }

    // 降级：匹配支持该文件类型的任意解析器
    return this.parsers.find((p) => p.supports(fileType))
  }
}
