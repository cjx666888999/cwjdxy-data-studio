#!/bin/bash

# 多模态数据生成器后端启动脚本 - 演示模式

echo "🎭 启动多模态数据生成器后端服务（演示模式）..."
echo ""
echo "📝 注意事项:"
echo "  - 当前运行在演示模式，不需要真实的API密钥"
echo "  - 使用模拟的图片描述进行演示"
echo "  - 适合快速测试系统功能"
echo ""

# 检查Python环境
if ! command -v python3 &> /dev/null; then
    echo "❌ 错误: 未找到 Python 3"
    exit 1
fi

# 创建虚拟环境（如果不存在）
if [ ! -d "venv" ]; then
    echo "📦 创建虚拟环境..."
    python3 -m venv venv
fi

# 激活虚拟环境
echo "🔧 激活虚拟环境..."
source venv/bin/activate

# 安装依赖
echo "📚 安装依赖..."
pip install -r requirements.txt -q

# 启动服务（演示模式）
echo ""
echo "✅ 启动演示模式服务..."
echo "🌐 服务地址: http://localhost:8000"
echo "📖 API文档: http://localhost:8000/docs"
echo ""
python demo_mode.py

