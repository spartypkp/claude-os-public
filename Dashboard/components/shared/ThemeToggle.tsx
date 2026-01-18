'use client';

import { Sun, Moon } from 'lucide-react';
import { useTheme, Theme } from '@/hooks/useTheme';

interface ThemeToggleProps {
  showLabel?: boolean;
  className?: string;
}

export function ThemeToggle({ showLabel = false, className = '' }: ThemeToggleProps) {
  const { resolvedTheme, toggleTheme } = useTheme();

  const Icon = resolvedTheme === 'dark' ? Moon : Sun;

  return (
    <button
      onClick={toggleTheme}
      className={`
        flex items-center gap-2 px-2 py-1.5 rounded-md
        text-[var(--text-secondary)] hover:text-[var(--text-primary)]
        hover:bg-[var(--surface-muted)] transition-colors
        ${className}
      `}
      title={`Current: ${resolvedTheme} mode. Click to toggle.`}
    >
      <Icon className="w-4 h-4" />
      {showLabel && (
        <span className="text-sm capitalize">{resolvedTheme}</span>
      )}
    </button>
  );
}

export function ThemeSelector({ className = '' }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  const options: { value: Theme; icon: typeof Sun; label: string }[] = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'dark', icon: Moon, label: 'Dark' },
  ];

  return (
    <div className={`flex gap-1 ${className}`}>
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          className={`
            flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm
            transition-colors
            ${theme === value
              ? 'bg-[var(--surface-accent)] text-[var(--text-primary)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]'
            }
          `}
          title={label}
        >
          <Icon className="w-4 h-4" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
