'use client';
import { useEffect, useRef, useState } from 'react';

export default function InlineEditText({
  value, onSave, placeholder, as = 'input', displayClassName, inputClassName, emptyLabel,
}: {
  value: string;
  onSave: (next: string) => void;
  placeholder?: string;
  as?: 'input' | 'textarea';
  displayClassName?: string;
  inputClassName?: string;
  emptyLabel?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (editing) { ref.current?.focus(); ref.current?.select(); }
  }, [editing]);

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next !== value) onSave(next);
    else setDraft(value);
  }

  if (editing) {
    const Tag = as;
    return (
      <Tag
        ref={ref as any}
        value={draft}
        onChange={(e: any) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e: any) => {
          if (e.key === 'Enter' && as === 'input') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { setDraft(value); setEditing(false); }
        }}
        placeholder={placeholder}
        className={inputClassName ?? 'w-full border border-border bg-surface2 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-accent'}
      />
    );
  }

  const isEmpty = !value.trim();
  return (
    <div
      onClick={() => setEditing(true)}
      title="Нажмите, чтобы изменить"
      className={(displayClassName ?? '') + ' cursor-text hover:bg-surface2 rounded-md transition-colors px-1 -mx-1'}
    >
      {isEmpty ? <span className="text-muted italic">{emptyLabel ?? placeholder ?? 'Нажмите, чтобы добавить…'}</span> : value}
    </div>
  );
}
