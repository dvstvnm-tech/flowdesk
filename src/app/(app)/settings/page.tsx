'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Avatar } from '@/components/AppShell';
import type { Department } from '@/lib/database.types';

const ROLE_LABEL: Record<string, string> = { administrator: 'Администратор', manager: 'Руководитель', employee: 'Сотрудник', viewer: 'Наблюдатель' };
const JOB_TITLES = ['Специалист', 'Начальник', 'Директор'] as const;

export default function SettingsPage() {
  const supabase = createClient();
  const { profile, loading } = useCurrentUser();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [jobTitle, setJobTitle] = useState('Специалист');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase.from('departments').select('*').order('name').then(({ data }) => setDepartments(data ?? []));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (profile) { setDepartmentId(profile.department_id ?? ''); setJobTitle(profile.job_title ?? 'Специалист'); }
  }, [profile?.department_id, profile?.job_title]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="p-6 text-muted text-sm">Загрузка…</div>;
  if (!profile) return null;

  async function save() {
    await supabase.from('profiles').update({
      first_name: firstName || profile!.first_name,
      last_name: lastName || profile!.last_name,
      department_id: departmentId || null,
      job_title: jobTitle,
    }).eq('id', profile!.id);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="p-6 max-w-[520px]">
      <h1 className="text-xl font-extrabold mb-5">Настройки</h1>
      <div className="flex items-center gap-3 mb-5">
        <Avatar profile={profile} size={60} />
        <div>
          <div className="font-bold">{`${profile.first_name} ${profile.last_name}`.trim() || 'Без имени'}</div>
          <div className="text-xs text-muted">{profile.email}</div>
        </div>
      </div>

      <label className="text-xs font-semibold text-text2 block mb-1">Имя</label>
      <input defaultValue={profile.first_name} onChange={(e) => setFirstName(e.target.value)} className="w-full border border-border bg-surface2 rounded-lg px-2.5 py-2 text-sm mb-3" />

      <label className="text-xs font-semibold text-text2 block mb-1">Фамилия</label>
      <input defaultValue={profile.last_name} onChange={(e) => setLastName(e.target.value)} className="w-full border border-border bg-surface2 rounded-lg px-2.5 py-2 text-sm mb-3" />

      <label className="text-xs font-semibold text-text2 block mb-1">Отдел</label>
      <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="w-full border border-border bg-surface2 rounded-lg px-2.5 py-2 text-sm mb-3">
        <option value="">Не указан</option>
        {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>

      <label className="text-xs font-semibold text-text2 block mb-1">Должность</label>
      <select value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className="w-full border border-border bg-surface2 rounded-lg px-2.5 py-2 text-sm mb-3">
        {JOB_TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <p className="text-[11px] text-muted mb-1 -mt-2">Отображается вместо роли на доске и в списке сотрудников.</p>

      <label className="text-xs font-semibold text-text2 block mb-1">Роль</label>
      <input value={ROLE_LABEL[profile.role] ?? profile.role} disabled className="w-full border border-border bg-surface2 rounded-lg px-2.5 py-2 text-sm mb-1 opacity-60" />
      <p className="text-[11px] text-muted mb-4">Роль назначается администратором.</p>

      <label className="text-xs font-semibold text-text2 block mb-1">Email</label>
      <input value={profile.email} disabled className="w-full border border-border bg-surface2 rounded-lg px-2.5 py-2 text-sm mb-1 opacity-60" />
      <p className="text-[11px] text-muted mb-4">Email и фото привязаны к аккаунту Google.</p>

      <button onClick={save} className="px-3.5 py-2 bg-accent text-white rounded-lg text-sm font-semibold">
        {saved ? 'Сохранено ✓' : 'Сохранить изменения'}
      </button>
    </div>
  );
}
