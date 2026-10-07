"""
cwjdxy 多模态数据工坊 - 后端API

支持功能：
1. 图片上传
2. 调用视觉模型API生成图片描述（DashScope 通义千问 VL / 任意 OpenAI 兼容接口）
3. AI 提示词优化（DeepSeek）
4. 生成 LLaMA-Factory 兼容的 JSONL 训练数据
5. 数据预览 / 下载 / 历史记录

密钥统一从 backend/.env 读取（见 .env.example），前端不传密钥时自动回退到环境变量。
"""

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from typing import List, Optional
import os
import json
import base64
import httpx
from pathlib import Path
from datetime import datetime
import uuid

from dotenv import load_dotenv

BASE_DIR = Path(__file__).parent
load_dotenv(BASE_DIR / ".env")

APP_NAME = "cwjdxy 多模态数据工坊"
APP_VERSION = "2.0.0"

app = FastAPI(title=f"{APP_NAME} API", version=APP_VERSION)

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 配置路径
UPLOAD_DIR = BASE_DIR / "uploads"
OUTPUT_DIR = BASE_DIR / "outputs"
UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

# 上传大小限制（MB）
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "20"))

# ------------------------------------------------------------
# 模型服务商预设：前端据此渲染配置卡片，后端据此回退密钥
# ------------------------------------------------------------
PROVIDERS = {
    "dashscope": {
        "id": "dashscope",
        "label": "通义千问 VL（阿里云百炼）",
        "description": "内置密钥，开箱即用，适合中文图表 / 表单 / 文档标注",
        "format": "dashscope",
        "default_endpoint": os.getenv(
            "DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com"
        )
        + "/api/v1/services/aigc/multimodal-generation/generation",
        "models": ["qwen3-vl-plus", "qwen-vl-max", "qwen2.5-vl-72b-instruct"],
        "default_model": os.getenv("DASHSCOPE_DEFAULT_MODEL", "qwen3-vl-plus"),
        "env_key": "DASHSCOPE_API_KEY",
        "builtin": True,
    },
    "openai_compat": {
        "id": "openai_compat",
        "label": "OpenAI 兼容接口",
        "description": "GPT-4o / Claude 中转 / vLLM / Ollama 等任意兼容端点",
        "format": "openai",
        "default_endpoint": "",
        "models": ["gpt-4o", "gpt-4o-mini", "glm-4v-plus"],
        "default_model": "gpt-4o",
        "env_key": None,
        "builtin": False,
    },
}

DEFAULT_USER_MESSAGE = "请描述这张图片的内容"


def _resolve_key(provider_format: str, api_key: Optional[str]) -> Optional[str]:
    """前端未传密钥时，按服务商回退到 .env 中的密钥"""
    if api_key:
        return api_key.strip()
    if provider_format == "dashscope":
        return os.getenv("DASHSCOPE_API_KEY") or None
    return None


