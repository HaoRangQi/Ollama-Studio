import { useTheme } from '../context/ThemeContext';
import { SCREEN_ICON, SCREEN_ORDER } from '../navigation';
import type { Screen } from '../navigation';
import { Icon } from './Icon';

export function MobileNav({
  screen,
  onNavigate,
  activeDownloads,
  runningDownloads
}: {
  screen: Screen;
  onNavigate: (screen: Screen) => void;
  activeDownloads: number;
  runningDownloads: number;
}) {
  const { c } = useTheme();
  const labels: Record<Screen, string> = {
    chat: c.nav.shortChat,
    models: c.nav.shortModels,
    pull: c.nav.shortPull,
    modelfile: c.nav.shortLab,
    telemetry: c.nav.shortTelemetry
  };

  return (
    <nav className="mobile-nav" aria-label={c.app.workbench}>
      {SCREEN_ORDER.map((item) => (
        <button
          key={item}
          type="button"
          className={`mobile-tab ${screen === item ? 'is-active' : ''}`}
          onClick={() => onNavigate(item)}
          aria-current={screen === item ? 'page' : undefined}
        >
          <span className="mobile-tab-icon">
            <Icon name={SCREEN_ICON[item]} size={22} filled={screen === item} />
            {item === 'pull' && activeDownloads > 0 && (
              <span className="mobile-tab-dot" data-running={runningDownloads > 0 || undefined} />
            )}
          </span>
          <span>{labels[item]}</span>
        </button>
      ))}
    </nav>
  );
}
