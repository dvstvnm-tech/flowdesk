'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { Project } from '@/lib/database.types';
import { currentMonthKey } from '@/lib/utils';
import MonthSelect from '@/components/MonthSelect';

export default function NewProjectModal({
  onClose, onCreated,
}: { onClose: () => void; onCreated: (project: Project) => void }) {
  const supabase = createClient();
  const { profile: me } = useCurrentUser();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueMonth, setDueMonth] = useState<string>(currentMonthKey());
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!title.trim() || !me) return;
    setSaving(true);
    const { data, error } = await supabase
      .from('projects')
      .insert({ title: title.trim(), description: description.trim(), owner_id: me.id, due_month: dueMonth })
      .select().single();
    setSaving(false);
    if (error) { alert('Не удалось создать проект: ' + error.message); return; }
    onCreated(data as Project);
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/45 flex items-start justify-center pt-[10vh]" onClick={onClose}>
      <div className="bg-surface rounded-2xl w-[480px] max-w-[92vw] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-border font-bold text-[15px] flex items-center">
          Новый проект
          <button onClick={onClose} className="ml-auto text-muted">✕</button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-text2 block mb-1">Название</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
              placeholder="Например: Запуск Корпоративного университета"
              className="w-full border border-border bg-surface2 rounded-lg px-2.5 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-text2 block mb-1">Описание (необязательно)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full border border-border bg-surface2 rounded-lg p-2.5 text-sm min-h-[70px]" />
          </div>
          <div>
            <label className="text-xs font-semibold text-text2 block mb-1">Месяц сдачи</label>
            <MonthSelect value={dueMonth} onChange={setDueMonth} />
          </div>
        </div>
        <div className="p-3.5 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 border border-border rounded-lg text-sm">Отмена</button>
          <button onClick={create} disabled={saving} className="px-3 py-1.5 bg-accent text-white rounded-lg text-sm font-semibold disabled:opacity-60">
            {saving ? 'Создаём…' : 'Создать проект'}
          </button>
        </div>
      </div>
    </div>
  );
}
