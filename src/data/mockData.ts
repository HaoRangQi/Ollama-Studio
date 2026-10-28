import {
  OllamaModel,
  CuratedHubModel,
  DownloadTask,
  ChatMessage,
  DaemonLog,
  DaemonConfig
} from '../types';

export const INITIAL_MODELS: OllamaModel[] = [
  {
    id: 'deepseek-r1-8b',
    name: 'deepseek-r1',
    tag: '8b-llama-distill',
    fullTag: 'deepseek-r1:8b-llama-distill',
    category: 'llm',
    categoryLabel: '大语言 LLM',
    description: '强化学习蒸馏推理思考模型 · 内置Chain-of-Thought深度演算',
    quantization: 'Q4_K_M',
    size: '4.9 GB',
    sizeGb: 4.9,
    context: '128k',
    speed: '42.8 t/s',
    status: 'running',
    vramUsage: '5.41 GB',
    gpuLayers: '33 / 33 Layers (100%)',
    kvCache: '512 MB',
    lastUsed: '12分钟前在 终端 使用过',
    icon: 'psychology',
    iconBg: 'bg-[#7952ec]/20',
    iconColor: 'text-[#cdbdff]',
    parameters: {
      temperature: 0.6,
      topP: 0.95,
      numCtx: 8192,
      repeatPenalty: 1.1
    },
    modelfile: {
      from: 'deepseek-r1:8b',
      stop: '<｜end of sentence｜>',
      temperature: 0.6,
      system: '你是由深度求索开发的智能思考模型，具备严谨推导与分步复盘能力。'
    }
  },
  {
    id: 'llama3-3-70b',
    name: 'llama3.3',
    tag: '70b-instruct-q4_K_M',
    fullTag: 'llama3.3:70b-instruct',
    category: 'llm',
    categoryLabel: '大语言 LLM',
    description: 'Meta 前沿开源巨无霸权重 · 全能推理与跨语言多任务支持',
    quantization: 'Q4_K_M',
    size: '42.1 GB',
    sizeGb: 42.1,
    context: '128k',
    speed: '18.4 t/s',
    status: 'idle',
    vramUsage: '0.0 GB (待加载)',
    gpuLayers: '0 / 80 Layers (0%)',
    kvCache: '0 MB',
    lastUsed: '昨天 21:30',
    note: '需要约 43.5GB 统一内存',
    icon: '🦙',
    iconBg: 'bg-[#4d31a8]/40',
    iconColor: 'text-[#cbbeff]',
    parameters: {
      temperature: 0.7,
      topP: 0.9,
      numCtx: 8192,
      repeatPenalty: 1.15
    },
    modelfile: {
      from: 'llama3.3:70b',
      stop: '<|eot_id|>',
      temperature: 0.7,
      system: 'You are Llama 3.3, a helpful and precise assistant from Meta.'
    }
  },
  {
    id: 'qwen-2-5-coder',
    name: 'qwen2.5-coder',
    tag: '14b-instruct',
    fullTag: 'qwen2.5-coder:14b-instruct',
    category: 'code',
    categoryLabel: '代码生成 (Coder)',
    description: '阿里通义代码专用强化版 · 擅长 Rust、Python 及复杂系统架构',
    quantization: 'Q5_K_M',
    size: '9.0 GB',
    sizeGb: 9.0,
    context: '32,768 Tokens',
    speed: '34.2 t/s',
    status: 'idle',
    vramUsage: '0.0 GB (待加载)',
    gpuLayers: '0 / 48 Layers (0%)',
    kvCache: '0 MB',
    lastUsed: '2小时前',
    note: '默认编码补全引擎',
    icon: 'terminal',
    iconBg: 'bg-[#ba4385]/20',
    iconColor: 'text-[#ffafd3]',
    parameters: {
      temperature: 0.2,
      topP: 0.85,
      numCtx: 32768,
      repeatPenalty: 1.05
    },
    modelfile: {
      from: 'qwen2.5-coder:14b',
      stop: '<|im_end|>',
      temperature: 0.2,
      system: '你是一位精通跨语言系统架构设计的资深软件工程大师。'
    }
  },
  {
    id: 'llava-1-6',
    name: 'llava',
    tag: '13b-v1.6',
    fullTag: 'llava:13b-v1.6',
    category: 'vision',
    categoryLabel: '视觉多模态 (Vision)',
    description: '高分辨率视觉图文解析 · CLIP ViT-L/14 多尺度特征对齐',
    quantization: 'Q4_0',
    size: '8.0 GB',
    sizeGb: 8.0,
    context: '4,096 Tokens',
    speed: '28.6 t/s',
    status: 'idle',
    vramUsage: '0.0 GB (待加载)',
    gpuLayers: '0 / 40 Layers (0%)',
    kvCache: '0 MB',
    lastUsed: '3天前',
    note: '支持剪贴板图像拖拽',
    icon: 'image_search',
    iconBg: 'bg-[#4d31a8]/30',
    iconColor: 'text-[#bdadff]',
    parameters: {
      temperature: 0.4,
      topP: 0.9,
      numCtx: 4096,
      repeatPenalty: 1.1
    },
    modelfile: {
      from: 'llava:13b-v1.6',
      stop: '</s>',
      temperature: 0.4,
      system:
        'You are a multimodal AI assistant skilled at deciphering complex images, diagrams, and UI mockups.'
    }
  },
  {
    id: 'minicpm-v-2-6',
    name: 'minicpm-v',
    tag: '8b-2.6',
    fullTag: 'minicpm-v:8b',
    category: 'vision',
    categoryLabel: '视觉多模态 (Vision)',
    description: '端侧最强多模态架构，支持高清 OCR 与视频流解析',
    quantization: 'Q4_K_M',
    size: '5.5 GB',
    sizeGb: 5.5,
    context: '8k',
    speed: '38.0 t/s',
    status: 'idle',
    icon: 'photo_camera',
    iconBg: 'bg-[#ba4385]/20',
    iconColor: 'text-[#ffafd3]',
    parameters: {
      temperature: 0.5,
      topP: 0.9,
      numCtx: 8192,
      repeatPenalty: 1.1
    },
    modelfile: {
      from: 'minicpm-v:8b',
      stop: '<|endoftext|>',
      temperature: 0.5,
      system: 'MiniCPM-V 高性能视觉交互助手。'
    }
  },
  {
    id: 'nomic-embed-text',
    name: 'nomic-embed-text',
    tag: 'v1.5',
    fullTag: 'nomic-embed-text:v1.5',
    category: 'embedding',
    categoryLabel: 'Embedding 嵌入',
    description: '专为本地 RAG 检索设计的长序列嵌入模型，原生支持 8192 上下文',
    quantization: 'F16',
    size: '274 MB',
    sizeGb: 0.274,
    context: '8,192 Tokens',
    speed: '120.0 t/s',
    status: 'idle',
    icon: 'hub',
    iconBg: 'bg-[#7952ec]/20',
    iconColor: 'text-[#cdbdff]',
    parameters: {
      temperature: 0.0,
      topP: 1.0,
      numCtx: 8192,
      repeatPenalty: 1.0
    },
    modelfile: {
      from: 'nomic-embed-text:v1.5',
      stop: '',
      temperature: 0,
      system: ''
    }
  },
  {
    id: 'mistral-nemo',
    name: 'mistral-nemo',
    tag: '12b-instruct-2407',
    fullTag: 'mistral-nemo:12b',
    category: 'llm',
    categoryLabel: '大语言 LLM',
    description: 'Mistral 与 NVIDIA 联合打造，128k 原生上下文，极速响应',
    quantization: 'Q4_K_M',
    size: '7.1 GB',
    sizeGb: 7.1,
    context: '128k',
    speed: '39.4 t/s',
    status: 'idle',
    icon: 'psychology',
    iconBg: 'bg-[#4d31a8]/30',
    iconColor: 'text-[#cbbeff]',
    parameters: {
      temperature: 0.6,
      topP: 0.9,
      numCtx: 16384,
      repeatPenalty: 1.1
    },
    modelfile: {
      from: 'mistral-nemo:12b',
      stop: '[/INST]',
      temperature: 0.6,
      system: 'Always provide precise, technical and factual answers.'
    }
  },
  {
    id: 'phi4',
    name: 'phi4',
    tag: '14b-q4_K_M',
    fullTag: 'phi4:14b',
    category: 'llm',
    categoryLabel: '大语言 LLM',
    description: '微软前沿合成数据训练旗舰，数学推理与逻辑严密性标杆',
    quantization: 'Q4_K_M',
    size: '9.1 GB',
    sizeGb: 9.1,
    context: '16k',
    speed: '31.2 t/s',
    status: 'idle',
    icon: 'calculate',
    iconBg: 'bg-[#7952ec]/30',
    iconColor: 'text-[#cdbdff]',
    parameters: {
      temperature: 0.3,
      topP: 0.95,
      numCtx: 16384,
      repeatPenalty: 1.05
    },
    modelfile: {
      from: 'phi4:14b',
      stop: '<|im_end|>',
      temperature: 0.3,
      system: 'You are Phi-4, a reasoning and mathematics expert.'
    }
  }
];

