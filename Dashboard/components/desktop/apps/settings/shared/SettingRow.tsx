export function SettingRow({
  label,
  value,
  valueColor,
  isFirst = false,
  isLast = false,
}: {
  label: string;
  value: React.ReactNode;
  valueColor?: 'success' | 'muted' | 'coral';
  isFirst?: boolean;
  isLast?: boolean;
}) {
  const colorClass = valueColor === 'success'
    ? 'text-green-500'
    : valueColor === 'coral'
    ? 'text-[#DA7756]'
    : 'text-[#8E8E93]';

  return (
    <div className={`flex items-center justify-between px-3 py-2.5 ${!isLast ? 'border-b border-[#E5E5E5] dark:border-[#3a3a3a]' : ''}`}>
      <span className="text-[13px] text-[#1D1D1F] dark:text-[#E5E5E5]">{label}</span>
      <span className={`text-[13px] font-medium ${colorClass}`}>{value}</span>
    </div>
  );
}
