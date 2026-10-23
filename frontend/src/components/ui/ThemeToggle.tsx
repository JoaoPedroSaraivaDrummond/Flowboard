import { useTheme, type ThemePreference } from '../../lib/theme';
import { MonitorIcon, MoonIcon, SunIcon } from './icons';

const NEXT: Record<ThemePreference, ThemePreference> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};
const LABEL: Record<ThemePreference, string> = {
  system: 'Tema: sistema',
  light: 'Tema: claro',
  dark: 'Tema: escuro',
};

export function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  const Icon = preference === 'light' ? SunIcon : preference === 'dark' ? MoonIcon : MonitorIcon;
  return (
    <button
      type="button"
      onClick={() => setPreference(NEXT[preference])}
      title={LABEL[preference]}
      aria-label={LABEL[preference]}
      className="rounded-md p-2 text-white/90 transition hover:bg-white/15"
    >
      <Icon />
    </button>
  );
}