export const INITIAL_CURATED_MODELS: CuratedHubModel[] = [
  {
    id: 'hub-deepseek-r1',
    name: 'deepseek-r1',
    version: 'v1.5',
    author: 'DeepSeek',
    description: '第一代强推理蒸馏开源大模型，具备反思、修正与复杂逻辑验证能力。',
    category: 'reason',
    hardwareFit: '8GB 内存适配良好',
    hardwareFitColor: 'green',
    sizes: ['1.5b', '7b', '8b', '14b', '32b'],
    activeSize: '7b',
    sizeGb: '~4.7 GB',
    pullCount: '1.2M+',
    icon: 'psychology_alt',
    iconBg: 'bg-primary-container/20',
    iconColor: 'text-primary'
  },
  {
    id: 'hub-llama3-3',
    name: 'llama3.3',
    version: 'Meta',
    author: 'Meta',
    description: 'Meta 全新 70B 顶尖旗舰模型，具备卓越的多语言支持、128K 宽广上下文窗口。',
    category: 'general',
    hardwareFit: '建议 36GB+ 统一内存',
    hardwareFitColor: 'purple',
    sizes: ['70b'],
    activeSize: '70b',
    sizeGb: '42.5 GB',
    pullCount: '860K+',
    icon: 'forum',
    iconBg: 'bg-secondary-container/40',
    iconColor: 'text-on-secondary-container',
    tagNote: 'Q4_K_M (42.5 GB)'
  },
  {
    id: 'hub-qwen2-5-coder',
    name: 'qwen2.5-coder',
    version: 'Alibaba',
    author: 'Alibaba',
    description: '通义千问专精代码生成模型，覆盖 92 种语言，支持长代码补全与复杂系统级重构。',
    category: 'code',
    hardwareFit: '16GB 内存完美适配',
    hardwareFitColor: 'green',
    sizes: ['1.5b', '7b', '14b', '32b'],
    activeSize: '7b',
    sizeGb: '~4.7 GB',
    pullCount: '940K+',
    icon: 'code',
    iconBg: 'bg-primary/20',
    iconColor: 'text-primary'
  },
  {
    id: 'hub-minicpm-v',
    name: 'minicpm-v',
    version: 'OpenBMB',
    author: 'OpenBMB',
    description: '强大的端侧多模态模型，支持 OCR、复杂图表细粒度识别与端到端实时视频流解析。',
    category: 'vision',
    hardwareFit: '端侧单图/视频理解',
    hardwareFitColor: 'green',
    sizes: ['8b (2.6)'],
    activeSize: '8b (2.6)',
    sizeGb: '~5.5 GB',
    pullCount: '310K+',
    icon: 'photo_camera',
    iconBg: 'bg-tertiary-container/30',
    iconColor: 'text-tertiary',
    tagNote: 'VLM 高清像素引擎'
  },
  {
    id: 'hub-llava',
    name: 'llava',
    version: 'v1.6',
    author: 'Community',
    description: '广受赞誉的多模态视觉问答先驱，兼具敏锐的图像构图理解与多轮视觉交谈。',
    category: 'vision',
    hardwareFit: '16GB 内存完美适配',
    hardwareFitColor: 'green',
    sizes: ['7b', '13b'],
    activeSize: '7b',
    sizeGb: '~4.5 GB',
    pullCount: '1.5M+',
    icon: 'visibility',
    iconBg: 'bg-secondary-container/40',
    iconColor: 'text-on-secondary-container'
  },
  {
    id: 'hub-nomic-embed',
    name: 'nomic-embed-text',
    version: 'v1.5',
    author: 'Nomic AI',
    description: '专为本地 RAG 知识库检索设计的长文本嵌入模型，原生支持 8192 序列长度。',
    category: 'general',
    hardwareFit: '极低资源开销 (274MB)',
    hardwareFitColor: 'green',
    sizes: ['v1.5 (F16)'],
    activeSize: 'v1.5 (F16)',
    sizeGb: '~274 MB',
    pullCount: '2.1M+',
    icon: 'hub',
    iconBg: 'bg-primary-container/20',
    iconColor: 'text-primary',
    tagNote: 'Embedding 推荐'
  }
];

