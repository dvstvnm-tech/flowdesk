export function initials(name: string): string {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
export function formatDate(d: string | Date | null): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
export function formatDateTime(d: string | Date | null): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date() && status !== 'done' && status !== 'approved';
}
export const PRIORITY_META: Record<string, { label: string; color: string }> = {
  high: { label: 'Высокий', color: '#DC2626' },
  medium: { label: 'Средний', color: '#C77C0A' },
  low: { label: 'Низкий', color: '#868C97' },
};
export const STATUS_META: Record<string, { label: string; color: string }> = {
  backlog: { label: 'Проекты', color: '#7C4FE0' },
  todo: { label: 'К выполнению', color: '#2F5FE0' },
  in_progress: { label: 'Текущие задачи', color: '#C77C0A' },
  review: { label: 'Процедуры', color: '#868C97' },
  done: { label: 'На согласование', color: '#2F5FE0' },
  approved: { label: 'Согласовано', color: '#16A34A' },
};
export const STATUS_ORDER = ['backlog', 'review', 'done'];

// ---- Месяцы (для группировки "Проектов" и "Процедур" по месяцу) ----
export const MONTHS_RU = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

// 'YYYY-MM' -> "Сентябрь 2026"
export function monthLabel(monthKey: string | null | undefined): string {
  if (!monthKey) return 'Без месяца';
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return 'Без месяца';
  return `${MONTHS_RU[m - 1]} ${y}`;
}

// текущий месяц в формате 'YYYY-MM'
export function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// список из `count` месяцев, начиная с текущего, в формате 'YYYY-MM'
export function upcomingMonthKeys(count = 15): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < count; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

// сортировка ключей месяца по возрастанию, "без месяца" — в конец
export function sortMonthKeys(keys: (string | null)[]): (string | null)[] {
  return [...keys].sort((a, b) => {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    return a.localeCompare(b);
  });
}
export function fullName(p: { first_name?: string; last_name?: string } | null | undefined): string {
  if (!p) return '';
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
}
