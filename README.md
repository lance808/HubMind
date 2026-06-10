# HubMind

面向国内的全平台 AI 工作站 — 统一管理多厂商模型，支持 Agent 自动化、工作流编排、文件解析和实时对话。

## 功能

- **多厂商模型管理** — 内置 12+ 国内模型预设（DeepSeek、通义千问、智谱GLM、豆包、混元、Kimi、文心一言、Ollama），一键配置
- **智能对话** — 支持多模态输入（文本 + 图片上传），流式输出，对话分叉
- **模型对比** — 同时向多个模型发送相同问题，实时分栏对比结果
- **Agent 自动化** — ReAct 循环执行 Shell、文件操作、联网搜索，带高风险操作审批
- **工作流编排** — 可视化节点编辑器（LLM / 工具 / 条件 / 循环 / 代码）
- **文件解析** — 支持 PDF / Word / Excel / PPT / CSV / Markdown / 图片（OCR+视觉）
- **成本控制** — Token 用量统计、日/月预算上限、断路保护
- **桌面端** — Electron 打包，系统托盘、全局快捷键 `Ctrl+Alt+H`

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 | React 18 + TypeScript + Zustand + Tailwind CSS v4 + lucide-react |
| 桌面 | Electron 33 + electron-vite + better-sqlite3 |
| 核心 | 统一适配器层（OpenAI 兼容 + 文心 OAuth） |
| 包管理 | pnpm monorepo（workspace） |
| 构建 | electron-vite + electron-builder |

## 项目结构

```
HubMind/
├── apps/desktop/                  # Electron 桌面应用
│   ├── src/
│   │   ├── main/                  # 主进程（IPC、数据库、LLM 调用）
│   │   │   ├── index.ts           # 入口：窗口管理、IPC 注册
│   │   │   └── services/
│   │   │       └── storage.ts     # SQLite 数据持久化
│   │   ├── preload/               # 安全桥接层
│   │   │   └── index.ts
│   │   └── renderer/              # 渲染进程
│   │       ├── pages/             # ChatPage / AgentPage / WorkflowPage
│   │       ├── components/        # Sidebar / TitleBar / ModelConfigPanel
│   │       ├── stores/            # Zustand 状态管理
│   │       ├── lib/api.ts         # IPC 调用封装
│   │       └── styles/            # 全局样式 + Tailwind
│   ├── electron-vite.config.ts
│   └── package.json
├── packages/
│   ├── core/                      # 核心逻辑
│   │   └── src/
│   │       ├── adapters/          # 模型适配器（OpenAI 兼容 + 百度文心）
│   │       ├── agent/             # Agent 运行时
│   │       └── file-parser/       # 文件解析网关
│   ├── shared/                    # 共享类型定义
│   └── ui/                        # 共享 UI 组件
└── docs/
    └── architecture.md
```

## 快速开始

```bash
# 安装依赖（首次安装后会自动为 Electron 重建原生模块）
pnpm install

# 开发模式
pnpm dev

# 类型检查
pnpm typecheck

# 打包
pnpm dist
```

> **注意**：`better-sqlite3` 是原生模块，首次安装后会自动运行 `electron-rebuild`。如果遇到数据库初始化失败，运行：
> ```bash
> pnpm --filter @hubmind/desktop rebuild
> ```

## 支持的模型

| 厂商 | 模型 | API 地址 |
|------|------|---------|
| DeepSeek | V4-Flash / V4-Pro | api.deepseek.com |
| 阿里通义 | Qwen3-235B-A22B / Qwen-Max | dashscope.aliyuncs.com |
| 智谱 GLM | GLM-4-Plus | open.bigmodel.cn |
| 字节豆包 | Doubao-1.5-pro-256k | ark.cn-beijing.volces.com |
| 腾讯混元 | Hunyuan-Turbo | api.hunyuan.cloud.tencent.com |
| 月之暗面 | Kimi-K2 | api.moonshot.cn |
| 百度文心 | ERNIE-4.0-Turbo | aip.baidubce.com |
| 聚合平台 | MoMA / 百炼 / 千问云 | 各聚合平台 |
| 本地 Ollama | llama3.2 | localhost:11434 |

## 许可

Apache-2.0