export const INITIAL_DOWNLOAD_TASK: DownloadTask = {
  id: 'task-deepseek-r1-14b',
  modelName: 'deepseek-r1:14b',
  quant: 'Q4_K_M',
  layerStatus: '传输中 Layer 28/48',
  speed: '52.4 MB/s',
  remainingTime: '预计剩余 42s',
  progress: 65.1,
  downloadedGb: 5.8,
  totalGb: 8.9,
  targetPath: '~/.ollama/models/manifests/registry.ollama.ai/library/deepseek-r1',
  sha256: '0a9e71f54...verified',
  isPaused: false,
  isActive: false
};

export const INITIAL_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: 'msg-1',
    role: 'user',
    content:
      '请用 Swift 为 macOS 设计一个极简的后台挂载状态栏监控模块，要求调用本地 Apple Silicon 的 Metal Performance Shaders 统计当前统一内存与吞吐，并提供结构化的 JSON 导出。',
    timestamp: '16:42',
    targetPlatform: 'Target: macOS 15.0+'
  },
  {
    id: 'msg-2',
    role: 'assistant',
    modelName: 'deepseek-r1',
    duration: '推理完毕 (耗时 3.4s)',
    thinkingTime: '2.8 秒',
    thinkingTokens: 134,
    thinkingContent: `1. 用户需求明确：macOS 15+ 菜单栏小程序 (NSStatusItem)，监控 Apple Silicon 的统一显存 (UMA) 以及 Metal 带宽吞吐。\n2. 技术方案：结合 IOKit 获取驱动层显存占用，利用 MTLDevice 获取当前 GPU 支持矩阵。\n3. 结构化导出：提供符合 Codable 协议的 Swift 数据结构，以便定时或按需导出 JSON 格式报告。`,
    content:
      '在 Apple Silicon 统一内存架构下，显存与系统内存共享物理池。我们可以通过调用底层 `Metal` 框架并配合 `mach_vm` / `IOKit` 来精确提取显存分配与负载。以下是完整的模块设计：',
    codeSnippet: {
      filename: 'MetalTelemetryManager.swift',
      language: 'Swift 6.0',
      code: `import Foundation
import Metal
import IOKit

// 结构化导出模型
public struct MetalTelemetryPayload: Codable, Sendable {
    public let timestamp: Date
    public let allocatedVRAMBytes: UInt64
    public let maxRecommendedVRAMBytes: UInt64
    public let activeDeviceName: String
}

@MainActor
public final class MetalTelemetryMonitor: ObservableObject {
    private let device: MTLDevice?

    public init() {
        self.device = MTLCreateSystemDefaultDevice()
    }

    public func fetchCurrentTelemetry() -> MetalTelemetryPayload? {
        guard let dev = device else { return nil }
        
        return MetalTelemetryPayload(
            timestamp: Date(),
            allocatedVRAMBytes: dev.currentAllocatedSize,
            maxRecommendedVRAMBytes: dev.recommendedMaxWorkingSetSize,
            activeDeviceName: dev.name
        )
    }

    public func exportJSON() throws -> String {
        guard let data = fetchCurrentTelemetry() else { throw NSError() }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let json = try encoder.encode(data)
        return String(decoding: json, as: UTF8.self)
    }
}`
    },
    totalTokens: 422,
    timestamp: '16:42'
  }
];

