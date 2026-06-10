# HubMind 技术架构文档

> 版本: 0.1.0 | 更新: 2026-06-08 | 协议: Apache 2.0

---

## 1. 项目概述

HubMind 是一个面向国内用户的**全平台 AI 工作站**，融合了：

- **Chatbox 的多模型聚合与通用交互** — 一键接入 DeepSeek、通义、GLM、豆包、混元、Kimi、文心等国内模型
- **Codex 的任务执行与 Agent 能力** — 构建能调用工具、串联工作流的智能体框架

### 技术栈选型

| 层 | 技术 | 选择理由 |
|---|---|---|
| 桌面框架 | Electron 30+ | 全平台(Win/Mac/Linux)，大厂验证的成熟方案 |
| 构建工具 | electron-vite | 基于 Vite，HMR 快，原生支持 TS/JSX |
| 前端框架 | React 18 + TypeScript | 复杂交互生态最好(工作流编辑/代码编辑) |
| UI 组件 | shadcn/ui + TailwindCSS | 组件可完全定制，设计自由度大 |
| 状态管理 | Zustand | 轻量、TypeScript 友好、支持 persist |
| 数据库 | better-sqlite3 | 同步 API、性能好、嵌入式免运维 |
| 包管理 | pnpm workspace | Monorepo 原生支持，磁盘效率高 |

### 项目目录结构

```
HubMind/
├── apps/
│   └── desktop/                        # Electron 桌面应用
│       └── src/
│           ├── main/                   # 主进程
│           │   ├── index.ts            #   入口、窗口管理、生命周期
│           │   ├── ipc/                #   IPC 处理器
│           │   ├── services/           #   原生服务(storage/shell/network)
│           │   ├── adapters/           #   主进程端适配器
│           │   └── utils/              #   工具函数
│           ├── preload/                # Preload 安全桥接
│           │   └── index.ts
│           └── renderer/               # 渲染进程(React)
│               ├── components/         # UI 组件
│               │   ├── chat/           #   聊天界面
│               │   ├── model-manager/  #   模型管理面板
│               │   ├── file-parser/    #   文件解析预览
│               │   ├── agent/          #   Agent 配置面板
│               │   ├── workflow/       #   工作流编辑器
│               │   ├── settings/       #   设置页面
│               │   └── common/         #   通用组件
│               ├── hooks/              # 自定义 Hooks
│               ├── stores/             # Zustand 状态
│               ├── lib/                # 工具函数
│               ├── pages/              # 页面组件
│               └── styles/             # 全局样式
├── packages/
│   ├── core/                           # 核心业务逻辑
│   │   └── src/
│   │       ├── adapters/               #   模型适配器层
│   │       │   ├── base-adapter.ts     #     适配器基类 + OpenAI 兼容
│   │       │   └── model-manager.ts    #     模型管理器
│   │       ├── agent/                  #   Agent 框架
│   │       │   └── runtime.ts          #     Agent 运行时 + 工作流引擎
│   │       ├── file-parser/            #   文件解析
│   │       │   └── gateway.ts          #     解析网关
│   │       ├── storage/                #   数据存储
│   │       │   └── storage.ts          #     SQLite 实现
│   │       ├── plugins/                #   插件系统
│   │       │   └── loader.ts           #     插件加载器
│   │       └── utils/                  #   通用工具
│   ├── shared/                         # 共享类型与常量
│   │   └── src/
│   │       └── types.ts                #   全局类型定义
│   └── ui/                             # 共享 UI 组件库
│       └── src/
│           ├── components/             #   可复用组件
│           ├── hooks/
│           └── lib/
└── plugins/                            # 第三方插件目录
```

---

## 2. 核心架构设计

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                       Electron 主进程                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────────┐  │
│  │ 窗口管理  │ │ IPC Hub  │ │ 原生服务  │ │   StorageService  │  │
│  │          │ │          │ │ (fs/shell)│ │  (better-sqlite3) │  │
│  └──────────┘ └────┬─────┘ └──────────┘ └───────────────────┘  │
│                    │ IPC (invoke/handle + on/send)               │
├────────────────────┼────────────────────────────────────────────┤
│                    │          Preload (contextBridge)            │
│                    │         最小权限，安全桥接                    │
├────────────────────┼────────────────────────────────────────────┤
│                    │                                            │
│                渲染进程 (React App)                               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Zustand Stores                         │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────────────┐  │   │
│  │  │ChatStore│ │ModelStr │ │AgentStr │ │SettingsStore  │  │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └───────────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    UI Components                          │   │
│  │  ┌──────┐ ┌──────┐ ┌──────────┐ ┌────────┐ ┌─────────┐ │   │
│  │  │ Chat │ │Model │ │FileParser│ │ Agent  │ │Workflow │ │   │
│  │  │Panel │ │Panel │ │ Preview  │ │Panel   │ │Editor   │ │   │
│  │  └──────┘ └──────┘ └──────────┘ └────────┘ └─────────┘ │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
         ▲                    ▲                    ▲
         │                    │                    │
    ┌────┴────┐         ┌────┴────┐         ┌────┴────┐
    │ packages│         │ packages│         │ packages│
    │  /core  │         │ /shared │         │   /ui   │
    └─────────┘         └─────────┘         └─────────┘
