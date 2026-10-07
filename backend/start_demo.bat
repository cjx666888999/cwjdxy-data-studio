@echo off
REM 多模态数据生成器后端启动脚本 - 演示模式 (Windows)

echo 🎭 启动多模态数据生成器后端服务（演示模式）...
echo.
echo 📝 注意事项:
echo   - 当前运行在演示模式，不需要真实的API密钥
echo   - 使用模拟的图片描述进行演示
echo   - 适合快速测试系统功能
echo.

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

REM 启动服务（演示模式）
echo.
echo ✅ 启动演示模式服务...
echo 🌐 服务地址: http://localhost:8000
echo 📖 API文档: http://localhost:8000/docs
echo.
python demo_mode.py

