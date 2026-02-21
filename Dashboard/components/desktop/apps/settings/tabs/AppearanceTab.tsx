'use client';

import { Sun, Moon, Palette, Check } from 'lucide-react';
import { Section } from '../shared/Section';

const ACCENT_COLORS = [
  { name: 'Claude Coral', value: 'hsl(16, 67%, 55%)' },
  { name: 'Ocean Blue', value: '#3b82f6' },
  { name: 'Royal Purple', value: '#8b5cf6' },
  { name: 'Emerald', value: '#22c55e' },
  { name: 'Sunset Orange', value: '#f97316' },
  { name: 'Hot Pink', value: '#ec4899' },
  { name: 'Electric Cyan', value: '#06b6d4' },
];

export function AppearanceTab({
  darkMode,
  toggleDarkMode,
  accentColor,
  setAccentColor,
}: {
  darkMode: boolean;
  toggleDarkMode: () => void;
  accentColor: string;
  setAccentColor: (c: string) => void;
}) {
  const themeOptions = [
    { id: 'light', isDark: false, label: 'Light', icon: Sun, desc: 'Bright and crisp' },
    { id: 'dark', isDark: true, label: 'Dark', icon: Moon, desc: 'Easy on the eyes' },
  ];

  return (
    <div className="p-5">
      <h3 className="text-lg font-semibold text-[#1D1D1F] dark:text-white mb-5">Appearance</h3>

      {/* Theme */}
      <Section title="Theme" icon={Sun}>
        <div className="divide-y divide-[#E5E5E5] dark:divide-[#3a3a3a]">
          {themeOptions.map(({ id, isDark, label, icon: Icon, desc }) => {
            const isSelected = darkMode === isDark;
            return (
              <button
                key={id}
                onClick={() => {
                  if (darkMode !== isDark) {
                    toggleDarkMode();
                  }
                }}
                className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-[#F0F0F0] dark:hover:bg-[#3a3a3a] transition-colors"
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  isSelected
                    ? 'bg-gradient-to-br from-[#DA7756] to-[#C15F3C] text-white'
                    : 'bg-white dark:bg-[#3a3a3a] text-[#8E8E93]'
                }`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="text-[13px] font-medium text-[#1D1D1F] dark:text-white">{label}</div>
                  <div className="text-[11px] text-[#8E8E93]">{desc}</div>
                </div>
                {isSelected && <Check className="w-5 h-5 text-[#DA7756]" />}
              </button>
            );
          })}
        </div>
      </Section>

      {/* Accent Color */}
      <Section title="Accent Color" icon={Palette}>
        <div className="px-3 py-4">
          <div className="flex flex-wrap gap-3 justify-center">
            {ACCENT_COLORS.map((color) => (
              <button
                key={color.value}
                onClick={() => setAccentColor(color.value)}
                className={`w-10 h-10 rounded-full transition-all hover:scale-110 shadow-sm ${
                  accentColor === color.value
                    ? 'ring-2 ring-offset-2 ring-offset-[#F5F5F5] dark:ring-offset-[#2a2a2a] ring-[#1D1D1F] dark:ring-white scale-110'
                    : 'ring-1 ring-black/10'
                }`}
                style={{ backgroundColor: color.value }}
                title={color.name}
              />
            ))}
          </div>
          <p className="text-[11px] text-[#8E8E93] text-center mt-3">
            {ACCENT_COLORS.find(c => c.value === accentColor)?.name || 'Custom'}
          </p>
        </div>
      </Section>
    </div>
  );
}
