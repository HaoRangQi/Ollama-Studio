import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import type { OllamaModel } from '../lib/legacy';
import type { Screen } from '../navigation';
import { Icon } from './Icon';

interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  icon: string;
  onRun: () => void;
}

interface PaletteSection {
  key: string;
  label: string;
  items: PaletteItem[];
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  models: OllamaModel[];
  selectedTag: string;
  onSelectModel: (model: OllamaModel) => void;
  onNavigate: (screen: Screen) => void;
  onQuickPull: (name: string) => void;
}

function modelIcon(model: OllamaModel): string {
  if (model.category === 'code') return 'code';
  if (model.category === 'vision') return 'visibility';
  if (model.category === 'embedding') return 'hub';
  return 'deployed_code';
}

export function CommandPalette({
  open,
  onClose,
  models,
  selectedTag,
  onSelectModel,
  onNavigate,
  onQuickPull
}: CommandPaletteProps) {
  const { c, toggleTheme, toggleLanguage } = useTheme();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(timer);
  }, [open]);

  const sections = useMemo<PaletteSection[]>(() => {
    const keyword = query.trim().toLowerCase();
    const matches = models
      .filter(
        (model) =>
          !keyword ||
          model.fullTag.toLowerCase().includes(keyword) ||
          model.name.toLowerCase().includes(keyword) ||
          model.categoryLabel.toLowerCase().includes(keyword)
      )
      .slice(0, 6);

    const modelItems: PaletteItem[] = matches.map((model) => ({
      id: `model:${model.fullTag}`,
      label: model.fullTag,
      hint:
        selectedTag === model.fullTag
          ? `${c.command.hintLoaded(model.size)}`
          : model.status === 'running'
            ? c.command.hintLoaded(model.size)
            : c.command.hintIdle(model.size),
      icon: modelIcon(model),
      onRun: () => onSelectModel(model)
    }));

    const pullItems: PaletteItem[] = keyword
      ? [
          {
            id: 'quick-pull',
            label: c.command.quickPull(query.trim()),
            hint: 'ollama pull',
            icon: 'cloud_download',
            onRun: () => onQuickPull(query.trim())
          }
        ]
      : [];

    const actions: Array<{ label: string; icon: string; run: () => void }> = [
      { label: c.command.openModels, icon: 'deployed_code', run: () => onNavigate('models') },
      { label: c.command.openPull, icon: 'download', run: () => onNavigate('pull') },
      { label: c.command.openLab, icon: 'code', run: () => onNavigate('modelfile') },
      {
        label: c.command.openTelemetry,
        icon: 'monitoring',
        run: () => onNavigate('telemetry')
      },
      { label: c.command.toggleTheme, icon: 'palette', run: toggleTheme },
      { label: c.command.toggleLanguage, icon: 'translate', run: toggleLanguage }
    ];

    const actionItems: PaletteItem[] = actions
      .filter((action) => !keyword || action.label.toLowerCase().includes(keyword))
      .map((action) => ({
        id: `action:${action.label}`,
        label: action.label,
        icon: action.icon,
        onRun: action.run
      }));

    return [
      { key: 'models', label: c.command.groupModels, items: modelItems },
      { key: 'pull', label: c.command.groupPull, items: pullItems },
      { key: 'actions', label: c.command.groupActions, items: actionItems }
    ].filter((section) => section.items.length > 0);
  }, [
    c,
    models,
    onNavigate,
    onQuickPull,
    onSelectModel,
    query,
    selectedTag,
    toggleLanguage,
    toggleTheme
  ]);

  const flat = useMemo(() => sections.flatMap((section) => section.items), [sections]);

  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(0, flat.length - 1)));
  }, [flat.length]);

  useEffect(() => {
    if (!open) return;
    const element = document.getElementById(`palette-item-${active}`);
    element?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  if (!open) return null;

  const runItem = (item: PaletteItem | undefined) => {
    if (!item) return;
    item.onRun();
    onClose();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (flat.length > 0) setActive((current) => (current + 1) % flat.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (flat.length > 0) setActive((current) => (current - 1 + flat.length) % flat.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      runItem(flat[active]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  let index = 0;
  return (
    <div
      className="overlay overlay-top"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label={c.command.placeholder}>
        <div className="palette-search">
          <Icon name="search" size={21} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={c.command.placeholder}
            aria-label={c.command.placeholder}
            spellCheck={false}
          />
          <kbd className="kbd">ESC</kbd>
        </div>

        <div className="palette-body">
          {sections.length === 0 && (
            <div className="palette-empty">
              <Icon name="search_off" size={22} />
              <span>{c.command.noResults}</span>
            </div>
          )}
          {sections.map((section) => (
            <div key={section.key} className="palette-group">
              <div className="palette-label">{section.label}</div>
              {section.items.map((item) => {
                const itemIndex = index;
                index += 1;
                return (
                  <button
                    key={item.id}
                    id={`palette-item-${itemIndex}`}
                    type="button"
                    className={`palette-item ${active === itemIndex ? 'is-active' : ''}`}
                    onPointerEnter={() => setActive(itemIndex)}
                    onClick={() => runItem(item)}
                    role="option"
                    aria-selected={active === itemIndex}
                  >
                    <span className="palette-icon">
                      <Icon name={item.icon} size={17} />
                    </span>
                    <span className="palette-item-label">{item.label}</span>
                    {item.hint && <span className="palette-hint">{item.hint}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="palette-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            {c.command.footerSelect}
          </span>
          <span>
            <kbd>↵</kbd>
            {c.command.footerOpen}
          </span>
          <span>
            <kbd>ESC</kbd>
            {c.command.footerClose}
          </span>
        </div>
      </div>
    </div>
  );
}
