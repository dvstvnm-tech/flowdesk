'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { Profile, Task } from '@/lib/database.types';
import { PRIORITY_META, fullName, currentMonthKey } from '@/lib/utils';
import MonthSelect from '@/components/MonthSelect';

export default function QuickAddModal({
  status, profiles, onClose, onCreated,
}: { status: string; profiles: Profile[]; onClose: () => void; onCreated: (task: Task) => void }) {
  const supabase = createClient();
  const { profile: me } = useCurrentUser();
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium');
  // «Процедуры» — задача привязана к месяцу, а не к точной дате
  const isMonthBased = status === 'review';
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10);
  });
  const [dueMonth, setDueMonth] = useState<string>(currentMonthKey());
  const [saving, setSaving] = useState(false);

  // Задачу всегда создаём на себя — независимо от того, где открыта форма
  // (Доска, Сотрудники, своя карточка). Выбор чужого исполнителя недоступен.
  async function create() {
    if (!title.trim() || !me) return;
    setSaving(true);
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        title: title.trim(), status, assignee_id: me.id, reporter_id: me.id,
        priority,
        due_date: isMonthBased ? null : new Date(dueDate + 'T12:00:00').toISOString(),
        due_month: isMonthBased ? dueMonth : null,
      })
      .select().single();
    setSaving(false);
    if (error) { alert('Не удалось создать задачу: ' + error.message); return; }
    onCreated(data as Task);
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/45 flex items-start justify-center pt-[8vh]" onClick={onClose}>
      <div className="bg-surface rounded-2xl w-[520px] max-w-[92vw] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-border font-bold text-[15px] flex items-center">
          Новая задача
          <button onClick={onClose} className="ml-auto text-muted">✕</button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-text2 block mb-1">Название задачи</label>
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: Подготовить отчёт за неделю" className="w-full border border-border bg-surface2 rounded-lg px-2.5 py-2 text-sm" />
          </div>
          <div className="text-xs text-muted -mt-1">Исполнитель: {me ? fullName(me) || me.email : '…'}</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-text2 block mb-1">Приоритет</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as any)} className="w-full border border-border bg-surface2 rounded-lg px-2.5 py-2 text-sm">
                {Object.entries(PRIORITY_META).map(([id, m]) => <option key={id} value={id}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-text2 block mb-1">{isMonthBased ? 'Месяц' : 'Дедлайн'}</label>
              {isMonthBased ? (
                <MonthSelect value={dueMonth} onChange={setDueMonth} />
              ) : (
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full border border-border bg-surface2 rounded-lg px-2.5 py-2 text-sm" />
              )}
            </div>
          </div>
        </div>
        <div className="p-3.5 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 border border-border rounded-lg text-sm">Отмена</button>
          <button onClick={create} disabled={saving} className="px-3 py-1.5 bg-accent text-white rounded-lg text-sm font-semibold disabled:opacity-60">
            {saving ? 'Создаём…' : 'Создать задачу'}
          </button>
        </div>
      </div>
    </div>
  );
}