```

### 2.2 数据流

```
用户输入 → ChatStore.addMessage() 
  → AgentRuntime.run() 
    → AdapterFactory.getAdapter() → OpenAICompatibleAdapter.chatStream()
      → fetch(厂商API) → SSE 流式解析
        → StreamChunk → ChatStore.appendStreamChunk()
          → React 重渲染 → 打字机效果
          
工具调用路径:
  LLM 返回 tool_calls 
    → AgentRuntime.executeTool()
      → 风险检查(evaluateRisk) 
        → 用户审批(如需要) 
          → Tool.execute() 
            → IPC → shell:execute / fs:read 等
```

---

## 3. 模型适配器层

### 3.1 设计决策

**为什么不用 LangChain？** LangChain 抽象层太厚，运行时代价大，且对国内模型的适配滞后。本项目直接实现轻量适配器。

### 3.2 适配器架构

```
                    ┌──────────────────────┐
                    │   AdapterFactory      │
                    │   (单例工厂)           │
                    └──────────┬───────────┘
                               │ getAdapter(provider)
                    ┌──────────┴───────────┐
                    │                      │
            ┌───────┴───────┐     ┌───────┴───────┐
            │ OpenAICompat  │     │ ErnieAdapter  │
            │ - DeepSeek    │     │ (百度文心)     │
            │ - 通义(Qwen)  │     └───────────────┘
            │ - 智谱(GLM)   │
            │ - 豆包(Doubao)│
            │ - 混元(Hunyuan)│
            │ - Kimi(Moonshot)│
            │ - Custom      │
            └───────────────┘
```

### 3.3 关键接口

```typescript
interface IModelAdapter {
  readonly provider: ModelProvider
  chat(config: ModelConfig, params: ModelParams, request: LLMRequest): Promise<AdapterResponse>
  chatStream(config: ModelConfig, params: ModelParams, request: LLMRequest): AsyncGenerator<StreamChunk>
  validateConnection(config: ModelConfig): Promise<boolean>
  listModels(config: ModelConfig): Promise<ModelInfo[]>
  convertMessages(messages: LLMRequest['messages']): unknown[]
  estimateTokens(text: string): number
}
```

### 3.4 内置模型预设

| 厂商 | 模型 | 上下文 | 视觉 | 价格(入/出 元/百万tokens) |
|------|------|--------|------|---------------------------|
| DeepSeek | V3 | 64K | ❌ | 2/8 |
| DeepSeek | R1 | 64K | ❌ | 4/16 |
| 阿里通义 | Qwen3-235B | 128K | ✅ | 4/12 |
| 智谱 | GLM-4-Plus | 128K | ✅ | 50/50 |
| 字节豆包 | Doubao-1.5-pro | 256K | ❌ | 5/9 |
| 腾讯混元 | Turbo | 32K | ❌ | 15/50 |
| 月之暗面 | Kimi-K2 | 128K | ❌ | 8/8 |
| 百度文心 | ERNIE-4.0-Turbo | 32K | ❌ | 30/90 |

### 3.5 成本控制与保护

- **断路保护**: 同一模型连续失败 5 次 → 自动禁用
- **预算控制**: 日预算/月预算 + 80% 预警
- **指数退避重试**: 1s → 2s → 4s

---

## 4. Agent 智能体框架

### 4.1 ReAct 循环

```
┌────────────────────────────────────────────┐
│              AgentRuntime.run()             │
│                                            │
│  用户消息 → LLM 推理 ─────────────────┐     │
│       ▲                              ▼     │
│       │                    有 tool_call?   │
│       │                     ├─ 是 → 执行工具│
│       │                     │       │      │
│       │                     │  工具结果反馈  │
│       │                     │       │      │
│       │                     │  LLM 继续推理 │
│       │                     │       │      │
│       └─────────────────────┘       │      │
│                     ├─ 否 → 纯文本回复      │
│                     │                      │
│              达到 maxSteps → 强制终止       │
└────────────────────────────────────────────┘
```

### 4.2 内置工具

| 工具 | 功能 | 风险等级 |
|------|------|----------|
| `shell_execute` | 执行终端命令 | 高 |
| `web_search` | 联网搜索 | 低 |
| `file_operations` | 文件读写/列表/删除 | 中 |

### 4.3 安全策略

1. **风险分级**: 每个工具调用自动评估风险等级(low/medium/high)
2. **审批门禁**: `autoApprove=false` 时，高风险操作弹窗确认
3. **沙箱模式**: 可选的隔离执行环境
4. **审计日志**: 所有工具调用记录，包括参数和结果

### 4.4 工作流引擎

- **拓扑排序**: Kahn 算法确保依赖顺序
- **层级并行**: 同一层级的节点可并行执行，提高吞吐量
- **节点类型**: LLM | Tool | Condition | Loop | Input | Output | Code

---

## 5. 文件解析网关

### 5.1 解析策略路由

```
文件上传
  │
  ├─ 图片(JPG/PNG/GIF/WebP)
  │   ├─ 视觉模型: 直接 base64 发送（首选）
  │   └─ OCR 降级: tesseract.js / PaddleOCR（纯文本模型用）
  │
  ├─ 文档(PDF/DOCX/XLSX/PPTX)
  │   ├─ PDF: pdf-parse → 文本 + 表格
  │   ├─ DOCX: mammoth → Markdown
  │   ├─ Excel: xlsx → JSON/Markdown 表格
  │   └─ PPTX: pptx-parser → 文本
  │
  └─ 文本/代码(TXT/MD/PY/JS/TS/...): 直接读取
