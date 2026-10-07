# cwjdxy 多模态数据工坊 — 后端API服务

基于 FastAPI 构建的后端服务：视觉标注、提示词优化、JSONL 生成与管理。

## 📦 安装

```bash
# 创建虚拟环境
python3 -m venv venv

# 激活虚拟环境
# Linux/Mac:
source venv/bin/activate
# Windows:
venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt
```

## 🚀 运行

### 方式1: 使用启动脚本（推荐）

```bash
# Linux/Mac
bash start.sh

# Windows
start.bat
```

### 方式2: 直接运行

#### 生产模式（调用真实模型 API）
```bash
python app.py
```

#### 演示模式（无需任何密钥）
```bash
python demo_mode.py
```

## 📋 模式说明

### 生产模式 (`app.py`)

- 调用通义千问 VL（DashScope）或任意 OpenAI 兼容视觉端点
- 密钥自动从 `backend/.env` 读取；请求未携带密钥时自动回退
- 提供 AI 提示词优化（DeepSeek）、数据预览等增强接口

### 演示模式 (`demo_mode.py`)

- 使用模拟的图片描述
- 无需真实API密钥
- 适合快速测试和演示

## 🔌 API 端点

| 端点 | 方法 | 功能 |
|------|------|------|
| `/` 或 `/api/health` | GET | 健康检查（含密钥配置状态） |
| `/api/presets` | GET | 服务商预设（端点/模型/密钥状态） |
| `/api/upload` | POST | 上传图片（≤20MB/张，UUID 重命名） |
| `/api/generate` | POST | 批量标注，生成 JSONL（支持 model / provider_format 参数） |
| `/api/prompt/polish` | POST | DeepSeek 提示词优化 |
| `/api/preview/{filename}` | GET | 预览输出前 N 条记录（`?lines=5`） |
| `/api/download/{filename}` | GET | 下载输出文件 |
| `/api/outputs` | GET | 列出全部输出历史 |
| `/api/uploads/{filename}` | DELETE | 删除上传文件 |

## 🔧 配置

创建 `.env`（参考 `.env.example`）：

```env
DASHSCOPE_API_KEY=sk-...       # 通义千问 VL（视觉标注主通道）
DEEPSEEK_API_KEY=sk-...        # AI 提示词优化
TAVILY_API_KEY=tvly-...        # 预留
AMAP_MAPS_API_KEY=...          # 预留
BACKEND_PORT=8000
MAX_UPLOAD_MB=20
```

## 🐛 故障排除

### 端口已被占用

```bash
lsof -i:8000  # Mac/Linux
netstat -ano | findstr 8000  # Windows
```

### API调用失败

1. 检查 `.env` 密钥是否有效
2. 确认账户余额充足
3. 查看后端终端输出的错误信息

### 图片上传失败

1. 检查文件大小（默认 20MB，`MAX_UPLOAD_MB` 可调）
2. 确认文件格式是图片
3. 检查 uploads 目录权限

## 🔒 安全建议

1. **不要提交 `.env` 到版本控制**（已在 .gitignore 排除）
2. **生产环境启用 HTTPS**
3. **添加请求频率限制**
4. **定期清理 uploads/ 与 outputs/**

## 📄 许可证

MIT License
