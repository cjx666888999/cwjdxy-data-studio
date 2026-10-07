import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload, Settings2, Braces, History, Loader2, CheckCircle2, XCircle, Clock,
  Sparkles, Trash2, Download, Eye, KeyRound, Wand2,
  Activity, X, Database, Cpu, Zap,
} from 'lucide-react';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { Textarea } from './components/ui/textarea';
import { Slider } from './components/ui/slider';
import { Label } from './components/ui/label';
import { Badge } from './components/ui/badge';
import { Separator } from './components/ui/separator';
import { ScrollArea } from './components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from './components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './components/ui/dialog';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';

const API_BASE = 'http://localhost:8000';
const APP_VERSION = 'v2.0.0';

/* ------------------------------------------------------------
   类型与常量
------------------------------------------------------------ */
interface FileItem {
  file: File;
  url: string;
}

interface Preset {
  id: string;
  label: string;
  description: string;
  format: string;
  default_endpoint: string;
  models: string[];
  default_model: string;
  builtin: boolean;
  has_key: boolean;
}

interface ResultRow {
  name: string;
  status: 'success' | 'failed';
  error?: string;
  description?: string;
}

interface OutputFile {
  name: string;
  size: number;
  created_at: string;
}

interface PreviewData {
  file: string;
  total: number;
  records: unknown[];
}

const DEFAULT_PRESETS: Preset[] = [
  {
    id: 'dashscope',
    label: '通义千问 VL',
    description: '阿里云百炼 · 内置密钥，开箱即用',
    format: 'dashscope',
    default_endpoint: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
    models: ['qwen3-vl-plus', 'qwen-vl-max', 'qwen2.5-vl-72b-instruct'],
    default_model: 'qwen3-vl-plus',
    builtin: true,
    has_key: false,
  },
  {
    id: 'openai_compat',
    label: 'OpenAI 兼容接口',
    description: 'GPT-4o / 中转站 / vLLM / Ollama',
    format: 'openai',
    default_endpoint: '',
    models: ['gpt-4o', 'gpt-4o-mini', 'glm-4v-plus'],
    default_model: 'gpt-4o',
    builtin: false,
    has_key: false,
  },
];

const PROMPT_TEMPLATES = [
  {
    id: 'general',
    label: '通用场景描述',
    text: '你是一个专业的图像分析助手。请详细描述图片中的内容，包括主要对象、场景、颜色、情感氛围等细节。使用中文回答。',
  },
  {
    id: 'chart',
    label: '图表数据解读',
    text: '你是专业的图表分析助手。请识别图表类型、标题、坐标轴与数据系列，逐项说明关键数值和趋势结论，并指出数据间的对比关系。使用中文回答。',
  },
  {
    id: 'kv',
    label: '表单键值抽取',
    text: '你是文档信息抽取助手。请从图片中抽取所有可见的键值对字段（如日期、编号、金额、指标等），以 JSON 对象格式输出，仅返回 JSON，不要输出其他内容。',
  },
];

const SAMPLE_JSONL = `{
  "messages": [
    { "role": "user", "content": "<image>请描述这张图片" },
    { "role": "assistant", "content": "该图表展示了……" }
  ],
  "images": ["chart_001.jpg"]
}`;

/* ------------------------------------------------------------
   工具函数
------------------------------------------------------------ */
const fmtSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const fmtElapsed = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

/* ------------------------------------------------------------
   小组件
------------------------------------------------------------ */
function StepHeader({ no, title, icon: Icon, desc }: { no: string; title: string; icon: React.ElementType; desc: string }) {
  return (
    <div className="flex items-center gap-3 mb-5 flex-wrap">
      <span className="step-chip">{no}</span>
      <Icon className="w-4 h-4 text-violet-400" />
      <h2 className="text-[15px] font-semibold text-foreground tracking-wide">{title}</h2>
      <span className="text-xs text-muted-foreground basis-full sm:basis-auto">{desc}</span>
    </div>
  );
}