```

### 5.2 扩展路径

- **MVP 阶段**: Node.js 生态(pdf-parse, mammoth, xlsx)
- **第二阶段**: Rust LiteParse 通过 napi-rs 桥接
- **企业版**: MinerU / DeepSeek-OCR-2 作为远程微服务

---

## 6. 数据存储层

### 6.1 表结构

| 表名 | 用途 | 加密字段 |
|------|------|----------|
| conversations | 对话记录 | - |
| messages | 消息（含多模态内容 JSON） | - |
| model_configs | 模型配置 | api_key_encrypted (AES-256-GCM) |
| agents | Agent 配置 | - |
| workflows | 工作流定义（nodes/edges JSON） | - |
| plugins | 插件清单 | - |
| settings | 键值对设置 | - |
| usage_logs | Token 用量（按模型+日期索引） | - |

### 6.2 安全设计

- API 密钥用 **AES-256-GCM** 加密，密钥从用户主密码通过 **PBKDF2** 派生
- 数据库文件存储在 Electron `userData` 目录
- 渲染进程无直接文件系统访问，所有 DB 操作通过 IPC 代理到主进程

---

## 7. 插件系统

### 7.1 可扩展点

| 扩展点 | 说明 |
|--------|------|
| 模型适配器 | 接入新厂商 API |
| 文件解析器 | 支持新文件格式 |
| Agent 工具 | 添加新工具能力 |
| UI 组件 | 在 sidebar/toolbar/chat 注入组件 |

### 7.2 权限模型

| 权限 | 风险 | 需要用户确认 |
|------|------|-------------|
| `fs:read` | 低 | 否 |
| `fs:write` | 高 | 是 |
| `network:fetch` | 中 | 否 |
| `shell:execute` | 高 | 是 |
| `clipboard:read` | 中 | 是 |
| `clipboard:write` | 低 | 否 |

### 7.3 声明文件格式 (manifest.json)

```json
{
  "id": "plugin-example",
  "name": "示例插件",
  "version": "1.0.0",
  "description": "接入自定义模型厂商",
  "author": "dev",
  "main": "index.js",
  "permissions": ["network:fetch"],
  "minAppVersion": "0.1.0"
}
```

---

## 8. 前端组件树

### 8.1 页面结构

```
AppLayout
├── TitleBar (自定义标题栏)
│   ├── AppLogo
│   ├── NavigationTabs [Chat | Agent | Workflow]
│   ├── WindowControls [min | max | close]
│   └── GlobalActions [settings, notifications]
│
├── Sidebar (左侧边栏)
│   ├── ModelSelector (当前模型下拉)
│   ├── ConversationList (对话列表)
│   │   ├── SearchBar
│   │   ├── ConversationItem[] (可置顶、归档)
│   │   └── NewChatButton
│   └── SidebarFooter (插件注入点)
│
└── MainContent (主内容区)
    ├── ChatPage
    │   ├── MessageList
    │   │   └── MessageItem[]
    │   │       ├── UserMessage (头像、文件附件预览)
    │   │       ├── AssistantMessage (Markdown 渲染、代码块)
    │   │       └── ToolCallCard (工具调用展开卡片)
    │   ├── InputArea
    │   │   ├── FileUploadButton
    │   │   ├── PromptEditor (textarea / 富文本)
    │   │   ├── ModelCompareToggle
    │   │   └── SendButton
    │   └── ChatToolbar (清空、导出、模型切换)
    │
    ├── AgentPage
    │   ├── AgentList
    │   ├── AgentConfigPanel (系统提示词、工具选择、安全设置)
    │   └── AgentConsole (运行日志、步骤跟踪)
    │
    ├── WorkflowPage
    │   ├── WorkflowCanvas (React Flow)
    │   │   ├── WorkflowNode (LLM/Tool/Condition/...)
    │   │   └── WorkflowEdge
    │   └── NodeConfigPanel (节点属性编辑)
    │
    └── SettingsPage
        ├── GeneralSettings (语言、主题、字体)
        ├── ModelSettings (模型配置 CRUD)
        ├── AgentSettings (Agent 配置)
        ├── PrivacySettings (加密、本地模型)
        └── CostSettings (预算、用量统计)
