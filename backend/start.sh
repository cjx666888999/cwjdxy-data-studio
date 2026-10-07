#!/bin/bash

# 多模态数据生成器后端启动脚本

echo "🚀 启动多模态数据生成器后端服务..."

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

# 安装依赖（使用虚拟环境中的绝对路径）
echo "📚 安装依赖..."
venv/bin/pip install -r requirements.txt -q

# 启动服务（使用虚拟环境中的绝对路径）
echo "✅ 启动服务 (http://localhost:8000)"
echo "📖 API文档: http://localhost:8000/docs"
venv/bin/python app.py

