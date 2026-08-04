'use client';

import Link from 'next/link';
import type { Department, Profile } from '@/lib/database.types';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePresence } from '@/hooks/usePresence';
import { Avatar } from '@/components/AppShell';
import { fullName } from '@/lib/utils';

const ROLE_LABEL: Record<string, string> = { administrator: 'Администратор', manager: 'Руководитель', employee: 'Сотрудник', viewer: 'Наблюдатель' };

export default function EmployeesGrid({
  profiles, tasks, departments,
}: { profiles: Profile[]; tasks: { id: string; assignee_id: string | null; status: string }[]; departments: Department[] }) {
  const { profile: me } = useCurrentUser();
  const { others } = usePresence('workspace-presence', me ? { user_id: me.id, name: fullName(me), avatar_url: me.avatar_url } : null);
  const onlineIds = new Set([me?.id, ...others.map((o) => o.user_id)].filter(Boolean));

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-xl font-extrabold tracking-tight">Сотрудники</h1>
        <p className="text-sm text-muted mt-0.5">Команда · 🟢 {onlineIds.size} онлайн сейчас</p>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3.5">
        {profiles.map((p) => {
          const mine = tasks.filter((t) => t.assignee_id === p.id);
          const done = mine.filter((t) => t.status === 'done').length;
          const pct = mine.length ? Math.round((done / mine.length) * 100) : 0;
          const dept = departments.find((d) => d.id === p.department_id);
          return (
            <Link key={p.id} href={`/employees/${p.id}`} className="card p-4 text-center hover:shadow-md transition-shadow">
              <div className="relative w-14 h-14 mx-auto mb-2.5">
                <Avatar profile={p} size={56} />
                {onlineIds.has(p.id) && <span className="presence-dot absolute -bottom-0.5 -right-0.5" title="Онлайн" />}
              </div>
              <div className="font-bold text-sm">{fullName(p) || 'Без имени'}</div>
              <div className="text-xs text-muted">{ROLE_LABEL[p.role] ?? p.role}</div>
              <div className="text-[11px] text-muted mb-2.5">{dept?.name ?? 'Без отдела'}</div>
              <div className="flex justify-center gap-3.5 text-[11.5px] border-t border-border pt-2.5">
                <div><b className="block text-sm">{mine.length}</b>задач</div>
                <div><b className="block text-sm">{done}</b>выполнено</div>
                <div><b className="block text-sm">{pct}%</b>эффект.</div>
              </div>
            </Link>
          );
        })}
        {profiles.length === 0 && <div className="text-muted text-sm col-span-full text-center py-10">Пока никто не вошёл в систему</div>}
      </div>
    </div>
  );
}