class DataGenerator:
    """数据生成器"""

    async def call_vision_api(
        self,
        image_path: str,
        api_endpoint: str,
        api_key: Optional[str],
        system_prompt: str,
        temperature: float = 0.7,
        model: Optional[str] = None,
        provider_format: str = "auto",
    ) -> str:
        """调用视觉模型API，返回图片描述文本"""
        with open(image_path, "rb") as f:
            image_base64 = base64.b64encode(f.read()).decode()

        if provider_format == "auto":
            provider_format = (
                "dashscope"
                if ("dashscope" in api_endpoint or "qwen" in api_endpoint.lower())
                else "openai"
            )

        if provider_format == "dashscope":
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key or ''}",
            }
            payload = {
                "model": model or os.getenv("DASHSCOPE_DEFAULT_MODEL", "qwen3-vl-plus"),
                "input": {
                    "messages": [
                        {"role": "system", "content": [{"text": system_prompt}]},
                        {
                            "role": "user",
                            "content": [
                                {"image": f"data:image/jpeg;base64,{image_base64}"},
                                {"text": DEFAULT_USER_MESSAGE},
                            ],
                        },
                    ]
                },
                "parameters": {"temperature": temperature},
            }
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(api_endpoint, headers=headers, json=payload)
                response.raise_for_status()
                result = response.json()
                return result["output"]["choices"][0]["message"]["content"][0]["text"]

        # OpenAI 兼容格式（默认）
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        payload = {
            "model": model or "gpt-4o",
            "messages": [
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": DEFAULT_USER_MESSAGE},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"},
                        },
                    ],
                },
            ],
            "temperature": temperature,
            "max_tokens": 800,
        }
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(api_endpoint, headers=headers, json=payload)
            response.raise_for_status()
            result = response.json()
            return result["choices"][0]["message"]["content"]

    async def polish_prompt(self, prompt: str) -> str:
        """调用 DeepSeek 优化标注提示词"""
        api_key = os.getenv("DEEPSEEK_API_KEY")
        if not api_key:
            raise HTTPException(status_code=503, detail="未配置 DEEPSEEK_API_KEY，无法使用提示词优化")
        base_url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
        endpoint = base_url.rstrip("/") + "/chat/completions"
        payload = {
            "model": os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "你是一位多模态大模型微调数据标注专家。用户会给出一份用于图片标注的系统提示词，"
                        "请将其优化为一份更专业、结构化的标注提示词：明确输出语言、描述维度（对象/文字/数据/布局/风格）、"
                        "结构要求与禁止事项。直接输出优化后的提示词正文，不要任何解释或前后缀。"
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.6,
        }
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    endpoint,
                    headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
                    json=payload,
                )
                response.raise_for_status()
                return response.json()["choices"][0]["message"]["content"].strip()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=502, detail=f"DeepSeek 调用失败: {e.response.status_code}")
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"DeepSeek 调用失败: {e}")

    def create_training_data(self, image_filename: str, original_filename: str, description: str) -> dict:
        """生成 LLaMA-Factory sharegpt 格式训练数据"""
        return {
            "messages": [
                {"role": "user", "content": "<image>请描述这张图片"},
                {"role": "assistant", "content": description},
            ],
            "images": [original_filename],
        }


data_generator = DataGenerator()


@app.get("/")
async def root():
    """健康检查"""
    return {
        "status": "ok",
        "app": APP_NAME,
        "version": APP_VERSION,
        "message": f"{APP_NAME} API 运行中",
    }


@app.get("/api/health")
async def health():
    """健康检查（含密钥配置状态，供前端状态栏展示）"""
    return {
        "status": "ok",
        "app": APP_NAME,
        "version": APP_VERSION,
        "providers": {
            "dashscope": bool(os.getenv("DASHSCOPE_API_KEY")),
            "deepseek": bool(os.getenv("DEEPSEEK_API_KEY")),
        },
    }


@app.get("/api/presets")
async def get_presets():
    """返回模型服务商预设（供前端渲染配置卡片）"""
    presets = []
    for p in PROVIDERS.values():
        has_key = bool(os.getenv(p["env_key"])) if p["env_key"] else False
        presets.append({**p, "env_key": None, "has_key": has_key})
    return {"presets": presets}


@app.post("/api/upload")
async def upload_images(files: List[UploadFile] = File(...)):
    """上传图片"""
    uploaded_files = []

    for file in files:
        if not file.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail=f"文件 {file.filename} 不是图片")

        content = await file.read()
        if len(content) > MAX_UPLOAD_MB * 1024 * 1024:
            raise HTTPException(
                status_code=400,
                detail=f"文件 {file.filename} 超过 {MAX_UPLOAD_MB}MB 限制",
            )

        file_ext = os.path.splitext(file.filename or "image.jpg")[1] or ".jpg"
        new_filename = f"{uuid.uuid4()}{file_ext}"
        file_path = UPLOAD_DIR / new_filename

        with open(file_path, "wb") as f:
            f.write(content)

        uploaded_files.append(
            {"original_name": file.filename, "saved_name": new_filename, "size": len(content)}
        )

    return {"success": True, "files": uploaded_files, "count": len(uploaded_files)}


