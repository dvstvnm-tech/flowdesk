'use client';
import { MONTHS_RU, upcomingMonthKeys } from '@/lib/utils';

export default function MonthSelect({
  value, onChange, className,
}: { value: string; onChange: (monthKey: string) => void; className?: string }) {
  const keys = upcomingMonthKeys(18);
  // на случай если выбранный месяц уже в прошлом относительно списка — добавим его тоже
  const options = keys.includes(value) || !value ? keys : [value, ...keys];

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className ?? 'w-full border border-border bg-surface2 rounded-lg px-2.5 py-2 text-sm'}
    >
      {options.map((k) => {
        const [y, m] = k.split('-').map(Number);
        return (
          <option key={k} value={k}>
            {MONTHS_RU[m - 1]} {y}
          </option>
        );
      })}
    </select>
  );
}
