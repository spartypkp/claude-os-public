'use client';

import { Sun, Moon, Palette, Check, LayoutGrid, AlignLeft, AlignRight, ArrowDownRight, ArrowRight, FileText, SortAsc } from 'lucide-react';
import { Section } from '../shared/Section';
import { useDesktopSettings, ICON_SIZES, type GridFlow, type IconSize, type SortOrder, type GridAlignment } from '@/store/desktopSettingsStore';

const ACCENT_COLORS = [
  { name: 'Claude Coral', value: 'hsl(16, 67%, 55%)' },
  { name: 'Ocean Blue', value: 'var(--color-primary)' },
  { name: 'Royal Purple', value: 'var(--color-info)' },
  { name: 'Emerald', value: 'var(--color-success)' },
  { name: 'Sunset Orange', value: '#f97316' },
  { name: 'Hot Pink', value: '#ec4899' },
  { name: 'Electric Cyan', value: '#06b6d4' },
];

function OptionButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-md text-[12px] font-medium transition-colors ${
        selected
          ? 'bg-[var(--color-claude)] text-white'
          : 'bg-white dark:bg-[#3a3a3a] text-[#1D1D1F] dark:text-[#E5E5E5] hover:bg-[#E8E8E8] dark:hover:bg-[#4a4a4a]'
      }`}
    >
      {children}
    </button>
  );
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 py-3 border-b border-[#E5E5E5] dark:border-[#3a3a3a] last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-[#1D1D1F] dark:text-white">{label}</div>
        {description && <div className="text-[11px] text-[#8E8E93] mt-0.5">{description}</div>}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0 ml-3">
        {children}
      </div>
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-[22px] rounded-full transition-colors ${
        checked ? 'bg-[var(--color-claude)]' : 'bg-[#D1D1D6] dark:bg-[#4a4a4a]'
      }`}
    >
      <div className={`absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-transform ${
        checked ? 'translate-x-[19px]' : 'translate-x-[2px]'
      }`} />
    </button>
  );
}

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
  const {
    gridFlow, setGridFlow,
    iconSize, setIconSize,
    sortOrder, setSortOrder,
    gridAlignment, setGridAlignment,
    showExtensions, setShowExtensions,
  } = useDesktopSettings();

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
                    ? 'bg-gradient-to-br from-[var(--color-claude)] to-[var(--color-primary-hover)] text-white'
                    : 'bg-white dark:bg-[#3a3a3a] text-[#8E8E93]'
                }`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="text-[13px] font-medium text-[#1D1D1F] dark:text-white">{label}</div>
                  <div className="text-[11px] text-[#8E8E93]">{desc}</div>
                </div>
                {isSelected && <Check className="w-5 h-5 text-[var(--color-claude)]" />}
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

      {/* Desktop */}
      <Section title="Desktop" icon={LayoutGrid}>
        <SettingRow label="Icon Size">
          {(['small', 'medium', 'large'] as IconSize[]).map((size) => (
            <OptionButton key={size} selected={iconSize === size} onClick={() => setIconSize(size)}>
              {ICON_SIZES[size].label}
            </OptionButton>
          ))}
        </SettingRow>

        <SettingRow label="Grid Flow" description="Direction icons fill on the desktop">
          <OptionButton selected={gridFlow === 'row'} onClick={() => setGridFlow('row')}>
            <ArrowRight className="w-3.5 h-3.5" /> Rows
          </OptionButton>
          <OptionButton selected={gridFlow === 'column'} onClick={() => setGridFlow('column')}>
            <ArrowDownRight className="w-3.5 h-3.5" /> Columns
          </OptionButton>
        </SettingRow>

        <SettingRow label="Alignment">
          <OptionButton selected={gridAlignment === 'left'} onClick={() => setGridAlignment('left')}>
            <AlignLeft className="w-3.5 h-3.5" /> Left
          </OptionButton>
          <OptionButton selected={gridAlignment === 'right'} onClick={() => setGridAlignment('right')}>
            <AlignRight className="w-3.5 h-3.5" /> Right
          </OptionButton>
        </SettingRow>

        <SettingRow label="Sort By">
          {([
            { value: 'category' as SortOrder, label: 'Category' },
            { value: 'name' as SortOrder, label: 'Name' },
            { value: 'kind' as SortOrder, label: 'Kind' },
          ]).map(({ value, label }) => (
            <OptionButton key={value} selected={sortOrder === value} onClick={() => setSortOrder(value)}>
              {label}
            </OptionButton>
          ))}
        </SettingRow>

        <SettingRow label="Show File Extensions" description="Display .md, .py, etc. in icon labels">
          <ToggleSwitch checked={showExtensions} onChange={setShowExtensions} />
        </SettingRow>
      </Section>
    </div>
  );
}
