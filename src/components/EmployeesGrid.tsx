'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { Department, Profile, Task, Project } from '@/lib/database.types';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePresence } from '@/hooks/usePresence';
import { Avatar } from '@/components/AppShell';
import QuickAddModal from '@/components/QuickAddModal';
import { fullName } from '@/lib/utils';
const ROLE_LABEL: Record<string, string> = { administrator: 'Администратор', manager: 'Руководитель', employee: 'Сотрудник', viewer: 'Наблюдатель' };

export default function EmployeesGrid({
  profiles, tasks, projects, departments,
}: {
  profiles: Profile[];
  tasks: { id: string; assignee_id: string | null; status: string }[];
  projects: { id: string; owner_id: string | null; approval_status: string }[];
  departments: Department[];
}) {
  const { profile: me } = useCurrentUser();
  const { others } = usePresence('workspace-presence', me ? { user_id: me.id, name: fullName(me), avatar_url: me.avatar_url } : null);
  const onlineIds = new Set([me?.id, ...others.map((o) => o.user_id)].filter(Boolean));
  const [addOpenFor, setAddOpenFor] = useState<string | null>(null);
  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-xl font-extrabold tracking-tight">Сотрудники</h1>
        <p className="text-sm text-muted mt-0.5">Команда · 🟢 {onlineIds.size} онлайн сейчас</p>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3.5">
        {profiles.map((p) => {
          const myTasks = tasks.filter((t) => t.assignee_id === p.id);
          const myProjects = projects.filter((pr) => pr.owner_id === p.id);
          const procedures = myTasks.filter((t) => t.status === 'review').length;
          const approval = myTasks.filter((t) => t.status === 'done').length + myProjects.filter((pr) => pr.approval_status === 'review').length;
          const dept = departments.find((d) => d.id === p.department_id);
          const isMine = me?.id === p.id;
          return (
            <div key={p.id} className="card p-4 text-center hover:shadow-md transition-shadow relative">
              <Link href={`/employees/${p.id}`} className="block">
                <div className="relative w-14 h-14 mx-auto mb-2.5">
                  <Avatar profile={p} size={56} />
                  {onlineIds.has(p.id) && <span className="presence-dot absolute -bottom-0.5 -right-0.5" title="Онлайн" />}
                </div>
                <div className="font-bold text-sm">{fullName(p) || 'Без имени'}</div>
                <div className="text-xs text-muted">{ROLE_LABEL[p.role] ?? p.role}</div>
                <div className="text-[11px] text-muted mb-2.5">{dept?.name ?? 'Без отдела'}</div>
                <div className="flex justify-center gap-3.5 text-[11.5px] border-t border-border pt-2.5">
                  <div><b className="block text-sm">{myProjects.length}</b>проекты</div>
                  <div><b className="block text-sm">{procedures}</b>процедуры</div>
                  <div><b className="block text-sm">{approval}</b>на согл.</div>
                </div>
              </Link>
              {isMine && (
                <button
                  onClick={() => setAddOpenFor(p.id)}
                  className="mt-2.5 w-full text-xs font-semibold border border-border rounded-lg py-1.5 text-accent hover:bg-accentSoft"
                >
                  + Добавить задачу
                </button>
              )}
            </div>
          );
        })}
        {profiles.length === 0 && <div className="text-muted text-sm col-span-full text-center py-10">Пока никто не вошёл в систему</div>}
      </div>

      {addOpenFor && (
        <QuickAddModal
          status="review"
          profiles={profiles}
          onClose={() => setAddOpenFor(null)}
          onCreated={() => setAddOpenFor(null)}
        />
      )}
    </div>
  );
}
