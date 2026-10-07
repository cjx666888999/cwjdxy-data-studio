@echo off
REM 多模态数据生成器后端启动脚本 (Windows)

echo 🚀 启动多模态数据生成器后端服务...

REM 检查Python环境
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 错误: 未找到 Python
    exit /b 1
)

REM 创建虚拟环境（如果不存在）
if not exist venv (
    echo 📦 创建虚拟环境...
    python -m venv venv
)

REM 激活虚拟环境
echo 🔧 激活虚拟环境...
call venv\Scripts\activate.bat

REM 安装依赖
echo 📚 安装依赖...
pip install -r requirements.txt -q

REM 启动服务
echo ✅ 启动服务 (http://localhost:8000)
echo 📖 API文档: http://localhost:8000/docs
python app.py

