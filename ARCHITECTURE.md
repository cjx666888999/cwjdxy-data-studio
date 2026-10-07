# 🏗️ 系统架构文档 — cwjdxy 多模态数据工坊 v2.0

## 📊 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    用户浏览器                              │
│                 (http://localhost:3000)                 │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │       React 18 + TypeScript + Tailwind v4        │  │
│  │              cwjdxy 工作台前端                     │  │
│  │                                                  │  │
│  │  - 顶栏：品牌 / 服务健康状态 / 数据历史            │  │
│  │  - 步骤区：素材上传 → 模型与提示词 → 输出格式       │  │
│  │  - 右侧栏：运行控制台（进度环/统计/逐张状态）        │  │
│  │  - 弹层：JSONL 预览 / 历史侧栏 / Toast 通知        │  │
│  └──────────────────┬───────────────────────────────┘  │
└─────────────────────┼──────────────────────────────────┘
                      │ HTTP REST API
        ┌─────────────▼─────────────┐
        │   FastAPI 后端 (8000)      │
        │                           │
        │  /api/health   健康检查     │
        │  /api/presets  服务商预设   │
        │  /api/upload   图片上传     │
        │  /api/generate 批量标注     │
        │  /api/prompt/polish 提示词优化
        │  /api/preview  数据预览     │
        │  /api/download 文件下载     │
        │  /api/outputs  输出历史     │
        └───────────┬──────────────┘
                    │ dotenv 读取 backend/.env
        ┌───────────▼──────────────┐
        │   外部模型服务             │
        │  - 通义千问 VL (DashScope) │ ← 视觉标注主通道
        │  - DeepSeek               │ ← 提示词优化
        │  - 任意 OpenAI 兼容端点     │
        └──────────────────────────┘
```

## 🔧 技术栈

### 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.3.1 | UI 框架 |
| TypeScript | 5.x | 类型安全 |
| Vite | 6.3.5 | 构建工具 |
| Tailwind CSS | 4.3.3 | 原子化样式（@tailwindcss/vite 插件） |
| tw-animate-css | 4.x | shadcn 动画工具类 |
| Radix UI / shadcn | — | 基础组件库 |
| Sonner | 2.0.3 | Toast 通知 |
| Lucide React | 0.487.0 | 图标库 |

### 后端

| 技术 | 版本 | 用途 |
|------|------|------|
| Python | 3.8+ | 运行环境 |
| FastAPI | 0.109.0 | Web 框架 |
| Uvicorn | 0.27.0 | ASGI 服务器 |
| httpx | 0.26.0 | 异步 HTTP 客户端 |
| python-dotenv | 1.0.0 | .env 密钥加载 |
| python-multipart | 0.0.6 | 文件上传 |

## 🔄 核心数据流

### 生成流程

```
选择文件（前端缩略图预览/去重）
    ↓
POST /api/upload ──→ uploads/（UUID 重命名，≤20MB 校验）
    ↓
POST /api/generate
    ├─ provider_format 判定（dashscope / openai）
    ├─ 密钥回退：前端未传 → .env 读取
    ├─ 逐张调用视觉 API（base64 内嵌）
    ├─ 归一化文件名映射（saved → original）
    └─ 写入 outputs/train_<时间戳>.jsonl
    ↓
前端：进度环 100% · 逐张状态 · toast 通知 · 自动下载
    ↓
历史：GET /api/outputs · GET /api/preview/{file}
```

### 密钥安全模型

- 密钥仅存于 `backend/.env`（已被 .gitignore 排除）
- 前端 API Key 输入框**留空即用内置密钥**，填写则覆盖
- `/api/health` 只返回布尔状态，不泄露密钥内容

## 🎨 设计系统（src/index.css）

| Token | 值 | 用途 |
|-------|-----|------|
| `--background` | `#0a0c12` | 深空墨黑基底 |
| `--primary` | `#7c5cff` | 极光紫（主操作） |
| `--cyan` | `#22d3ee` | 极光青（渐变辅色） |
| `--success` | `#34d399` | 成功状态 |
| `--destructive` | `#f43f5e` | 失败/危险 |

- 背景氛围：极光渐变球（缓慢漂移）+ 网格线遮罩
- 关键类：`.panel` 工作面板 · `.grad-btn` 渐变主按钮 · `.dropzone` 上传区 · `.chip` 模板标签 · `.provider-card` 服务商卡片 · `.mono-block` 数据块
- 入场动画全部由 CSS keyframes 驱动（`.reveal` / `.pop-in` / `.fade-in`），不依赖 JS 动画库，规避 rAF 节流导致的"卡在透明"问题

## 🔐 安全设计

1. **文件校验** — 仅接受 `image/*`，单张 ≤ `MAX_UPLOAD_MB`（默认 20MB）
2. **路径安全** — UUID 文件名；preview/download 接口拒绝路径穿越
3. **CORS** — 仅放行 localhost:3000 / 5173
4. **密钥保护** — .env 不入库；健康检查仅暴露配置与否

## 🚀 部署建议

- 开发：Vite dev server（3000）+ Uvicorn reload（8000）
- 生产：`npm run build` 产物（build/）交 Nginx/CDN；后端 Gunicorn + Uvicorn；HTTPS
- 建议在前端同域反代 `/api` 到后端，消除 CORS 与硬编码地址

---

**cwjdxy 多模态数据工坊 v2.0.0** · 最后更新 2026-10-07