```

---

## 9. IPC 通信协议

### 9.1 通道清单

| 通道 | 方向 | 类型 | 功能 |
|------|------|------|------|
| `fs:readFile` | 渲染→主 | invoke | 读取文件 |
| `fs:writeFile` | 渲染→主 | invoke | 写入文件 |
| `fs:selectFile` | 渲染→主 | invoke | 打开文件选择器 |
| `fs:selectDirectory` | 渲染→主 | invoke | 选择目录 |
| `shell:execute` | 渲染→主 | invoke | 执行 Shell 命令 |
| `clipboard:write` | 渲染→主 | invoke | 写入剪贴板 |
| `clipboard:read` | 渲染→主 | invoke | 读取剪贴板 |
| `db:query` | 渲染→主 | invoke | 数据库查询 |
| `theme:getNative` | 渲染→主 | invoke | 获取系统主题 |
| `window:minimize/maximize/close` | 渲染→主 | send | 窗口控制 |
| `shell:openExternal` | 渲染→主 | send | 打开外部链接 |

---

## 10. 研发路线图

### 第一阶段: MVP (当前)
- [x] 项目架构设计与文档
- [ ] 初始化 pnpm monorepo + electron-vite 脚手架
- [ ] 基础聊天 UI（React + shadcn/ui）
- [ ] DeepSeek API 接入与流式对话
- [ ] 对话本地持久化（SQLite）
- [ ] 基础图片和文本文件上传

### 第二阶段: 核心功能
- [ ] 全部国产模型内置接入
- [ ] 复杂文档解析（PDF/DOCX/XLSX/PPTX）
- [ ] Agent 框架完整实现（ReAct 循环 + 内置工具）
- [ ] 工作流可视化编辑器（React Flow）
- [ ] 提示词市场 / 技能包
- [ ] 模型对比模式

### 第三阶段: 开放生态
- [ ] 插件系统完整实现（沙箱加载）
- [ ] 一键本地私有化部署
- [ ] 团队协作版（共享 Prompt、知识库）
- [ ] 移动端适配（iOS/Android，React Native 或 PWA）
- [ ] 企业版功能（SLA 保障、高级审计）

---

## 11. 技术风险与缓解

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| API 不稳定 | 高 | 断路保护 + 多模型降级 + 使用量预测 |
| better-sqlite3 原生编译 | 中 | 预编译二进制 + electron-rebuild CI |
| 大文件解析卡主线程 | 中 | Worker Thread 解析 + 流式处理 |
| SSE 流式中断 | 低 | 自动重连 + 本地缓存 Last Message |
| 包体积膨胀 | 低 | Tree-shaking + 动态 import + 按需加载 |

---

## 12. 附录

### 12.1 竞品对比矩阵

| 维度 | HubMind | Chatbox | Cherry Studio | Codex |
|------|-------------|---------|---------------|-------|
| 国产模型数量 | **8+ 内置** | 4 | 6+ | 0 |
| Agent 框架 | **内置 ReAct** | ❌ | 基础 | ✅ 强 |
| 工作流编排 | **可视化编辑器** | ❌ | ❌ | ❌ |
| 文件解析 | **多模态+OCR** | 基础 | 基础 | ❌ |
| 插件系统 | **开放 SDK** | ❌ | ❌ | ✅ |
| 私有化部署 | **后续支持** | 仅桌面 | ❌ | ✅ |
| 开源协议 | Apache 2.0 | MIT | AGPL | 专有 |

### 12.2 关键 NPM 依赖

| 包 | 用途 |
|---|------|
| electron, electron-vite | 桌面框架 + 构建 |
| react, react-dom | 前端框架 |
| zustand | 状态管理 |
| tailwindcss, @radix-ui/*, shadcn/ui | UI 组件 |
| better-sqlite3 | 本地数据库 |
| react-markdown, rehype-highlight | Markdown 渲染 |
| reactflow | 工作流编辑器 |
| pdf-parse, mammoth, xlsx | 文档解析 |
| lucide-react | 图标库 |