function ProgressRing({ value, active }: { value: number; active: boolean }) {
  const R = 26;
  const C = 2 * Math.PI * R;
  return (
    <div className={`relative w-16 h-16 shrink-0 ${active ? 'pulse-glow rounded-full' : ''}`}>
      <svg viewBox="0 0 64 64" className="w-16 h-16 -rotate-90">
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7c5cff" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r={R} fill="none" stroke="rgba(148,163,204,0.15)" strokeWidth="5" />
        <circle
          cx="32" cy="32" r={R} fill="none"
          stroke="url(#ringGrad)" strokeWidth="5" strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C - (C * value) / 100}
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-sm text-foreground">
        {Math.floor(value)}
      </span>
    </div>
  );
}

function StatusIcon({ status }: { status: ResultRow['status'] | 'pending' | 'running' }) {
  if (status === 'success') return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
  if (status === 'failed') return <XCircle className="w-3.5 h-3.5 text-rose-400" />;
  if (status === 'running') return <Loader2 className="w-3.5 h-3.5 text-violet-400 animate-spin" />;
  return <Clock className="w-3.5 h-3.5 text-muted-foreground/60" />;
}

/* ------------------------------------------------------------
   主应用
------------------------------------------------------------ */
export default function App() {
  /* 素材 */
  const [fileItems, setFileItems] = useState<FileItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* 配置 */
  const [presets, setPresets] = useState<Preset[]>(DEFAULT_PRESETS);
  const [providerId, setProviderId] = useState('dashscope');
  const [endpoint, setEndpoint] = useState(DEFAULT_PRESETS[0].default_endpoint);
  const [model, setModel] = useState(DEFAULT_PRESETS[0].default_model);
  const [apiKey, setApiKey] = useState('');
  const [prompt, setPrompt] = useState(PROMPT_TEMPLATES[0].text);
  const [activeTemplate, setActiveTemplate] = useState('general');
  const [temperature, setTemperature] = useState([0.7]);
  const [polishing, setPolishing] = useState(false);

  /* 运行 */
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'annotating' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [outputFile, setOutputFile] = useState<string | null>(null);

  /* 服务状态 & 历史 */
  const [health, setHealth] = useState<{ status: string; providers?: Record<string, boolean> } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [outputs, setOutputs] = useState<OutputFile[]>([]);
  const [previewFile, setPreviewFile] = useState<PreviewData | null>(null);

  const provider = useMemo(() => presets.find((p) => p.id === providerId) ?? presets[0], [presets, providerId]);
  const totalBytes = useMemo(() => fileItems.reduce((s, f) => s + f.file.size, 0), [fileItems]);
  const busy = phase === 'uploading' || phase === 'annotating';

  /* ---- 服务健康检查 + 预设拉取 ---- */
  useEffect(() => {
    let alive = true;
    const ping = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/health`);
        const d = await r.json();
        if (alive) setHealth(d);
      } catch {
        if (alive) setHealth(null);
      }
    };
    const loadPresets = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/presets`);
        const d = await r.json();
        if (alive && d.presets?.length) setPresets(d.presets);
      } catch {
        /* 离线时使用默认预设 */
      }
    };
    ping();
    loadPresets();
    const t = setInterval(ping, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  /* ---- 计时器与伪进度 ---- */
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  useEffect(() => {
    if (phase !== 'annotating') return;
    const t = setInterval(() => {
      setProgress((p) => (p < 90 ? Math.min(90, p + (90 - p) * 0.06 + 0.3) : p));
    }, 500);
    return () => clearInterval(t);
  }, [phase]);

  /* ---- 文件管理 ---- */
  const addFiles = useCallback((incoming: File[]) => {
    const imgs = incoming.filter((f) => f.type.startsWith('image/'));
    if (imgs.length < incoming.length) toast.warning('已自动跳过非图片文件');
    if (!imgs.length) return;
    setFileItems((prev) => {
      const seen = new Set(prev.map((p) => `${p.file.name}_${p.file.size}`));
      const fresh = imgs
        .filter((f) => !seen.has(`${f.name}_${f.size}`))
        .map((f) => ({ file: f, url: URL.createObjectURL(f) }));
      const skipped = imgs.length - fresh.length;
      if (skipped > 0) toast.info(`${skipped} 个重复文件已跳过`);
      return [...prev, ...fresh];
    });
  }, []);

  const removeFile = (idx: number) => {
    setFileItems((prev) => {
      URL.revokeObjectURL(prev[idx].url);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const clearFiles = () => {
    fileItems.forEach((f) => URL.revokeObjectURL(f.url));
    setFileItems([]);
  };

  useEffect(() => () => fileItems.forEach((f) => URL.revokeObjectURL(f.url)), []); // eslint-disable-line

  /* ---- 选择服务商 ---- */
  const selectProvider = (id: string) => {
    setProviderId(id);
    const p = presets.find((x) => x.id === id);
    if (p) {
      setEndpoint(p.default_endpoint);
      setModel(p.default_model);
    }
  };

  /* ---- 提示词模板 & AI 润色 ---- */
  const applyTemplate = (t: (typeof PROMPT_TEMPLATES)[number]) => {
    setActiveTemplate(t.id);
    setPrompt(t.text);
  };

  const polishPrompt = async () => {
    if (!prompt.trim()) {
      toast.error('请先输入提示词再优化');
      return;
    }
    setPolishing(true);
    try {
      const r = await fetch(`${API_BASE}/api/prompt/polish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.detail || `优化失败（${r.status}）`);
      }
      const d = await r.json();
      setPrompt(d.polished);
      toast.success('提示词已由 DeepSeek 优化');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '优化失败，请检查后端与 DeepSeek 配置');
    } finally {
      setPolishing(false);
    }
  };

  /* ---- 主流程：上传 + 生成 ---- */
  const run = async () => {
    if (fileItems.length === 0) return toast.error('请先上传图片');
    if (!endpoint.trim()) return toast.error('请填写模型接口地址');
    if (!prompt.trim()) return toast.error('请输入系统提示词');

    setPhase('uploading');
    setProgress(6);
    setElapsed(0);
    setRows([]);
    setOutputFile(null);
    setRows(fileItems.map((f) => ({ name: f.file.name, status: 'pending' as const })));

    try {
      /* 1. 上传 */
      const fd = new FormData();
      fileItems.forEach((f) => fd.append('files', f.file));
      const upRes = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: fd });
      if (!upRes.ok) throw new Error('图片上传失败，请确认后端已启动');
      const up = await upRes.json();
      setProgress(14);

      const mapping: Record<string, string> = {};
      up.files.forEach((f: { saved_name: string; original_name: string }) => {
        mapping[f.saved_name] = f.original_name;
      });

      /* 2. 标注 */
      setPhase('annotating');
      const gd = new FormData();
      gd.append('api_endpoint', endpoint);
      if (apiKey.trim()) gd.append('api_key', apiKey);
      gd.append('system_prompt', prompt);
      gd.append('temperature', String(temperature[0]));
      gd.append('file_names', JSON.stringify(up.files.map((f: { saved_name: string }) => f.saved_name)));
      gd.append('file_mapping', JSON.stringify(mapping));
      gd.append('model', model);
      gd.append('provider_format', provider?.format ?? 'auto');

      setRows(up.files.map((f: { original_name: string }) => ({ name: f.original_name, status: 'running' as const })));

      const genRes = await fetch(`${API_BASE}/api/generate`, { method: 'POST', body: gd });
      if (!genRes.ok) throw new Error('生成请求失败，请检查后端日志');
      const gen = await genRes.json();

      /* 3. 结果归一化 */
      const detailRows: ResultRow[] = (gen.details ?? []).map((d: Record<string, string>) => ({
        name: mapping[d.saved] || d.file,
        status: d.status,
        error: d.error,
        description: d.description,
      }));
      setRows(detailRows);
      setProgress(100);
      setPhase(gen.failed > 0 && gen.success === 0 ? 'error' : 'done');

      if (gen.output_file) {
        setOutputFile(gen.output_file);
        /* 自动下载 */
        const a = document.createElement('a');
        a.href = `${API_BASE}/api/download/${gen.output_file}`;
        a.download = gen.output_file;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }

      if (gen.success > 0) {
        toast.success(`成功生成 ${gen.success} 条训练数据`, {
          description: gen.output_file ? `文件 ${gen.output_file} 已开始下载` : undefined,
        });
      }
      if (gen.failed > 0) toast.error(`${gen.failed} 张图片标注失败，请检查模型接口或密钥`);
    } catch (e) {
      setPhase('error');
      setRows((prev) =>
        prev.map((r) => (r.status === 'pending' || r.status === 'running' ? { ...r, status: 'failed', error: '任务中断' } : r)),
      );
      toast.error(e instanceof Error ? e.message : '未知错误');
    }
  };

  /* ---- 历史 & 预览 ---- */
  const openHistory = async () => {
    setHistoryOpen(true);
    try {
      const r = await fetch(`${API_BASE}/api/outputs`);
      const d = await r.json();
      setOutputs(d.files ?? []);
    } catch {
      toast.error('无法获取输出历史，请确认后端已启动');
    }
  };

  const openPreview = async (name: string) => {
    try {
      const r = await fetch(`${API_BASE}/api/preview/${name}?lines=5`);
      if (!r.ok) throw new Error();
      setPreviewFile(await r.json());
    } catch {
      toast.error('预览失败');
    }
  };

  const download = (name: string) => {
    const a = document.createElement('a');
    a.href = `${API_BASE}/api/download/${name}`;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const online = health?.status === 'ok';
  const phaseText =
    phase === 'uploading' ? '正在上传素材…'
    : phase === 'annotating' ? '视觉模型标注中…'
    : phase === 'done' ? '任务完成'
    : phase === 'error' ? '任务失败'
    : '待命中';

  /* ============================================================
     渲染
  ============================================================ */
  return (
    <div className="min-h-screen relative">
      <Toaster theme="dark" position="top-center" richColors closeButton />
      <div className="bg-fx">
        <div className="aurora aurora-violet" />
        <div className="aurora aurora-cyan" />
        <div className="aurora aurora-mint" />
      </div>

      {/* ============ 顶栏 ============ */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl grid place-items-center font-mono font-bold text-sm grad-btn select-none">
              CW
            </div>
            <div className="leading-tight">
              <div className="flex items-center gap-2">
                <span className="font-semibold tracking-wide">cwjdxy</span>
                <Badge variant="secondary" className="font-mono text-[10px] px-1.5 py-0">{APP_VERSION}</Badge>
              </div>
              <span className="text-[11px] text-muted-foreground">多模态数据工坊 · Multimodal Data Studio</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* 后端状态 */}
            <div className="hidden sm:flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-card/60">
              <span className={`dot ${online ? 'dot-online' : 'dot-offline'}`} />
              <span className="text-xs text-muted-foreground">{online ? '服务在线' : '服务离线'}</span>
              {online && health?.providers && (
                <Separator orientation="vertical" className="h-4" />
              )}
              {online && health?.providers && (
                <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                  <Cpu className="w-3 h-3" />
                  VL{health.providers.dashscope ? '✓' : '×'}
                  <KeyRound className="w-3 h-3 ml-1" />
                  DS{health.providers.deepseek ? '✓' : '×'}
                </span>
              )}
            </div>

            <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-2" onClick={openHistory}>
                  <History className="w-4 h-4" />
                  <span className="hidden sm:inline">数据历史</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:max-w-md bg-card border-border p-0 flex flex-col">
                <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
                  <SheetTitle className="flex items-center gap-2 text-base">
                    <Database className="w-4 h-4 text-violet-400" />
                    输出数据历史
                  </SheetTitle>
                  <SheetDescription>所有已生成的 JSONL 训练数据集</SheetDescription>
                </SheetHeader>
                <ScrollArea className="flex-1">
                  <div className="p-4 space-y-2.5">
                    {outputs.length === 0 && (
                      <div className="text-center py-16 text-muted-foreground text-sm">
                        <Database className="w-10 h-10 mx-auto mb-3 opacity-40" />
                        暂无输出数据
                      </div>
                    )}
                    {outputs.map((f) => (
                      <div key={f.name} className="panel p-3.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono text-xs text-foreground truncate">{f.name}</p>
                          <p className="text-[11px] text-muted-foreground mt-1">
                            {fmtSize(f.size)} · {new Date(f.created_at).toLocaleString('zh-CN')}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => openPreview(f.name)}>
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => download(f.name)}>
                            <Download className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* ============ 主体 ============ */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 py-8">
        {/* Hero */}
        <section className="reveal mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            把图片变成<span className="grad-text">可训练的数据集</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl">
            上传图片 → 选择视觉模型 → 一键生成 LLaMA-Factory 兼容的 JSONL 标注数据，全流程可视化。
          </p>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
          {/* ---------- 左列：步骤 ---------- */}
          <div className="space-y-6 min-w-0">
            {/* Step 1 上传 */}
            <section className="panel panel-glow reveal p-6">
              <StepHeader no="01" title="素材上传" icon={Upload} desc="拖拽或点击选择，支持 JPG / PNG / WebP" />

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  addFiles(Array.from(e.dataTransfer.files));
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`dropzone py-9 px-6 text-center cursor-pointer ${dragging ? 'dragging' : ''}`}
              >
                <div
                  className={`w-12 h-12 mx-auto mb-3 rounded-xl bg-violet-500/15 border border-violet-400/30 grid place-items-center transition-transform duration-200 ${dragging ? 'scale-110 -translate-y-1' : ''}`}
                >
                  <Upload className="w-5 h-5 text-violet-300" />
                </div>
                <p className="text-sm text-foreground">{dragging ? '松手即可添加' : '拖拽图片到此处，或点击选择文件'}</p>
                <p className="text-xs text-muted-foreground mt-1.5">单张不超过 20MB · 支持批量 · 自动去重</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    addFiles(Array.from(e.target.files ?? []));
                    e.target.value = '';
                  }}
                />
              </div>

              {fileItems.length > 0 && (
                <div className="fade-in overflow-hidden">
                    <div className="mt-4 grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2.5">
                      {fileItems.map((f, i) => (
                        <div
                          key={`${f.file.name}_${f.file.size}_${i}`}
                          className="thumb-card group aspect-square pop-in"
                        >
                          <img src={f.url} alt={f.file.name} className="w-full h-full object-cover" />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFile(i);
                            }}
                            className="absolute top-1.5 right-1.5 w-6 h-6 rounded-md bg-black/60 backdrop-blur grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-500/80"
                          >
                            <X className="w-3.5 h-3.5 text-white" />
                          </button>
                          <span className="absolute bottom-0 inset-x-0 bg-black/75 backdrop-blur-[2px] px-2 py-1">
                            <span className="block text-[10px] font-mono text-white/95 truncate" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>{f.file.name}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        共 <span className="text-violet-300 font-mono">{fileItems.length}</span> 张 · {fmtSize(totalBytes)}
                      </p>
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-rose-300" onClick={clearFiles}>
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        清空
                      </Button>
                    </div>
                </div>
              )}
            </section>

            {/* Step 2 模型与提示词 */}
            <section className="panel panel-glow reveal reveal-2 p-6">
              <StepHeader no="02" title="模型与提示词" icon={Settings2} desc="选择服务商预设，或接入任意 OpenAI 兼容端点" />

              {/* 服务商预设 */}
              <Label className="text-xs text-muted-foreground mb-2 block">服务商</Label>
              <div className="grid sm:grid-cols-2 gap-2.5 mb-5">
                {presets.map((p) => (
                  <button key={p.id} onClick={() => selectProvider(p.id)} className={`provider-card text-left ${providerId === p.id ? 'active' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">{p.label}</span>
                      {p.builtin && p.has_key !== false && (
                        <span className="shrink-0 whitespace-nowrap flex items-center gap-1 text-[10px] text-emerald-300 bg-emerald-400/10 border border-emerald-400/25 rounded-full px-2 py-0.5">
                          <Zap className="w-2.5 h-2.5" />内置密钥
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{p.description}</p>
                  </button>
                ))}
              </div>

              {/* 模型 / 端点 / 密钥 */}
              <div className="grid sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">模型</Label>
                  <Select value={model} onValueChange={setModel}>
                    <SelectTrigger className="w-full bg-input-background border-input">
                      <SelectValue placeholder="选择模型" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      {provider?.models.map((m) => (
                        <SelectItem key={m} value={m} className="font-mono text-xs">{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">接口地址</Label>
                  <Input
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                    placeholder="https://api.example.com/v1/chat/completions"
                    className="bg-input-background border-input font-mono text-xs"
                  />
                </div>
              </div>

              <div className="mb-5">
                <Label className="text-xs text-muted-foreground mb-1.5 block">
                  API Key
                  <span className="ml-2 text-[11px] text-emerald-300/80 inline-flex items-center gap-1">
                    <Zap className="w-3 h-3" />留空自动使用 .env 内置密钥
                  </span>
                </Label>
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-…（可选）"
                  className="bg-input-background border-input font-mono text-xs"
                />
              </div>

              <Separator className="mb-5 opacity-60" />

              {/* 提示词 */}
              <Label className="text-xs text-muted-foreground mb-2 block">标注提示词</Label>
              <div className="flex flex-wrap gap-2 mb-3">
                {PROMPT_TEMPLATES.map((t) => (
                  <button key={t.id} onClick={() => applyTemplate(t)} className={`chip ${activeTemplate === t.id ? 'active' : ''}`}>
                    {t.label}
                  </button>
                ))}
              </div>
              <Textarea
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  setActiveTemplate('custom');
                }}
                rows={4}
                placeholder="描述你希望视觉模型如何标注图片…"
                className="bg-input-background border-input text-sm resize-none leading-relaxed"
              />
              <div className="mt-2.5 flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground font-mono">{prompt.length} 字符</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1.5 border-violet-400/40 text-violet-300 hover:bg-violet-400/10 hover:text-violet-200"
                  onClick={polishPrompt}
                  disabled={polishing}
                >
                  {polishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                  AI 优化提示词
                </Button>
              </div>

              {/* 温度 */}
              <div className="mt-5">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs text-muted-foreground">采样温度</Label>
                  <span className="font-mono text-xs text-violet-300">{temperature[0].toFixed(1)}</span>
                </div>
                <Slider value={temperature} onValueChange={setTemperature} min={0} max={1} step={0.1} />
                <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground/70 font-mono">
                  <span>0.0 严谨</span>
                  <span>0.5 平衡</span>
                  <span>1.0 多样</span>
                </div>
              </div>
            </section>

            {/* Step 3 输出格式 */}
            <section className="panel panel-glow reveal reveal-3 p-6">
              <StepHeader no="03" title="输出格式" icon={Braces} desc="生成 ShareGPT 多模态格式，直接投入训练" />
              <div className="mono-block p-4 overflow-x-auto whitespace-pre">{SAMPLE_JSONL}</div>
              <div className="mt-3.5 flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-muted-foreground mr-1">兼容框架：</span>
                {['LLaMA-Factory', 'Qwen-VL', 'ShareGPT'].map((t) => (
                  <Badge key={t} variant="secondary" className="font-mono text-[10px] bg-secondary/70">{t}</Badge>
                ))}
              </div>
            </section>
          </div>

          {/* ---------- 右列：运行控制台 ---------- */}
          <aside className="reveal reveal-1 lg:sticky lg:top-24 space-y-6">
            <section className={`panel p-6 ${busy ? 'scanline' : ''}`}>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-[15px] font-semibold tracking-wide flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-300" />
                  运行控制台
                </h2>
                <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full border ${
                  phase === 'done' ? 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10'
                  : phase === 'error' ? 'text-rose-300 border-rose-400/30 bg-rose-400/10'
                  : busy ? 'text-violet-300 border-violet-400/30 bg-violet-400/10 animate-pulse'
                  : 'text-muted-foreground border-border'
                }`}>
                  {phaseText}
                </span>
              </div>

              {/* CTA */}
              <Button
                onClick={run}
                disabled={busy || fileItems.length === 0}
                className="grad-btn w-full h-12 rounded-xl text-[15px] font-semibold gap-2"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                {busy ? '任务进行中…' : fileItems.length === 0 ? '请先上传图片' : `开始生成（${fileItems.length} 张）`}
              </Button>

              {/* 进度 */}
              <div className="mt-5 flex items-center gap-4">
                <ProgressRing value={progress} active={busy} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground">{phaseText}</p>
                  <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                    {provider?.label} · <span className="font-mono">{model || '—'}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground font-mono mt-0.5">耗时 {fmtElapsed(elapsed)}</p>
                </div>
              </div>

              {/* 统计 */}
              <div className="mt-5 grid grid-cols-3 gap-2.5">
                <div className="rounded-lg border border-border bg-card/50 px-3 py-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground">成功</p>
                  <p className="text-lg font-semibold text-emerald-300 font-mono leading-tight mt-0.5">
                    {rows.filter((r) => r.status === 'success').length}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-card/50 px-3 py-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground">失败</p>
                  <p className="text-lg font-semibold text-rose-300 font-mono leading-tight mt-0.5">
                    {rows.filter((r) => r.status === 'failed').length}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-card/50 px-3 py-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground">总计</p>
                  <p className="text-lg font-semibold text-foreground font-mono leading-tight mt-0.5">{fileItems.length}</p>
                </div>
              </div>

              {/* 文件状态 */}
              {rows.length > 0 && (
                <ScrollArea className="mt-4 h-44 rounded-lg border border-border bg-background/40">
                  <div className="p-2.5 space-y-1">
                    {rows.map((r, i) => (
                      <div key={`${r.name}_${i}`} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/[0.03]">
                        <StatusIcon status={r.status} />
                        <span className="text-[11px] text-foreground/85 truncate flex-1" title={r.name}>{r.name}</span>
                        {r.error && (
                          <span className="text-[10px] text-rose-300/70 truncate max-w-28" title={r.error}>{r.error}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}

              {/* 结果操作 */}
              {outputFile && (
                <div className="fade-in mt-4 space-y-2.5">
                  <Separator className="opacity-60" />
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono px-0.5">
                    <Database className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                    <span className="truncate">{outputFile}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => outputFile && download(outputFile)}>
                      <Download className="w-3.5 h-3.5" />下载 JSONL
                    </Button>
                    <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => outputFile && openPreview(outputFile)}>
                      <Eye className="w-3.5 h-3.5" />预览数据
                    </Button>
                  </div>
                </div>
              )}
            </section>

            {/* 贴士 */}
            <section className="panel p-5">
              <h3 className="text-[13px] font-semibold flex items-center gap-2 mb-3">
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                提效贴士
              </h3>
              <ul className="space-y-2.5 text-xs text-muted-foreground leading-relaxed">
                <li className="flex gap-2"><span className="text-violet-300 font-mono shrink-0">01</span>温度 0.2–0.5 适合键值抽取类任务，输出更稳定。</li>
                <li className="flex gap-2"><span className="text-violet-300 font-mono shrink-0">02</span>先用"AI 优化提示词"润色，可显著提升标注结构化程度。</li>
                <li className="flex gap-2"><span className="text-violet-300 font-mono shrink-0">03</span>生成的 JSONL 可直接放入 LLaMA-Factory 的 data 目录。</li>
              </ul>
            </section>
          </aside>
        </div>

        {/* Footer */}
        <footer className="relative z-10 py-10 mt-6 border-t border-border/50 text-center">
          <p className="text-xs text-muted-foreground">
            <span className="grad-text font-semibold">cwjdxy</span> 多模态数据工坊 {APP_VERSION} · 数据格式兼容 LLaMA-Factory / Qwen-VL 训练框架
          </p>
        </footer>
      </main>

      {/* ============ 预览弹窗 ============ */}
      <Dialog open={!!previewFile} onOpenChange={(o) => !o && setPreviewFile(null)}>
        <DialogContent className="max-w-2xl bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Braces className="w-4 h-4 text-cyan-300" />
              数据预览
              <span className="font-mono text-xs text-muted-foreground">{previewFile?.file}</span>
            </DialogTitle>
            <DialogDescription>
              共 {previewFile?.total ?? 0} 条记录，以下为前 {previewFile?.records.length ?? 0} 条
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[55vh] rounded-lg">
            <div className="mono-block p-4 whitespace-pre-wrap break-all">
              {previewFile?.records.map((rec, i) => (
                <div key={i} className="mb-3 pb-3 border-b border-border/40 last:border-0 last:mb-0 last:pb-0">
                  {JSON.stringify(rec, null, 2)}
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
