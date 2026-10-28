import React, { useEffect, useState } from 'react';
import { OllamaModel, ModelCategory } from '../types';
import { useAppTheme } from '../context/ThemeContext';
import { OLLAMA_BASE } from '../api/ollama';
import type { ExportResult } from '../api/export';
import {
  defaultSettings,
  loadModelSettings,
  saveModelSettings,
  type ModelSettings
} from '../lib/modelSettings';

interface ModelsScreenProps {
  models: OllamaModel[];
  selectedModel: OllamaModel | null;
  onSelectModel: (model: OllamaModel) => void;
  onToggleVram: (modelId: string) => Promise<void>;
  onLaunchInChat: (model: OllamaModel) => void;
  onOpenPullModal: () => void;
  onGoToModelfileLab: (model: OllamaModel) => void;
  onDeleteModel: (modelId: string) => Promise<void>;
  onCloneModel: (model: OllamaModel) => Promise<void>;
  onExportModel: (model: OllamaModel) => Promise<ExportResult>;
}

const FALLBACK_SETTINGS: ModelSettings = {
  temperature: 0.6,
  topP: 0.95,
  numCtx: 8192,
  repeatPenalty: 1.1,
  keepAlive: '5m'
};

export const ModelsScreen: React.FC<ModelsScreenProps> = ({
  models,
  selectedModel,
  onSelectModel,
  onToggleVram,
  onLaunchInChat,
  onOpenPullModal,
  onGoToModelfileLab,
  onDeleteModel,
  onCloneModel,
  onExportModel
}) => {
  const { t, language } = useAppTheme();
  const [activeCategory, setActiveCategory] = useState<ModelCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [layoutMode, setLayoutMode] = useState<'grid' | 'list'>('list');
  const model = selectedModel ?? models[0] ?? null;

  // Sampling values are persisted per model and used as chat defaults.
  const [settings, setSettings] = useState<ModelSettings>(() =>
    model ? loadModelSettings(model.fullTag, defaultSettings(model)) : FALLBACK_SETTINGS
  );
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [busyModelId, setBusyModelId] = useState<string | null>(null);
  const [exportingModelId, setExportingModelId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuDeleteConfirmId, setMenuDeleteConfirmId] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  useEffect(() => {
    if (!model) return;
    setSettings(loadModelSettings(model.fullTag, defaultSettings(model)));
    setShowDeleteConfirm(false);
  }, [model]);

  const updateSettings = (patch: Partial<ModelSettings>) => {
    if (!model) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    saveModelSettings(model.fullTag, next);
  };

  const handleResetParameters = () => {
    if (!model) return;
    const next = defaultSettings(model);
    setSettings(next);
    saveModelSettings(model.fullTag, next);
    showToast(t.models.resetRecommended);
  };

  const handleToggleVram = async (target: OllamaModel) => {
    setBusyModelId(target.id);
    try {
      await onToggleVram(target.id);
      showToast(
        target.status === 'running'
          ? language === 'zh'
            ? `已卸载 ${target.name}`
            : `Unloaded ${target.name}`
          : language === 'zh'
            ? `${target.name} 已常驻显存`
            : `${target.name} is now resident`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showToast(language === 'zh' ? `显存操作失败：${message}` : `VRAM action failed: ${message}`);
    } finally {
      setBusyModelId(null);
    }
  };

  const handleExportModel = async (target: OllamaModel) => {
    if (exportingModelId) return;
    setExportingModelId(target.id);
    try {
      const result = await onExportModel(target);
      const hasProjector = result.files.some((file) => file.kind === 'projector');
      showToast(
        language === 'zh'
          ? `已导出 ${result.files.length} 个文件到 ${result.directory}${hasProjector ? '（含 mmproj）' : ''}`
          : `Exported ${result.files.length} file(s) to ${result.directory}${hasProjector ? ' (incl. mmproj)' : ''}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showToast(language === 'zh' ? `导出失败：${message}` : `Export failed: ${message}`);
    } finally {
      setExportingModelId(null);
    }
  };

  const filteredModels = models.filter((m) => {
    const matchesCat = activeCategory === 'all' ? true : m.category === activeCategory;
    const matchesQuery =
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.tag.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.quantization.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesQuery;
  });

  const runningModels = models.filter((m) => m.status === 'running');
  const runningCount = runningModels.length;
  const topRunningModel = runningModels[0];
  const totalDiskGb = models.reduce((acc, m) => acc + m.sizeGb, 0).toFixed(1);
  const categoryCount = new Set(models.map((m) => m.category)).size;

  if (!model) {
    return (
      <div className="flex flex-col w-full p-6 lg:p-8 gap-6 animate-in fade-in duration-200">
        <section className="relative overflow-hidden rounded-[2.5rem] bg-[var(--app-surface-high)] p-8 shadow-xl border border-[var(--app-border)]">
          <div className="flex flex-col items-center text-center gap-4 py-10">
            <div
              className="w-16 h-16 rounded-3xl flex items-center justify-center border border-[var(--app-border)]"
              style={{ backgroundColor: 'var(--app-surface)', color: 'var(--primary-accent)' }}
            >
              <span className="material-symbols-outlined text-[34px]">inventory_2</span>
            </div>
            <h1 className="font-headline text-[24px] text-[var(--app-text)] font-bold">
              {language === 'zh' ? '还没有本地模型' : 'No local models yet'}
            </h1>
            <p className="text-[13px] text-[var(--app-text-muted)] max-w-md leading-relaxed">
              {language === 'zh'
                ? 'Ollama 已连接，但模型列表为空。先拉取或导入一个模型，再回来管理参数。'
                : 'Ollama is connected but the model list is empty. Pull or import a model before managing parameters.'}
            </p>
            <button
              onClick={onOpenPullModal}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-white text-[13px] font-bold hover:shadow-lg transition-all cursor-pointer active:scale-95"
              style={{ backgroundColor: 'var(--primary-accent)' }}
            >
              <span className="material-symbols-outlined text-[20px]">add_task</span>
              <span>{t.models.pullBtn}</span>
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full p-6 lg:p-8 gap-6 animate-in fade-in duration-200">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className="fixed top-20 right-8 z-50 text-white px-5 py-2.5 rounded-full shadow-2xl flex items-center gap-2 text-[13px] font-medium border border-white/20 animate-in slide-in-from-top-4 duration-150"
          style={{ backgroundColor: 'var(--primary-accent)' }}
        >
          <span className="material-symbols-outlined text-[18px]">info</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. 顶部灵动概览 Banner */}
      <section className="relative overflow-hidden rounded-[2.5rem] bg-[var(--app-surface-high)] p-6 lg:p-8 shadow-xl border border-[var(--app-border)]">
        <div
          className="absolute -top-24 -right-16 w-96 h-96 rounded-full blur-3xl pointer-events-none opacity-20"
          style={{ backgroundColor: 'var(--primary-accent)' }}
        />
        <div className="absolute -bottom-20 left-1/3 w-80 h-80 rounded-full bg-[#ba4385]/15 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex flex-col gap-2 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--app-surface)] text-[var(--app-text)] w-fit border border-[var(--app-border)]">
              <span
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ backgroundColor: 'var(--primary-accent)' }}
              />
              <span className="text-[10px] uppercase tracking-wider font-bold">
                {t.models.engineTag}
              </span>
            </div>
            <h1 className="font-headline text-[28px] lg:text-[34px] text-[var(--app-text)] font-bold tracking-tight">
              {t.models.title}
            </h1>
            <p className="text-[14px] text-[var(--app-text-muted)] leading-relaxed">
              {t.models.subtitle}
            </p>
          </div>

          {/* 聚合指标胶囊阵列 */}
          <div className="grid grid-cols-3 gap-3 bg-[var(--app-surface)]/95 backdrop-blur-md p-4 rounded-[2rem] border border-[var(--app-border)] shadow-inner">
            <div className="flex flex-col items-center justify-center px-4 py-2 text-center">
              <span className="text-[11px] text-[var(--app-text-muted)] font-medium">
                {t.models.diskUsed}
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span
                  className="font-headline text-[24px] font-bold"
                  style={{ color: 'var(--primary-accent)' }}
                >
                  {totalDiskGb}
                </span>
                <span className="text-[11px] text-[var(--app-text-muted)]">GB</span>
              </div>
              <div className="w-full bg-[var(--app-surface-highest)] h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: '58%', backgroundColor: 'var(--primary-accent)' }}
                />
              </div>
            </div>

            <div className="flex flex-col items-center justify-center px-4 py-2 text-center border-x border-[var(--app-border)]">
              <span className="text-[11px] text-[var(--app-text-muted)] font-medium">
                {t.models.modelsInstalled}
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="font-headline text-[24px] text-[var(--app-text)] font-bold">
                  {models.length}
                </span>
                <span className="text-[11px] text-[var(--app-text-muted)]">
                  {language === 'zh' ? '个' : 'items'}
                </span>
              </div>
              <span className="text-[10px] text-[#ffafd3] font-semibold mt-2">
                {language === 'zh' ? `${categoryCount} 类别覆盖` : `${categoryCount} categories`}
              </span>
            </div>

            <div className="flex flex-col items-center justify-center px-4 py-2 text-center">
              <span className="text-[11px] text-[var(--app-text-muted)] font-medium">
                {t.models.residentVram}
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="font-headline text-[24px] text-[#27c93f] font-bold">
                  {runningCount}
                </span>
                <span className="text-[11px] text-[var(--app-text-muted)]">{t.models.running}</span>
              </div>
              <span className="font-code text-[10px] text-[#27c93f] mt-2 font-semibold truncate max-w-[90px]">
                {topRunningModel ? topRunningModel.name : t.models.allSleep}
              </span>
            </div>
          </div>

          {/* 操作组药丸 */}
          <div className="flex flex-wrap lg:flex-col gap-3 justify-end">
            <button
              onClick={onOpenPullModal}
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full text-white text-[13px] font-bold hover:shadow-lg transition-all cursor-pointer active:scale-95"
              style={{
                backgroundColor: 'var(--primary-accent)',
                boxShadow: '0 0 20px var(--primary-glow)'
              }}
            >
              <span className="material-symbols-outlined text-[20px]">add_task</span>
              <span>{t.models.pullBtn}</span>
            </button>
            <button
              disabled
              title={
                language === 'zh'
                  ? 'Ollama 自动管理 blob 缓存，网页端不提供清理 API'
                  : 'Ollama manages blob caches automatically; no cleanup API is exposed'
              }
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[var(--app-surface-highest)] text-[var(--app-text-muted)] text-[13px] font-medium transition-colors border border-[var(--app-border)] cursor-not-allowed opacity-70"
            >
              <span className="material-symbols-outlined text-[18px] text-[#ffafd3]">
                cleaning_services
              </span>
              <span>{t.models.deepCleanBtn}</span>
            </button>
          </div>
        </div>
      </section>

      {/* 2. 动态过滤与标签轨 */}
      <section className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* M3 Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          <button
            onClick={() => setActiveCategory('all')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium transition-all cursor-pointer ${
              activeCategory === 'all'
                ? 'text-white font-semibold shadow-md'
                : 'bg-[var(--app-surface-high)] text-[var(--app-text-muted)] hover:text-[var(--app-text)]'
            }`}
            style={activeCategory === 'all' ? { backgroundColor: 'var(--primary-accent)' } : {}}
          >
            <span className="material-symbols-outlined text-[16px] shrink-0">apps</span>
            <span className="flex flex-col items-start leading-tight">
              <span>{t.models.all}</span>
              <span className="text-[9px] font-code opacity-75">{models.length}</span>
            </span>
          </button>
          {(
            [
              { key: 'llm', icon: 'forum', label: t.models.catLlm, sub: t.models.catLlmEn },
              {
                key: 'vision',
                icon: 'visibility',
                label: t.models.catVision,
                sub: t.models.catVisionEn
              },
              { key: 'code', icon: 'code', label: t.models.catCode, sub: t.models.catCodeEn },
              {
                key: 'embedding',
                icon: 'hub',
                label: t.models.catEmbedding,
                sub: t.models.catEmbeddingEn
              }
            ] as const
          ).map(({ key, icon, label, sub }) => (
            <button
              key={key}
              onClick={() => setActiveCategory(key)}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[13px] font-medium transition-all cursor-pointer shrink-0 ${
                activeCategory === key
                  ? 'text-white font-semibold shadow-md'
                  : 'bg-[var(--app-surface-high)] text-[var(--app-text-muted)] hover:text-[var(--app-text)]'
              }`}
              style={activeCategory === key ? { backgroundColor: 'var(--primary-accent)' } : {}}
            >
              <span className="material-symbols-outlined text-[16px] shrink-0">{icon}</span>
              <span className="flex flex-col items-start leading-tight whitespace-nowrap">
                <span>{label}</span>
                <span className="text-[9px] font-code opacity-75">{sub}</span>
              </span>
            </button>
          ))}
        </div>

        {/* 搜索与布局切换 */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 md:w-64">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.models.searchPlaceholder}
              className="w-full bg-[var(--app-surface-high)] text-[var(--app-text)] text-[13px] pl-10 pr-4 py-2 rounded-full outline-none focus-visible:outline-none focus-ring-none focus:bg-[var(--app-surface-highest)] focus:border-[var(--primary-accent)] border border-[var(--app-border)] transition-colors"
            />
            <span
              className="material-symbols-outlined absolute left-3 top-2.5 text-[18px]"
              style={{ color: 'var(--primary-accent)' }}
            >
              search
            </span>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
              >
                <span className="material-symbols-outlined text-[16px]">cancel</span>
              </button>
            )}
          </div>
          <div className="flex items-center bg-[var(--app-surface-high)] p-1 rounded-full border border-[var(--app-border)]">
            <button
              onClick={() => setLayoutMode('grid')}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                layoutMode === 'grid'
                  ? 'text-white'
                  : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'
              }`}
              style={layoutMode === 'grid' ? { backgroundColor: 'var(--primary-accent)' } : {}}
              title={language === 'zh' ? '网格视图' : 'Grid view'}
            >
              <span className="material-symbols-outlined text-[18px]">grid_view</span>
            </button>
            <button
              onClick={() => setLayoutMode('list')}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                layoutMode === 'list'
                  ? 'text-white'
                  : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'
              }`}
              style={layoutMode === 'list' ? { backgroundColor: 'var(--primary-accent)' } : {}}
              title={language === 'zh' ? '列表视图' : 'List view'}
            >
              <span className="material-symbols-outlined text-[18px]">view_agenda</span>
            </button>
          </div>
        </div>
      </section>

      {/* 3. 主展示区：双列架构 (左：模型卡片流，右：M3 详细配置抽屉) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* 左侧：模型卡片流 (7 列) */}
        <div
          className={`xl:col-span-7 ${
            layoutMode === 'grid'
              ? 'grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch'
              : 'flex flex-col gap-4'
          }`}
        >
          {filteredModels.map((model) => {
            const isSelected = model.id === selectedModel?.id;
            const isRunning = model.status === 'running';

            return (
              <div
                key={model.id}
                onClick={() => onSelectModel(model)}
                className={`group relative bg-[var(--app-surface-high)] rounded-[2rem] p-6 transition-all duration-200 cursor-pointer border flex flex-col ${
                  layoutMode === 'grid' ? 'h-full' : ''
                } ${
                  isSelected
                    ? 'shadow-xl'
                    : 'border-[var(--app-border)] hover:border-white/20 shadow-md'
                }`}
                style={
                  isSelected
                    ? {
                        backgroundColor:
                          'color-mix(in srgb, var(--primary-accent) 13%, var(--app-surface-high))',
                        borderColor: 'var(--primary-accent)',
                        boxShadow:
                          '0 0 0 1px var(--primary-glow), 0 12px 32px -14px var(--primary-glow)'
                      }
                    : undefined
                }
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div
                      className={`w-14 h-14 rounded-2xl ${model.iconBg} ${model.iconColor} flex items-center justify-center shadow-sm shrink-0 border border-[var(--app-border)]`}
                    >
                      {model.icon === '🦙' ? (
                        <span className="text-[26px]">🦙</span>
                      ) : (
                        <span className="material-symbols-outlined text-[30px]">{model.icon}</span>
                      )}
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-headline text-[18px] text-[var(--app-text)] font-bold tracking-tight">
                          {model.name}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full bg-[var(--app-surface-highest)] font-code text-[11px] text-[var(--app-text)]">
                          {model.tag}
                        </span>
                        {/* 状态指示器 */}
                        {isRunning ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#27c93f]/15 text-[#27c93f] border border-[#27c93f]/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#27c93f] animate-ping" />
                            <span className="text-[10px] font-bold">{t.models.activeVram}</span>
                          </div>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full bg-[var(--app-surface)] text-[10px] text-[var(--app-text-muted)] border border-[var(--app-border)]">
                            {t.models.idle}
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-[var(--app-text-muted)] mt-1.5 line-clamp-1 leading-relaxed">
                        {language === 'zh'
                          ? model.description
                          : (model.descriptionEn ?? model.description)}
                      </p>
                    </div>
                  </div>

                  {/* 更多动作 */}
                  <div className="relative shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuDeleteConfirmId(null);
                        setOpenMenuId(openMenuId === model.id ? null : model.id);
                      }}
                      aria-label={t.models.moreActions}
                      aria-expanded={openMenuId === model.id}
                      className="w-9 h-9 rounded-full hover:bg-[var(--app-surface-highest)] flex items-center justify-center text-[var(--app-text-muted)] hover:text-[var(--app-text)] transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[20px]">more_vert</span>
                    </button>
                    {openMenuId === model.id && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(null);
                            setMenuDeleteConfirmId(null);
                          }}
                        />
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-0 top-11 z-20 w-52 rounded-2xl bg-[var(--app-surface-highest)] border border-[var(--app-border)] shadow-2xl p-1.5 flex flex-col gap-0.5"
                        >
                          {menuDeleteConfirmId === model.id ? (
                            <div className="p-2 flex flex-col gap-2">
                              <span className="text-[12px] text-[var(--app-danger-text)] font-medium">
                                {t.models.menuDeleteConfirm}
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setMenuDeleteConfirmId(null);
                                  }}
                                  className="flex-1 px-3 py-1.5 rounded-full bg-[var(--app-surface)] text-[var(--app-text-muted)] text-[11px] cursor-pointer"
                                >
                                  {t.models.cancel}
                                </button>
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    setMenuDeleteConfirmId(null);
                                    setOpenMenuId(null);
                                    try {
                                      await onDeleteModel(model.id);
                                      showToast(
                                        language === 'zh'
                                          ? `已成功移除 ${model.name}`
                                          : `Removed ${model.name}`
                                      );
                                    } catch (error) {
                                      const message =
                                        error instanceof Error ? error.message : String(error);
                                      showToast(
                                        language === 'zh'
                                          ? `删除失败：${message}`
                                          : `Delete failed: ${message}`
                                      );
                                    }
                                  }}
                                  className="flex-1 px-3 py-1.5 rounded-full bg-[var(--app-danger-solid)] text-[var(--app-danger-on-solid)] font-bold text-[11px] cursor-pointer"
                                >
                                  {t.models.confirmDelete}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <button
                                disabled={busyModelId === model.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenuId(null);
                                  void handleToggleVram(model);
                                }}
                                className="flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] text-[var(--app-text)] hover:bg-[var(--app-surface)] disabled:opacity-50 transition-colors cursor-pointer text-left whitespace-nowrap"
                              >
                                <span className="material-symbols-outlined text-[18px]">
                                  {isRunning ? 'eject' : 'play_circle'}
                                </span>
                                {isRunning ? t.models.releaseVram : t.models.loadToVram}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenuId(null);
                                  onLaunchInChat(model);
                                }}
                                className="flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] text-[var(--app-text)] hover:bg-[var(--app-surface)] transition-colors cursor-pointer text-left whitespace-nowrap"
                              >
                                <span className="material-symbols-outlined text-[18px]">
                                  terminal
                                </span>
                                {t.models.inferNow}
                              </button>
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  setOpenMenuId(null);
                                  try {
                                    await onCloneModel(model);
                                    showToast(
                                      language === 'zh'
                                        ? `已克隆 ${model.name}`
                                        : `Cloned ${model.name}`
                                    );
                                  } catch (error) {
                                    const message =
                                      error instanceof Error ? error.message : String(error);
                                    showToast(
                                      language === 'zh'
                                        ? `克隆失败：${message}`
                                        : `Clone failed: ${message}`
                                    );
                                  }
                                }}
                                className="flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] text-[var(--app-text)] hover:bg-[var(--app-surface)] transition-colors cursor-pointer text-left whitespace-nowrap"
                              >
                                <span className="material-symbols-outlined text-[18px]">
                                  content_copy
                                </span>
                                {t.models.menuClone}
                              </button>
                              <button
                                disabled={exportingModelId === model.id}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  setOpenMenuId(null);
                                  await handleExportModel(model);
                                }}
                                className="flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] text-[var(--app-text)] hover:bg-[var(--app-surface)] disabled:opacity-50 transition-colors cursor-pointer text-left whitespace-nowrap"
                              >
                                <span
                                  className={`material-symbols-outlined text-[18px] ${
                                    exportingModelId === model.id ? 'animate-spin' : ''
                                  }`}
                                >
                                  {exportingModelId === model.id
                                    ? 'progress_activity'
                                    : 'ios_share'}
                                </span>
                                {language === 'zh' ? '导出 GGUF' : 'Export GGUF'}
                              </button>
                              <div className="h-px bg-[var(--app-border)] my-1" />
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMenuDeleteConfirmId(model.id);
                                }}
                                className="flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] text-[var(--app-danger-text)] hover:bg-[var(--app-danger-bg)] transition-colors cursor-pointer text-left whitespace-nowrap"
                              >
                                <span className="material-symbols-outlined text-[18px]">
                                  delete_forever
                                </span>
                                {t.models.menuDelete}
                              </button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* 硬件规格与量化胶囊条 */}
                <div className="mt-4 pt-2 flex flex-wrap items-center gap-2">
                  <div className="px-3 py-1 rounded-full bg-[var(--app-surface)] font-code text-[11px] text-[var(--app-text-muted)] flex items-center gap-1 border border-[var(--app-border)]">
                    <span className="text-[var(--app-text-muted)]">{t.models.quant}</span>
                    <span className="text-[var(--app-text)] font-semibold">
                      {model.quantization}
                    </span>
                  </div>
                  <div className="px-3 py-1 rounded-full bg-[var(--app-surface)] font-code text-[11px] text-[var(--app-text-muted)] flex items-center gap-1 border border-[var(--app-border)]">
                    <span className="text-[var(--app-text-muted)]">{t.models.weightSize}</span>
                    <span className="text-[var(--app-text)] font-semibold">{model.size}</span>
                  </div>
                  <div className="px-3 py-1 rounded-full bg-[var(--app-surface)] font-code text-[11px] text-[var(--app-text-muted)] flex items-center gap-1 border border-[var(--app-border)]">
                    <span className="text-[var(--app-text-muted)]">{t.models.maxContext}</span>
                    <span className="text-[var(--app-text)] font-semibold">{model.context}</span>
                  </div>
                  {model.speed && (
                    <div className="px-3 py-1 rounded-full bg-[var(--app-surface)] font-code text-[11px] flex items-center gap-1 border border-[var(--app-border)]">
                      <span
                        className="material-symbols-outlined text-[14px]"
                        style={{ color: 'var(--primary-accent)' }}
                      >
                        speed
                      </span>
                      <span style={{ color: 'var(--primary-accent)' }}>{model.speed}</span>
                    </div>
                  )}
                </div>

                {/* 弹性占位：保证动作条与上方内容至少留出间距（网格模式下拉到底部） */}
                <div className="flex-1 min-h-4" />

                {/* 卡片底部动作条 */}
                <div className="pt-3 flex items-center justify-between bg-[var(--app-surface)] px-4 py-2.5 rounded-2xl border border-[var(--app-border)]">
                  <div className="flex items-center gap-2 text-[var(--app-text-muted)] text-[11px] min-w-0">
                    <span className="material-symbols-outlined text-[16px] text-[#ffafd3] shrink-0">
                      schedule
                    </span>
                    <span className="truncate">
                      {language === 'zh'
                        ? (model.lastUsed ?? t.models.allSleep)
                        : (model.lastUsedEn ?? model.lastUsed ?? t.models.allSleep)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isRunning ? (
                      <>
                        <button
                          disabled={busyModelId === model.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleToggleVram(model);
                          }}
                          className="px-4 py-1.5 rounded-full bg-[#ba4385]/20 text-[#ffafd3] hover:bg-[#ba4385]/40 disabled:opacity-50 text-[11px] font-bold transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                        >
                          <span className="material-symbols-outlined text-[16px]">eject</span>
                          <span>{t.models.releaseVram}</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onLaunchInChat(model);
                          }}
                          className="px-4 py-1.5 rounded-full text-white text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer shadow-md whitespace-nowrap shrink-0"
                          style={{ backgroundColor: 'var(--primary-accent)' }}
                        >
                          <span className="material-symbols-outlined text-[16px]">terminal</span>
                          <span>{t.models.inferNow}</span>
                        </button>
                      </>
                    ) : (
                      <button
                        disabled={busyModelId === model.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleToggleVram(model);
                        }}
                        className="px-4 py-1.5 rounded-full bg-[var(--app-surface-highest)] text-[var(--app-text)] hover:opacity-90 disabled:opacity-50 text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">play_circle</span>
                        <span>{t.models.loadToVram}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 右侧：Material 3 抽屉面板 (5 列) */}
        <div className="xl:col-span-5 sticky top-20 flex flex-col gap-4 bg-[var(--app-surface-high)]/95 backdrop-blur-xl p-6 lg:p-7 rounded-[2.5rem] shadow-2xl border border-[var(--app-border)]">
          {/* 抽屉头部信息 */}
          <div className="flex items-center justify-between pb-2 border-b border-[var(--app-border)]">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-white"
                style={{ backgroundColor: 'var(--primary-accent)' }}
              >
                <span className="material-symbols-outlined text-[20px]">tune</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-headline text-[16px] text-[var(--app-text)] font-bold">
                  {t.models.drawerTitle}
                </span>
                <span
                  className="inline-flex w-fit max-w-full mt-1 px-2.5 py-1 rounded-lg font-code text-[11px] font-semibold break-all border"
                  style={{
                    color: 'var(--primary-accent)',
                    backgroundColor: 'color-mix(in srgb, var(--primary-accent) 15%, transparent)',
                    borderColor: 'color-mix(in srgb, var(--primary-accent) 45%, transparent)'
                  }}
                >
                  {model.fullTag}
                </span>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full bg-[#27c93f]/15 text-[#27c93f] text-[11px] font-bold flex items-center gap-1 border border-[#27c93f]/30">
              <span className="w-1.5 h-1.5 rounded-full bg-[#27c93f]" />
              {OLLAMA_BASE}
            </span>
          </div>

          {/* 显存与计算资源分配状态条 */}
          <div className="bg-[var(--app-surface)] p-4 rounded-2xl flex flex-col gap-1.5 border border-[var(--app-border)]">
            <div className="flex justify-between items-center text-[12px]">
              <span className="text-[var(--app-text-muted)]">{t.models.gpuOffload}</span>
              <span className="font-code font-bold" style={{ color: 'var(--primary-accent)' }}>
                {model.gpuLayers ?? '—'}
              </span>
            </div>
            <div className="w-full bg-[var(--app-surface-highest)] h-2 rounded-full overflow-hidden p-0.5">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: model.status === 'running' ? '100%' : '0%',
                  backgroundColor: 'var(--primary-accent)'
                }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-[var(--app-text-muted)] font-code pt-1">
              <span>KV Cache: {model.kvCache ?? '—'}</span>
              <span>VRAM: {model.vramUsage ?? '—'}</span>
            </div>
          </div>

          {/* 参数调节滑块区 (M3 Sliders) */}
          <div className="flex flex-col gap-4 mt-1">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold text-[var(--app-text)]">
                {t.models.samplingTitle}
              </span>
              <button
                onClick={handleResetParameters}
                className="text-[11px] hover:underline cursor-pointer"
                style={{ color: 'var(--primary-accent)' }}
              >
                {t.models.resetRecommended}
              </button>
            </div>
            <p className="text-[10px] text-[var(--app-text-muted)] -mt-2 leading-relaxed">
              {t.models.samplingNote}
            </p>

            {/* Temperature 滑块 */}
            <div className="flex flex-col gap-1.5 bg-[var(--app-surface)] p-4 rounded-2xl border border-[var(--app-border)]">
              <div className="flex justify-between items-center text-[12px]">
                <span className="text-[var(--app-text)] font-medium flex items-center gap-1">
                  {t.models.temp}
                  <span
                    className="material-symbols-outlined text-[14px] text-[var(--app-text-muted)] cursor-help"
                    title={t.models.tempInfo}
                  >
                    info
                  </span>
                </span>
                <span
                  className="font-code font-bold px-2.5 py-0.5 rounded-full bg-[var(--app-surface-highest)]"
                  style={{ color: 'var(--primary-accent)' }}
                >
                  {settings.temperature.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={settings.temperature}
                onChange={(e) => updateSettings({ temperature: parseFloat(e.target.value) })}
                className="w-full rounded-lg h-2 cursor-pointer mt-1"
                style={{ accentColor: 'var(--primary-accent)' }}
              />
              <div className="flex justify-between text-[10px] text-[var(--app-text-muted)]">
                <span>{t.models.tempDeterministic}</span>
                <span>{t.models.tempBalanced}</span>
                <span>{t.models.tempCreative}</span>
              </div>
            </div>

            {/* Top-P 滑块 */}
            <div className="flex flex-col gap-1.5 bg-[var(--app-surface)] p-4 rounded-2xl border border-[var(--app-border)]">
              <div className="flex justify-between items-center text-[12px]">
                <span className="text-[var(--app-text)] font-medium">{t.models.topP}</span>
                <span
                  className="font-code font-bold px-2.5 py-0.5 rounded-full bg-[var(--app-surface-highest)]"
                  style={{ color: 'var(--primary-accent)' }}
                >
                  {settings.topP.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={settings.topP}
                onChange={(e) => updateSettings({ topP: parseFloat(e.target.value) })}
                className="w-full rounded-lg h-2 cursor-pointer mt-1"
                style={{ accentColor: 'var(--primary-accent)' }}
              />
            </div>

            {/* 上下文窗口与重复惩罚 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1 bg-[var(--app-surface)] p-3.5 rounded-2xl border border-[var(--app-border)]">
                <span className="text-[11px] text-[var(--app-text)] font-medium">
                  {t.models.numCtx}
                </span>
                <input
                  type="number"
                  value={settings.numCtx}
                  onChange={(e) => updateSettings({ numCtx: parseInt(e.target.value) || 2048 })}
                  className="w-full bg-[var(--app-surface-high)] text-[var(--app-text)] font-code text-[13px] px-3 py-1.5 rounded-xl outline-none border border-[var(--app-border)] mt-1"
                />
              </div>
              <div className="flex flex-col gap-1 bg-[var(--app-surface)] p-3.5 rounded-2xl border border-[var(--app-border)]">
                <span className="text-[11px] text-[var(--app-text)] font-medium">
                  {t.models.repeatPenalty}
                </span>
                <input
                  type="number"
                  step="0.05"
                  value={settings.repeatPenalty}
                  onChange={(e) =>
                    updateSettings({ repeatPenalty: parseFloat(e.target.value) || 1.0 })
                  }
                  className="w-full bg-[var(--app-surface-high)] text-[var(--app-text)] font-code text-[13px] px-3 py-1.5 rounded-xl outline-none border border-[var(--app-border)] mt-1"
                />
              </div>
            </div>
          </div>

          {/* Modelfile 快速预览卡片 */}
          <div className="flex flex-col gap-2 mt-1">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold text-[var(--app-text)]">
                {t.models.modelfilePreview}
              </span>
              <button
                onClick={() => onGoToModelfileLab(model)}
                className="text-[11px] hover:underline flex items-center gap-1 cursor-pointer"
                style={{ color: 'var(--primary-accent)' }}
              >
                <span className="material-symbols-outlined text-[14px]">edit_note</span>
                <span>{t.models.editInstructionLayer}</span>
              </button>
            </div>
            <div className="bg-[var(--app-sidebar)] p-3.5 rounded-2xl font-code text-[11px] text-[var(--app-text-muted)] overflow-x-auto leading-relaxed border border-[var(--app-border)]">
              <span className="text-[#ffafd3] font-bold">FROM</span>{' '}
              <span className="text-[var(--app-text)]">{model.modelfile.from}</span>
              <br />
              {model.modelfile.stop && (
                <>
                  <span className="text-[#ffafd3] font-bold">PARAMETER</span> stop "
                  {model.modelfile.stop}"<br />
                </>
              )}
              <span className="text-[#ffafd3] font-bold">PARAMETER</span> temperature{' '}
              {settings.temperature.toFixed(2)}
              <br />
              <span className="text-[#ffafd3] font-bold">SYSTEM</span> """{model.modelfile.system}
              """
            </div>
          </div>

          {/* 底层动作与危险区按钮组 */}
          <div className="pt-2 flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  try {
                    await onCloneModel(model);
                    showToast(language === 'zh' ? `已克隆 ${model.name}` : `Cloned ${model.name}`);
                  } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    showToast(
                      language === 'zh' ? `克隆失败：${message}` : `Clone failed: ${message}`
                    );
                  }
                }}
                className="flex-1 py-3 px-4 rounded-full bg-[var(--app-surface-highest)] hover:opacity-90 text-[var(--app-text)] text-[13px] font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer border border-[var(--app-border)]"
              >
                <span className="material-symbols-outlined text-[18px]">content_copy</span>
                <span>{t.models.cloneVersion}</span>
              </button>
              <button
                disabled={exportingModelId === model.id}
                onClick={() => void handleExportModel(model)}
                className="py-3 px-4 rounded-full bg-[var(--app-surface-highest)] text-[var(--app-text)] hover:opacity-90 text-[13px] font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer border border-[var(--app-border)] disabled:opacity-50 disabled:cursor-wait"
                title={t.models.exportGguf}
                aria-label={t.models.exportGguf}
              >
                <span
                  className={`material-symbols-outlined text-[18px] ${
                    exportingModelId === model.id ? 'animate-spin' : ''
                  }`}
                >
                  {exportingModelId === model.id ? 'progress_activity' : 'ios_share'}
                </span>
                <span>{language === 'zh' ? '导出 GGUF' : 'Export GGUF'}</span>
              </button>
            </div>

            {/* 危险区：彻底删除 */}
            {showDeleteConfirm ? (
              <div className="p-3 bg-[var(--app-danger-bg)] border border-[var(--app-danger-border)] rounded-2xl flex items-center justify-between gap-2">
                <span className="text-[12px] text-[var(--app-danger-text)] font-medium">
                  {t.models.deleteConfirmTitle}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-3 py-1 rounded-full bg-[var(--app-surface)] text-[var(--app-text-muted)] text-[11px] cursor-pointer"
                  >
                    {t.models.cancel}
                  </button>
                  <button
                    onClick={async () => {
                      setShowDeleteConfirm(false);
                      try {
                        await onDeleteModel(model.id);
                        showToast(
                          language === 'zh' ? `已成功移除 ${model.name}` : `Removed ${model.name}`
                        );
                      } catch (error) {
                        const message = error instanceof Error ? error.message : String(error);
                        showToast(
                          language === 'zh' ? `删除失败：${message}` : `Delete failed: ${message}`
                        );
                      }
                    }}
                    className="px-3 py-1 rounded-full bg-[var(--app-danger-solid)] text-[var(--app-danger-on-solid)] font-bold text-[11px] cursor-pointer"
                  >
                    {t.models.confirmDelete}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full py-2.5 px-4 rounded-full bg-[var(--app-danger-bg)] hover:bg-[var(--app-danger-bg-hover)] text-[var(--app-danger-text)] text-[13px] font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer border border-[var(--app-danger-border)]"
              >
                <span className="material-symbols-outlined text-[18px]">delete_forever</span>
                <span>
                  {t.models.deleteBtn} ({model.size})
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