export const INITIAL_DAEMON_LOGS: DaemonLog[] = [
  {
    id: 'log-1',
    timestamp: '2025-05-18 10:14:02.102',
    module: 'system',
    text: '初始化 Metal 加速层: Apple M3 Max (30 GPU Cores) 已捕获',
    level: 'info'
  },
  {
    id: 'log-2',
    timestamp: '2025-05-18 10:14:02.115',
    module: 'system',
    text: '探测统一虚拟显存配额: 28672 MB 可用',
    level: 'info'
  },
  {
    id: 'log-3',
    timestamp: '2025-05-18 10:14:02.480',
    module: 'server',
    text: 'Listening on 0.0.0.0:11434 (version 0.5.12)',
    level: 'info'
  },
  {
    id: 'log-4',
    timestamp: '2025-05-18 10:15:30.912',
    module: 'runner',
    text: '加载模型权重: qwen2.5:14b-instruct-q4_K_M',
    level: 'info'
  },
  {
    id: 'log-5',
    timestamp: '2025-05-18 10:15:31.020',
    module: 'runner',
    text: '分配 48/48 权重层至 Apple Silicon GPU VRAM (占用 8,924 MB)',
    level: 'detail'
  },
  {
    id: 'log-6',
    timestamp: '2025-05-18 10:15:31.540',
    module: 'runner',
    text: '上下文槽位预热就绪: context_length=32768, batch_size=512, flash_attn=true',
    level: 'success'
  },
  {
    id: 'log-7',
    timestamp: '2025-05-18 10:17:45.312',
    module: 'http',
    text: 'POST /api/chat 200 OK (持续 1,420ms, 输出 246 tokens, 吞吐 54.2 t/s)',
    level: 'info'
  },
  {
    id: 'log-8',
    timestamp: '2025-05-18 10:19:12.809',
    module: 'http',
    text: 'POST /api/generate 200 OK (持续 820ms, 输出 94 tokens)',
    level: 'info'
  },
  {
    id: 'log-9',
    timestamp: '2025-05-18 10:22:04.119',
    module: 'runner',
    text: '接收并发槽位扩展请求: 增加活跃通道 2 -> 3',
    level: 'detail'
  },
  {
    id: 'log-10',
    timestamp: '2025-05-18 10:23:18.001',
    module: 'gc',
    text: '触发自动内存页检查: 零泄漏检测正常',
    level: 'info'
  },
  {
    id: 'log-11',
    timestamp: '2025-05-18 10:25:40.672',
    module: 'telemetry',
    text: 'GPU 温度 58°C, ANE 活跃，总内存占用处于黄金安全区间',
    level: 'success'
  },
  {
    id: 'log-12',
    timestamp: '2025-05-18 10:28:11.942',
    module: 'http',
    text: 'GET /api/tags 200 OK (已缓存)',
    level: 'info'
  },
  {
    id: 'log-13',
    timestamp: '2025-05-18 10:30:00.100',
    module: 'stream',
    text: '准备流式输出响应 token_index=0 ...',
    level: 'detail'
  },
  {
    id: 'log-14',
    timestamp: '2025-05-18 10:30:02.410',
    module: 'stream',
    text: '输出完成: 吞吐峰值 61.8 tokens/s',
    level: 'success'
  }
];

export const INITIAL_DAEMON_CONFIG: DaemonConfig = {
  host: '0.0.0.0:11434',
  modelsPath: '~/.ollama/models',
  numParallel: 4,
  keepAlive: '15m',
  flashAttention: true
};
