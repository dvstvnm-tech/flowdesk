import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Avatar } from '@/components/AppShell';
import AddTaskButton from '@/components/AddTaskButton';
import { STATUS_META, formatDate, isOverdue, fullName } from '@/lib/utils';
const ROLE_LABEL: Record<string, string> = { administrator: 'Администратор', manager: 'Руководитель', employee: 'Сотрудник', viewer: 'Наблюдатель' };
export default async function EmployeeProfilePage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', params.id).single();
  if (!profile) notFound();
  const { data: department } = profile.department_id
    ? await supabase.from('departments').select('*').eq('id', profile.department_id).single()
    : { data: null };
  const { data: tasks } = await supabase.from('tasks').select('*').eq('assignee_id', params.id).order('created_at', { ascending: false });
  const mine = tasks ?? [];
  const current = mine.filter((t) => t.status === 'in_progress').length;
  const projects = mine.filter((t) => t.status === 'review').length;
  const approval = mine.filter((t) => t.status === 'done').length;
  const overdue = mine.filter((t) => isOverdue(t.due_date, t.status)).length;
  const isMine = authUser?.id === profile.id;
  return (
    <div className="p-6">
      <Link href="/employees" className="inline-block text-sm text-muted hover:text-text mb-3.5">← Все сотрудники</Link>
      <div className="flex items-center gap-4 mb-5">
        <Avatar profile={profile} size={76} />
        <div>
          <h1 className="text-xl font-extrabold">{fullName(profile) || 'Без имени'}</h1>
          <p className="text-sm text-muted mt-0.5">{profile.job_title ?? ROLE_LABEL[profile.role] ?? profile.role} · {department?.name ?? 'Без отдела'}</p>
        </div>
        {isMine && (
          <div className="ml-auto">
            <AddTaskButton />
          </div>
        )}
      </div>
      <div className="grid grid-cols-4 gap-2.5 mb-5">
        <div className="card p-3"><div className="text-xl font-extrabold font-mono text-accent">{current}</div><div className="text-[11.5px] text-muted">Текущие задачи</div></div>
        <div className="card p-3"><div className="text-xl font-extrabold font-mono">{projects}</div><div className="text-[11.5px] text-muted">Проекты</div></div>
        <div className="card p-3"><div className="text-xl font-extrabold font-mono text-green">{approval}</div><div className="text-[11.5px] text-muted">На согласование</div></div>
        <div className="card p-3"><div className="text-xl font-extrabold font-mono text-red">{overdue}</div><div className="text-[11.5px] text-muted">Просрочено</div></div>
      </div>
      <div className="card p-4">
        <div className="font-bold text-sm mb-3">Последние задачи</div>
        {mine.slice(0, 10).map((t) => (
          <div key={t.id} className="flex items-center gap-2.5 py-2 border-b border-border last:border-0 text-[12.5px]">
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: STATUS_META[t.status].color + '22', color: STATUS_META[t.status].color }}>
              {STATUS_META[t.status].label}
            </span>
            <span className="flex-1">{t.title}</span>
            <span className={isOverdue(t.due_date, t.status) ? 'text-red font-semibold' : 'text-muted'}>{formatDate(t.due_date)}</span>
          </div>
        ))}
        {mine.length === 0 && <div className="text-muted text-sm text-center py-6">Нет задач</div>}
      </div>
    </div>
  );
}
