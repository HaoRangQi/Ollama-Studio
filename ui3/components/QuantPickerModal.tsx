import { useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { Icon } from './Icon';

export interface QuantPickerModalProps {
  open: boolean;
  modelName: string;
  quants: string[];
  preferred: string;
  onClose: () => void;
  onConfirm: (quant: string) => void;
}

function describeQuant(quant: string, c: ReturnType<typeof useTheme>['c']): string {
  const normalized = quant.toUpperCase();
  if (normalized === 'Q4_K_M') return c.quant.descQ4;
  if (normalized === 'Q5_K_M') return c.quant.descQ5;
  if (normalized === 'Q8_0') return c.quant.descQ8;
  if (normalized === 'FP16' || normalized === 'F16') return c.quant.descFP16;
  return 'GGUF';
}

export function QuantPickerModal({
  open,
  modelName,
  quants,
  preferred,
  onClose,
  onConfirm
}: QuantPickerModalProps) {
  const { c } = useTheme();
  const [selected, setSelected] = useState('');

  useEffect(() => {
    if (!open) return;
    const preferredMatch = quants.find((quant) => quant.toUpperCase() === preferred.toUpperCase());
    setSelected(preferredMatch ?? quants[0] ?? '');
  }, [open, preferred, quants]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="overlay"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={c.quant.title(modelName)}>
        <div className="modal-head">
          <span className="eyebrow">{c.pull.quantPref}</span>
          <h3>{c.quant.title(modelName)}</h3>
          <p>{c.quant.desc}</p>
        </div>
        <div className="modal-body">
          {quants.map((quant) => {
            const active = quant === selected;
            const recommended = quant.toUpperCase() === 'Q4_K_M';
            return (
              <button
                key={quant}
                type="button"
                className={`quant-option ${active ? 'is-active' : ''}`}
                onClick={() => setSelected(quant)}
                aria-pressed={active}
              >
                <span className="radio" />
                <span className="quant-name">{quant}</span>
                <span className="quant-desc">{describeQuant(quant, c)}</span>
                {recommended && <span className="tag tag-apricot">{c.quant.recommended}</span>}
              </button>
            );
          })}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {c.quant.cancel}
          </button>
          <button
            type="button"
            className="btn btn-primary grow"
            disabled={!selected}
            onClick={() => {
              if (!selected) return;
              onConfirm(selected);
              onClose();
            }}
          >
            <Icon name="download" size={17} />
            {c.quant.startPull}
            {selected ? ` · ${selected}` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
