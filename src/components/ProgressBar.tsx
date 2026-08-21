export default function ProgressBar({ value, size = 'md' }: { value: number; size?: 'sm' | 'md' }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const h = size === 'sm' ? 4 : 6;
  return (
    <div className="w-full bg-surface2 rounded-full overflow-hidden flex-1" style={{ height: h }}>
      <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}