@app.post("/api/generate")
async def generate_data(
    api_endpoint: str = Form(...),
    api_key: Optional[str] = Form(None),
    system_prompt: str = Form(...),
    temperature: float = Form(0.7),
    file_names: str = Form(...),
    file_mapping: str = Form("{}"),
    model: str = Form(""),
    provider_format: str = Form("auto"),
):
    """生成训练数据：逐张调用视觉API并写入 JSONL"""
    try:
        file_list = json.loads(file_names)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="文件名列表格式错误")

    try:
        mapping = json.loads(file_mapping)
    except json.JSONDecodeError:
        mapping = {}

    resolved_key = _resolve_key(provider_format if provider_format != "auto" else "auto", api_key)

    print("\n" + "=" * 60)
    print(f"🚀 {APP_NAME} 开始生成数据")
    print(f"📍 端点: {api_endpoint}")
    print(f"🧩 模型: {model or '（服务商默认）'}  格式: {provider_format}")
    print(f"🔑 密钥: {'前端提供' if api_key else ('环境变量回退' if resolved_key else '未提供')}")
    print(f"📝 提示词: {system_prompt[:50]}...")
    print(f"🌡️  温度: {temperature}")
    print("=" * 60 + "\n")

    results = {"success": 0, "failed": 0, "details": []}
    generated_data = []

    for filename in file_list:
        file_path = UPLOAD_DIR / filename

        if not file_path.exists():
            results["failed"] += 1
            results["details"].append({"file": filename, "status": "failed", "error": "文件不存在"})
            continue

        try:
            description = await data_generator.call_vision_api(
                str(file_path),
                api_endpoint,
                resolved_key,
                system_prompt,
                temperature,
                model=model or None,
                provider_format=provider_format,
            )

            original_name = mapping.get(filename, filename)
            training_data = data_generator.create_training_data(filename, original_name, description)
            generated_data.append(training_data)

            results["success"] += 1
            results["details"].append(
                {"file": original_name, "saved": filename, "status": "success", "description": description}
            )
            print(f"✅ {original_name} 处理成功")

        except Exception as e:
            print(f"❌ 处理 {filename} 失败: {e}")
            results["failed"] += 1
            results["details"].append({"file": filename, "status": "failed", "error": str(e)})

    if generated_data:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = OUTPUT_DIR / f"train_{timestamp}.jsonl"
        with open(output_file, "w", encoding="utf-8") as f:
            for item in generated_data:
                f.write(json.dumps(item, ensure_ascii=False) + "\n")
        results["output_file"] = output_file.name
        print(f"💾 已保存: {output_file.name}（成功 {results['success']} / 失败 {results['failed']}）")

    return results


@app.post("/api/prompt/polish")
async def polish_prompt(payload: dict):
    """AI 提示词优化（DeepSeek）"""
    prompt = (payload.get("prompt") or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="提示词不能为空")
    polished = await data_generator.polish_prompt(prompt)
    return {"success": True, "polished": polished}


@app.get("/api/download/{filename}")
async def download_file(filename: str):
    """下载生成的训练数据"""
    file_path = OUTPUT_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    return FileResponse(path=file_path, filename=filename, media_type="application/json")


@app.get("/api/preview/{filename}")
async def preview_output(filename: str, lines: int = 3):
    """预览输出 JSONL 的前 N 条记录"""
    if "/" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="非法文件名")
    file_path = OUTPUT_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")

    records = []
    with open(file_path, "r", encoding="utf-8") as f:
        for i, line in enumerate(f):
            if i >= max(1, min(lines, 20)):
                break
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                continue

    total = sum(1 for _ in open(file_path, "r", encoding="utf-8"))
    return {"file": filename, "total": total, "records": records}


@app.get("/api/outputs")
async def list_outputs():
    """列出所有生成的输出文件"""
    files = []
    for file_path in OUTPUT_DIR.glob("*.jsonl"):
        stat = file_path.stat()
        files.append(
            {
                "name": file_path.name,
                "size": stat.st_size,
                "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat(),
            }
        )
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

    port = int(os.getenv("BACKEND_PORT", "8000"))
    print("=" * 60)
    print(f"🟣 {APP_NAME} v{APP_VERSION}")
    print(f"🚀 后端服务启动: http://localhost:{port}")
    print(f"📖 API 文档: http://localhost:{port}/docs")
    env_file = BASE_DIR / ".env"
    print(f"🔐 密钥配置: {'已加载 backend/.env' if env_file.exists() else '⚠️ 未找到 .env（参考 .env.example）'}")
    print("=" * 60)
    uvicorn.run(app, host="0.0.0.0", port=port)
