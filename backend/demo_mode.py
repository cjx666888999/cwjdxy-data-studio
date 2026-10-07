"""
演示模式 - 无需真实API即可测试系统

这个版本使用模拟的图片描述生成，适合：
1. 快速测试系统功能
2. 演示界面和流程
3. 开发调试
"""

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from typing import List, Optional
import os
import json
from pathlib import Path
from datetime import datetime
import uuid
import random

app = FastAPI(title="cwjdxy 多模态数据工坊 API (演示模式)", version="2.0.0-demo")

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 配置路径
BASE_DIR = Path(__file__).parent
UPLOAD_DIR = BASE_DIR / "uploads"
OUTPUT_DIR = BASE_DIR / "outputs"

UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)


# 模拟图片描述模板
DEMO_DESCRIPTIONS = [
    "这张图片展示了一个宁静的自然场景，画面中可以看到蓝天白云和绿色的植被。光线柔和，整体氛围宁静祥和。",
    "图片中呈现了一个现代化的城市景观，高楼大厦林立，玻璃幕墙反射着天空的光芒。画面构图对称，色彩鲜明。",
    "这是一张人物肖像照片，主体人物表情自然，光线打在脸部形成柔和的阴影。背景虚化，突出了主体。",
    "图片展示了精致的美食摆盘，色彩丰富，细节清晰。光线从侧面照射，营造出诱人的视觉效果。",
    "这张照片拍摄了一个温馨的室内场景，家具摆放整洁，装饰简约现代。自然光透过窗户洒进室内。",
]


@app.get("/")
async def root():
    """健康检查"""
    return {
        "status": "ok", 
        "message": "多模态数据生成器API运行中（演示模式）",
        "mode": "demo"
    }


@app.post("/api/upload")
async def upload_images(files: List[UploadFile] = File(...)):
    """上传图片"""
    uploaded_files = []
    
    for file in files:
        if not file.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail=f"文件 {file.filename} 不是图片")
        
        file_ext = os.path.splitext(file.filename)[1]
        new_filename = f"{uuid.uuid4()}{file_ext}"
        file_path = UPLOAD_DIR / new_filename
        
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)
        
        uploaded_files.append({
            "original_name": file.filename,
            "saved_name": new_filename,
            "size": len(content)
        })
    
    return {
        "success": True,
        "files": uploaded_files,
        "count": len(uploaded_files)
    }


@app.post("/api/generate")
async def generate_data(
    api_endpoint: str = Form(...),
    api_key: Optional[str] = Form(None),
    system_prompt: str = Form(...),
    temperature: float = Form(0.7),
    file_names: str = Form(...)
):
    """生成训练数据（演示模式 - 使用模拟描述）"""
    try:
        file_list = json.loads(file_names)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="文件名列表格式错误")
    
    results = {
        "success": 0,
        "failed": 0,
        "details": []
    }
    
    generated_data = []
    
    for filename in file_list:
        file_path = UPLOAD_DIR / filename
        
        if not file_path.exists():
            results["failed"] += 1
            results["details"].append({
                "file": filename,
                "status": "failed",
                "error": "文件不存在"
            })
            continue
        
        try:
            # 模拟API调用延迟
            import asyncio
            await asyncio.sleep(0.5)
            
            # 随机选择一个描述模板
            description = random.choice(DEMO_DESCRIPTIONS)
            
            # 可以根据system_prompt添加一些变化
            if "详细" in system_prompt:
                description += " 画面细节丰富，值得细细品味。"
            if "情感" in system_prompt or "氛围" in system_prompt:
                description += " 整体情感表达真挚，氛围营造出色。"
            
            # 创建训练数据
            training_data = {
                "messages": [
                    {
                        "role": "user",
                        "content": "<image>请描述这张图片"
                    },
                    {
                        "role": "assistant",
                        "content": description
                    }
                ],
                "images": [filename]
            }
            generated_data.append(training_data)
            
            results["success"] += 1
            results["details"].append({
                "file": filename,
                "status": "success",
                "description": description
            })
            
        except Exception as e:
            results["failed"] += 1
            results["details"].append({
                "file": filename,
                "status": "failed",
                "error": str(e)
            })
    
    # 保存生成的数据
    if generated_data:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = OUTPUT_DIR / f"train_demo_{timestamp}.jsonl"
        
        with open(output_file, "w", encoding="utf-8") as f:
            for item in generated_data:
                f.write(json.dumps(item, ensure_ascii=False) + "\n")
        
        results["output_file"] = output_file.name
    
    return results


@app.get("/api/download/{filename}")
async def download_file(filename: str):
    """下载生成的训练数据"""
    file_path = OUTPUT_DIR / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    
    return FileResponse(
        path=file_path,
        filename=filename,
        media_type="application/json"
    )


@app.get("/api/outputs")
async def list_outputs():
    """列出所有生成的输出文件"""
    files = []
    for file_path in OUTPUT_DIR.glob("*.jsonl"):
        stat = file_path.stat()
        files.append({
            "name": file_path.name,
            "size": stat.st_size,
            "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat()
        })
    
    files.sort(key=lambda x: x["created_at"], reverse=True)
    return {"files": files}


@app.delete("/api/uploads/{filename}")
async def delete_upload(filename: str):
    """删除上传的文件"""
    file_path = UPLOAD_DIR / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    
    file_path.unlink()
    return {"success": True, "message": f"文件 {filename} 已删除"}


if __name__ == "__main__":
    import uvicorn
    print("=" * 60)
    print("🎭 演示模式启动中...")
    print("📝 注意: 当前运行在演示模式，不会调用真实的API")
    print("🔧 使用模拟的图片描述进行演示")
    print("=" * 60)
    uvicorn.run(app, host="0.0.0.0", port=8000)

