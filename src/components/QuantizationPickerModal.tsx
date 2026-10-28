import React, { useState } from 'react';
import { useAppTheme } from '../context/ThemeContext';

interface QuantOption {
  format: string;
  name: string;
  bits: string;
  sizeMultiplier: string;
  note: string;
  isRecommended?: boolean;
}

interface QuantizationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentQuant: string;
  onSelectQuant: (quant: string) => void;
}

export const QuantizationPickerModal: React.FC<QuantizationPickerModalProps> = ({
  isOpen,
  onClose,
  currentQuant,
  onSelectQuant
}) => {
  const { t, language } = useAppTheme();
  const [selected, setSelected] = useState(currentQuant);

  if (!isOpen) return null;

  const quantOptions: QuantOption[] = [
    {
      format: 'Q4_K_M',
      name: '4-bit Medium K-Quant',
      bits: '4.5 bpw',
      sizeMultiplier: '0.28x',
      note:
        language === 'zh'
          ? '体积与质量的常用平衡点，适合日常对话和代码生成'
          : 'A common size/quality trade-off for chat and code',
      isRecommended: true
    },
    {
      format: 'Q5_K_M',
      name: '5-bit Medium K-Quant',
      bits: '5.5 bpw',
      sizeMultiplier: '0.34x',
      note:
        language === 'zh'
          ? '精度更高，适合需要更稳定推理的任务'
          : 'Higher fidelity for tasks that need steadier reasoning'
    },
    {
      format: 'Q8_0',
      name: '8-bit Standard Quant',
      bits: '8.0 bpw',
      sizeMultiplier: '0.52x',
      note:
        language === 'zh'
          ? '接近原始精度，需要更多内存'
          : 'Near-original precision, at a higher memory cost'
    },
    {
      format: 'FP16',
      name: '16-bit Half Precision',
      bits: '16.0 bpw',
      sizeMultiplier: '1.0x',
      note:
        language === 'zh'
          ? '未量化浮点权重，占用最大'
          : 'Unquantized floating-point weights, largest footprint'
    }
  ];

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4 transition-all"
      onClick={onClose}
    >
      <div
        className="bg-[var(--app-surface-high)] border border-[var(--app-border)] text-[var(--app-text)] rounded-[2.5rem] p-6 lg:p-8 max-w-2xl w-full shadow-2xl flex flex-col gap-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white"
              style={{ backgroundColor: 'var(--primary-accent)' }}
            >
              <span className="material-symbols-outlined text-[20px]">tune</span>
            </div>
            <div>
              <h3 className="font-headline text-[18px] text-[var(--app-text)] font-bold">
                {language === 'zh' ? 'GGUF 量化格式选择' : 'GGUF quantization format'}
              </h3>
              <p className="text-[12px] text-[var(--app-text-muted)]">
                {language === 'zh'
                  ? '该选择用于 Hugging Face GGUF 拉取命令，不会修改现有模型'
                  : 'Used for Hugging Face GGUF pull commands; existing models are not modified'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={language === 'zh' ? '关闭' : 'Close'}
            className="w-8 h-8 rounded-full hover:bg-[var(--app-surface-highest)] flex items-center justify-center text-[var(--app-text-muted)] hover:text-[var(--app-text)] cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {quantOptions.map((opt) => {
            const isChosen = selected === opt.format;
            return (
              <div
                key={opt.format}
                onClick={() => setSelected(opt.format)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isChosen
                    ? 'border-[var(--primary-accent)] bg-[var(--app-surface)] shadow-md ring-1 ring-[var(--primary-accent)]'
                    : 'bg-[var(--app-surface)] border-[var(--app-border)] hover:bg-[var(--app-surface-highest)]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-5 h-5 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                      isChosen ? 'border-white bg-[var(--primary-accent)]' : 'border-[#948ea0]'
                    }`}
                  >
                    {isChosen && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-bold font-code text-[var(--app-text)]">
                        {opt.format}
                      </span>
                      <span className="text-[12px] text-[var(--app-text-muted)]">{opt.name}</span>
                      {opt.isRecommended && (
                        <span className="px-2 py-0.5 rounded-full bg-[#27c93f]/20 text-[#27c93f] text-[10px] font-bold">
                          {language === 'zh' ? '常用' : 'Common'}
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-[var(--app-text-muted)] mt-1">{opt.note}</p>
                  </div>
                </div>

                <div className="flex sm:flex-col items-end justify-between sm:justify-center gap-1 font-code text-[11px] text-[var(--app-text-muted)] pl-8 sm:pl-0">
                  <span className="font-semibold" style={{ color: 'var(--primary-accent)' }}>
                    {opt.bits}
                  </span>
                  <span>
                    {language === 'zh' ? '体积约' : 'size'} {opt.sizeMultiplier}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-full bg-[var(--app-surface-highest)] text-[var(--app-text)] text-[13px] font-medium hover:opacity-90 cursor-pointer"
          >
            {t.models.cancel}
          </button>
          <button
            type="button"
            onClick={() => {
              onSelectQuant(selected);
              onClose();
            }}
            className="px-6 py-2.5 rounded-full text-white text-[13px] font-semibold hover:shadow-lg cursor-pointer"
            style={{ backgroundColor: 'var(--primary-accent)' }}
          >
            {language === 'zh' ? '应用配置' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
};
