import React, { useState } from 'react';
import { OllamaModel } from '../types';
import { useAppTheme } from '../context/ThemeContext';
import { CreateModelRequest } from '../api/ollama';

interface ModelfileLabScreenProps {
  models: OllamaModel[];
  initialModel?: OllamaModel;
  onCreateModel: (request: CreateModelRequest) => Promise<OllamaModel | null>;
  onLaunchTestChat: (model: OllamaModel) => void;
}

export const ModelfileLabScreen: React.FC<ModelfileLabScreenProps> = ({
  models,
  initialModel,
  onCreateModel,
  onLaunchTestChat
}) => {
  const { t, language } = useAppTheme();
  const base = initialModel ?? models[0] ?? null;

  const [modelName, setModelName] = useState(base ? `${base.name.split(':')[0]}-custom` : '');
  const [baseFrom, setBaseFrom] = useState(base?.modelfile.from ?? '');
  const [temperature, setTemperature] = useState(base?.parameters.temperature ?? 0.6);
  const [topP, setTopP] = useState(base?.parameters.topP ?? 0.95);
  const [numCtx, setNumCtx] = useState(base?.parameters.numCtx ?? 8192);
  const [stopTokens, setStopTokens] = useState(base?.modelfile.stop || '<｜end of sentence｜>');
  const [systemPrompt, setSystemPrompt] = useState(base?.modelfile.system ?? '');
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildSuccess, setBuildSuccess] = useState(false);
  const [createdModel, setCreatedModel] = useState<OllamaModel | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  if (!base) {
    return (
      <div className="flex flex-col w-full min-h-screen items-center justify-center px-6 text-center gap-4">
        <div
          className="w-16 h-16 rounded-3xl flex items-center justify-center border border-[var(--app-border)]"
          style={{ backgroundColor: 'var(--app-surface-high)', color: 'var(--primary-accent)' }}
        >
          <span className="material-symbols-outlined text-[34px]">science</span>
        </div>
        <h1 className="font-headline text-[22px] text-[var(--app-text)] font-bold">
          {language === 'zh' ? '没有可用的基础模型' : 'No base model available'}
        </h1>
        <p className="text-[13px] text-[var(--app-text-muted)] max-w-md leading-relaxed">
          {language === 'zh'
            ? 'Modelfile 实验室需要一个本地模型作为 FROM。先拉取或导入模型，再回来构建。'
            : 'The Modelfile lab needs a local model as FROM. Pull or import a model first.'}
        </p>
      </div>
    );
  }

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const presets =
    language === 'zh'
      ? [
          {
            name: 'macOS / Metal 极客',
            system:
              '你是一位精通 macOS 底层系统调用、Swift Concurrency、Metal Performance Shaders 与 Apple Silicon 神经计算单元 (ANE) 的工程级架构师。',
            temp: 0.3,
            numCtx: 16384
          },
          {
            name: '深度链式推理 (CoT)',
            system:
              '你是由开源蒸馏强化训练的深度推理专家，在输出答案前必须使用 <think> 详细展开思维推导步骤与复盘。',
            temp: 0.6,
            numCtx: 32768
          },
          {
            name: '极简 JSON API 代理',
            system:
              'You are an ultra-compact API translator. You must ONLY output valid RFC 8259 JSON without conversational filler.',
            temp: 0.1,
            numCtx: 8192
          }
        ]
      : [
          {
            name: 'macOS / Metal engineer',
            system:
              'You are an expert engineer in macOS system calls, Swift Concurrency, Metal Performance Shaders, and Apple Silicon neural engines.',
            temp: 0.3,
            numCtx: 16384
          },
          {
            name: 'Chain-of-thought',
            system:
              'You are a rigorous reasoning expert. Think through the problem step by step before giving the final answer.',
            temp: 0.6,
            numCtx: 32768
          },
          {
            name: 'Minimal JSON API',
            system:
              'You are an ultra-compact API translator. You must ONLY output valid RFC 8259 JSON without conversational filler.',
            temp: 0.1,
            numCtx: 8192
          }
        ];

  const applyPreset = (p: (typeof presets)[0]) => {
    setSystemPrompt(p.system);
    setTemperature(p.temp);
    setNumCtx(p.numCtx);
    showToast(language === 'zh' ? `已应用预设: ${p.name}` : `Preset applied: ${p.name}`);
  };

  const generatedModelfile = `FROM ${baseFrom}
PARAMETER temperature ${temperature.toFixed(2)}
PARAMETER top_p ${topP.toFixed(2)}
PARAMETER num_ctx ${numCtx}
${stopTokens ? `PARAMETER stop "${stopTokens}"\n` : ''}SYSTEM """
${systemPrompt}
"""`;

  const handleBuild = async () => {
    if (!modelName.trim() || !baseFrom.trim()) {
      showToast(
        language === 'zh' ? '模型名称和 FROM 不能为空' : 'Model name and FROM are required'
      );
      return;
    }

    const targetTag = modelName.includes(':') ? modelName.trim() : `${modelName.trim()}:latest`;
    setIsBuilding(true);
    setBuildSuccess(false);
    setCreatedModel(null);

    try {
      const created = await onCreateModel({
        model: targetTag,
        from: baseFrom,
        system: systemPrompt,
        parameters: {
          temperature,
          top_p: topP,
          num_ctx: numCtx,
          ...(stopTokens ? { stop: [stopTokens] } : {})
        }
      });
      setBuildSuccess(true);
      setCreatedModel(created);
      showToast(
        created
          ? `${t.modelfileLab.successRegistered}: ${created.fullTag}`
          : `${t.modelfileLab.successRegistered}: ${targetTag}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showToast(language === 'zh' ? `构建失败：${message}` : `Build failed: ${message}`);
    } finally {
      setIsBuilding(false);
    }
  };

  return (
    <div className="flex flex-col w-full p-6 lg:p-8 max-w-7xl mx-auto gap-6 animate-in fade-in duration-200">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className="fixed top-20 right-8 z-50 text-white px-5 py-2.5 rounded-full shadow-2xl flex items-center gap-2 text-[13px] font-medium border border-white/20 animate-in slide-in-from-top-4 duration-150"
          style={{ backgroundColor: 'var(--primary-accent)' }}
        >
          <span className="material-symbols-outlined text-[18px]">done_all</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <section className="relative overflow-hidden rounded-3xl bg-[var(--app-surface-high)] p-6 lg:p-8 shadow-xl border border-[var(--app-border)]">
        <div
          className="absolute -top-24 right-10 w-80 h-80 rounded-full blur-3xl pointer-events-none opacity-20"
          style={{ backgroundColor: 'var(--primary-accent)' }}
        />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center border border-[var(--app-border)] text-white"
              style={{ backgroundColor: 'var(--primary-accent)' }}
            >
              <span className="material-symbols-outlined text-[32px]">science</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-headline text-[24px] lg:text-[28px] text-[var(--app-text)] font-bold">
                  {t.modelfileLab.title}
                </h1>
                <span className="bg-[var(--app-surface)] text-[var(--app-text)] font-code text-[11px] px-2.5 py-0.5 rounded-full border border-[var(--app-border)]">
                  ollama create
                </span>
              </div>
              <p className="text-[13px] text-[var(--app-text-muted)] mt-1">{t.modelfileLab.desc}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                navigator.clipboard?.writeText(generatedModelfile);
                showToast(t.modelfileLab.copySource);
              }}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-[var(--app-surface)] hover:bg-[var(--app-surface-highest)] text-[var(--app-text)] text-[13px] font-medium transition-all cursor-pointer border border-[var(--app-border)]"
            >
              <span className="material-symbols-outlined text-[18px]">content_copy</span>
              <span>{t.modelfileLab.copySource}</span>
            </button>
            <button
              onClick={handleBuild}
              disabled={isBuilding}
              className="flex items-center gap-2 px-6 py-2.5 rounded-full text-white text-[13px] font-bold transition-all active:scale-95 cursor-pointer shadow-md"
              style={{
                backgroundColor: 'var(--primary-accent)',
                boxShadow: '0 0 16px var(--primary-glow)'
              }}
            >
              <span
                className={`material-symbols-outlined text-[18px] ${isBuilding ? 'animate-spin' : ''}`}
              >
                {isBuilding ? 'refresh' : 'play_arrow'}
              </span>
              <span>{isBuilding ? t.modelfileLab.buildingBtn : t.modelfileLab.buildBtn}</span>
            </button>
          </div>
        </div>
      </section>

      {/* Main Two Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Form: Parameters & Prompts (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-5 bg-[var(--app-surface)] p-6 lg:p-7 rounded-3xl border border-[var(--app-border)] shadow-md">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--app-border)]">
            <span className="font-headline text-[16px] text-[var(--app-text)] font-bold">
              {t.modelfileLab.configTitle}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-[var(--app-text-muted)]">
                {t.modelfileLab.quickPresets}
              </span>
              {presets.map((p) => (
                <button
                  key={p.name}
                  onClick={() => applyPreset(p)}
                  className="px-2.5 py-1 rounded-full bg-[var(--app-surface-high)] hover:bg-[var(--app-surface-highest)] text-[var(--app-text-muted)] hover:text-[var(--app-text)] text-[11px] font-medium transition-colors cursor-pointer border border-[var(--app-border)]"
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* New Model Name */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-[var(--app-text-muted)]">
                {t.modelfileLab.targetName}
              </label>
              <input
                type="text"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                className="bg-[var(--app-surface-high)] rounded-2xl px-4 py-2.5 text-[var(--app-text)] font-code text-[13px] outline-none border border-[var(--app-border)] focus:border-[var(--primary-accent)]"
              />
            </div>

            {/* Base FROM Model */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-[var(--app-text-muted)]">
                {t.modelfileLab.baseFrom}
              </label>
              <select
                value={baseFrom}
                onChange={(e) => setBaseFrom(e.target.value)}
                className="bg-[var(--app-surface-high)] rounded-2xl px-4 py-2.5 text-[var(--app-text)] font-code text-[13px] outline-none border border-[var(--app-border)] focus:border-[var(--primary-accent)] cursor-pointer"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.modelfile.from}>
                    {m.modelfile.from} ({m.size})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Hyperparameters Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 bg-[var(--app-surface-high)] rounded-2xl flex flex-col gap-1 border border-[var(--app-border)]">
              <div className="flex justify-between text-[11px]">
                <span className="text-[var(--app-text-muted)]">Temperature</span>
                <span className="font-code font-bold" style={{ color: 'var(--primary-accent)' }}>
                  {temperature.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="cursor-pointer mt-1"
                style={{ accentColor: 'var(--primary-accent)' }}
              />
            </div>

            <div className="p-3.5 bg-[var(--app-surface-high)] rounded-2xl flex flex-col gap-1 border border-[var(--app-border)]">
              <div className="flex justify-between text-[11px]">
                <span className="text-[var(--app-text-muted)]">Top-P</span>
                <span className="font-code font-bold" style={{ color: 'var(--primary-accent)' }}>
                  {topP.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={topP}
                onChange={(e) => setTopP(parseFloat(e.target.value))}
                className="cursor-pointer mt-1"
                style={{ accentColor: 'var(--primary-accent)' }}
              />
            </div>

            <div className="p-3.5 bg-[var(--app-surface-high)] rounded-2xl flex flex-col gap-1 border border-[var(--app-border)]">
              <span className="text-[11px] text-[var(--app-text-muted)]">Num_ctx</span>
              <input
                type="number"
                value={numCtx}
                onChange={(e) => setNumCtx(parseInt(e.target.value) || 4096)}
                className="bg-[var(--app-surface)] px-3 py-1 rounded-xl font-code text-[13px] text-[var(--app-text)] outline-none mt-1 border border-[var(--app-border)]"
              />
            </div>
          </div>

          {/* Stop Tokens */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-[var(--app-text-muted)]">
              {t.modelfileLab.stopTokensLabel}
            </label>
            <input
              type="text"
              value={stopTokens}
              onChange={(e) => setStopTokens(e.target.value)}
              placeholder={
                language === 'zh'
                  ? '<｜end of sentence｜> 或 <|im_end|>'
                  : '<|end of sentence|> or <|im_end|>'
              }
              className="bg-[var(--app-surface-high)] rounded-2xl px-4 py-2.5 text-[var(--app-text)] font-code text-[13px] outline-none border border-[var(--app-border)] focus:border-[var(--primary-accent)]"
            />
          </div>

          {/* System Prompt Textarea */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-[var(--app-text-muted)]">
                {t.modelfileLab.systemPromptLabel}
              </label>
              <span className="text-[10px] text-[var(--app-text-muted)] font-code">
                {systemPrompt.length} {language === 'zh' ? '字符' : 'chars'}
              </span>
            </div>
            <textarea
              rows={6}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder={
                language === 'zh'
                  ? '为模型注入核心原则、输出规范或角色人设...'
                  : 'Add core principles, output rules, or a role persona...'
              }
              className="bg-[var(--app-surface-high)] rounded-2xl p-4 text-[var(--app-text)] font-code text-[13px] outline-none border border-[var(--app-border)] focus:border-[var(--primary-accent)] leading-relaxed resize-none"
            />
          </div>
        </div>

        {/* Right Preview: Live Code Canvas (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4 sticky top-20">
          <div className="bg-[#0c0a12] text-white rounded-3xl p-6 border border-[var(--app-border)] shadow-2xl flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <div className="flex items-center gap-2">
                <span
                  className="material-symbols-outlined text-[18px]"
                  style={{ color: 'var(--primary-accent)' }}
                >
                  terminal
                </span>
                <span className="font-code text-[13px] font-bold text-white">
                  {t.modelfileLab.livePreviewTitle}
                </span>
              </div>
              <span className="bg-[#1f1c2b] text-[#27c93f] font-code text-[10px] px-2.5 py-0.5 rounded-full border border-white/5">
                {t.modelfileLab.syntaxValid}
              </span>
            </div>

            <pre className="p-4 rounded-2xl bg-[#07060a] font-code text-[12px] text-[#cac3d7] leading-relaxed overflow-x-auto border border-white/5">
              <code>
                <span className="text-[#ffafd3] font-bold">FROM</span>{' '}
                <span className="text-white">{baseFrom}</span>
                {'\n'}
                <span className="text-[#ffafd3] font-bold">PARAMETER</span> temperature{' '}
                {temperature.toFixed(2)}
                {'\n'}
                <span className="text-[#ffafd3] font-bold">PARAMETER</span> top_p {topP.toFixed(2)}
                {'\n'}
                <span className="text-[#ffafd3] font-bold">PARAMETER</span> num_ctx {numCtx}
                {'\n'}
                {stopTokens && (
                  <>
                    <span className="text-[#ffafd3] font-bold">PARAMETER</span> stop "{stopTokens}"
                    {'\n'}
                  </>
                )}
                <span className="text-[#ffafd3] font-bold">SYSTEM</span> """{'\n'}
                <span style={{ color: 'var(--primary-tint)' }}>{systemPrompt}</span>
                {'\n'}
                """
              </code>
            </pre>

            {buildSuccess && (
              <div className="p-4 bg-[#27c93f]/15 border border-[#27c93f]/30 rounded-2xl flex items-center justify-between gap-3 animate-in fade-in duration-200">
                <div className="flex items-center gap-2 text-[#27c93f] text-[12px]">
                  <span className="material-symbols-outlined text-[18px]">check_circle</span>
                  <span className="font-semibold">{t.modelfileLab.successRegistered}</span>
                </div>
                <button
                  onClick={() => {
                    onLaunchTestChat(createdModel ?? base);
                  }}
                  className="px-4 py-1.5 rounded-full text-white text-[11px] font-bold transition-all cursor-pointer shadow-sm"
                  style={{ backgroundColor: 'var(--primary-accent)' }}
                >
                  {t.modelfileLab.chatNow}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
