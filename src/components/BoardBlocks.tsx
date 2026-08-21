'use client';

import Link from 'next/link';
import type { Task, Profile, Project } from '@/lib/database.types';
import { STATUS_META, PRIORITY_META, formatDate, isOverdue, fullName, monthLabel, sortMonthKeys } from '@/lib/utils';
import { Avatar } from '@/components/AppShell';
import ProgressBar from '@/components/ProgressBar';

export const BLOCK_COLORS: Record<string, string> = {
  projects: '#7C4FE0',
  review: '#16A34A',
  done: '#C77C0A',
};
export const BLOCK_SUBTITLES: Record<string, string> = {
  projects: 'Глобальные задачи на год',
  review: 'Документарная часть',
  done: 'Требует согласования руководителя',
};

// Задача считается «процедурной» (живёт в блоке «Процедуры»), если у неё
// когда-либо был выбран месяц — это устойчивый признак, который не пропадает
// при смене статуса review → done → approved.
function isProcedureTask(t: Task) {
  return t.status === 'review' || !!t.due_month;
}

export function EmployeeSection({
  profile, tasks, projects, projectProgress, isMine, onOpenTask, onAdd, onAddProject,
  onDeleteTask, onDeleteProject, onApproveProject, onApproveTask, showHeader = true,
}: {
  profile: Profile; tasks: Task[]; projects: Project[];
  projectProgress: (id: string) => { pct: number; total: number };
  isMine: boolean; onOpenTask: (id: string) => void; onAdd: (status: string) => void; onAddProject: () => void;
  onDeleteTask: (task: Task) => void; onDeleteProject: (project: Project) => void;
  onApproveProject: (project: Project) => void; onApproveTask: (task: Task) => void;
  showHeader?: boolean;
}) {
  const projectsInReview = projects.filter((p) => p.approval_status === 'review');
  const procedureTasks = tasks.filter(isProcedureTask);
  const doneTasks = tasks.filter((t) => t.status === 'done');
  return (
    <div className="mb-7">
      {showHeader && (
        <div className="flex items-center gap-2.5 mb-2.5">
          <Avatar profile={profile} size={30} />
          <span className="font-bold text-[14.5px]">{fullName(profile) || profile.email}</span>
          <span className="text-[11.5px] text-muted bg-surface2 border border-border rounded-full px-2 py-0.5">{tasks.length + projects.length} задач</span>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2.5">
        <Block color={BLOCK_COLORS.projects} label="Проекты" subtitle={BLOCK_SUBTITLES.projects} count={projects.length} isMine={isMine} onAdd={isMine ? onAddProject : undefined}>
          <MonthGroupedProjects projects={projects} projectProgress={projectProgress} isMine={isMine} onDelete={onDeleteProject} />
          {projects.length === 0 && <Empty />}
        </Block>

        <Block color={BLOCK_COLORS.review} label={STATUS_META.review.label} subtitle={BLOCK_SUBTITLES.review} count={procedureTasks.length} isMine={isMine} onAdd={() => onAdd('review')}>
          <MonthGroupedProcedureTasks tasks={procedureTasks} onOpenTask={onOpenTask} isMine={isMine} onDelete={onDeleteTask} />
          {procedureTasks.length === 0 && <Empty />}
        </Block>

        <Block color={BLOCK_COLORS.done} label={STATUS_META.done.label} subtitle={BLOCK_SUBTITLES.done} count={doneTasks.length + projectsInReview.length} isMine={isMine} onAdd={() => onAdd('done')}>
          {projectsInReview.map((pr) => {
            const { pct, total } = projectProgress(pr.id);
            return <ProjectApprovalCard key={pr.id} project={pr} pct={pct} subtaskCount={total} onApprove={() => onApproveProject(pr)} />;
          })}
          {doneTasks.map((t) => (
            <TaskApprovalCard key={t.id} task={t} onOpen={() => onOpenTask(t.id)} onApprove={() => onApproveTask(t)} />
          ))}
          {doneTasks.length === 0 && projectsInReview.length === 0 && <Empty />}
        </Block>
      </div>
    </div>
  );
}

export function Block({
  color, label, subtitle, count, isMine, onAdd, children,
}: { color: string; label: string; subtitle: string; count: number; isMine: boolean; onAdd?: () => void; children: React.ReactNode }) {
  return (
    <div className="bg-surface2 border border-border rounded-2xl p-3">
      <div className="flex items-center gap-2 px-0.5">
        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
        <span className="font-bold text-[13px]">{label}</span>
        <span className="text-[11px] text-muted bg-surface border border-border rounded-full px-1.5">{count}</span>
        {isMine && onAdd && <button onClick={onAdd} className="ml-auto text-muted hover:text-accent text-sm px-0.5">+</button>}
      </div>
      <div className="text-[11px] text-muted px-0.5 mt-0.5 mb-2.5">{subtitle}</div>
      <div className="flex flex-col gap-2 min-h-[20px]">{children}</div>
    </div>
  );
}

export function Empty() {
  return <div className="text-center py-3 text-[11px] text-muted/70">Нет задач</div>;
}

export function MonthGroupedProjects({
  projects, projectProgress, isMine, onDelete,
}: { projects: Project[]; projectProgress: (id: string) => { pct: number; total: number }; isMine: boolean; onDelete: (project: Project) => void }) {
  const archived = projects.filter((p) => p.approval_status === 'approved');
  const active = projects.filter((p) => p.approval_status !== 'approved');
  const keys = sortMonthKeys(Array.from(new Set(active.map((p) => p.due_month ?? null))));
  return (
    <>
      {keys.map((key) => (
        <div key={key ?? 'none'} className="flex flex-col gap-2">
          <div className="text-[10.5px] font-bold text-muted uppercase tracking-wide px-0.5 -mb-1">{monthLabel(key)}</div>
          {active.filter((p) => (p.due_month ?? null) === key).map((pr) => {
            const { pct, total } = projectProgress(pr.id);
            return <ProjectCard key={pr.id} project={pr} pct={pct} subtaskCount={total} isMine={isMine} onDelete={() => onDelete(pr)} />;
          })}
        </div>
      ))}
      {archived.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[10.5px] font-bold text-muted uppercase tracking-wide px-0.5 -mb-1">Архивные задачи</div>
          {archived.map((pr) => {
            const { pct, total } = projectProgress(pr.id);
            return <ProjectCard key={pr.id} project={pr} pct={pct} subtaskCount={total} isMine={isMine} onDelete={() => onDelete(pr)} />;
          })}
        </div>
      )}
    </>
  );
}

// Задачи блока «Процедуры»: активные (review/done) сгруппированы по месяцу,
// согласованные (approved) — в отдельной группе «Архивные задачи» — по аналогии с проектами.
export function MonthGroupedProcedureTasks({
  tasks, onOpenTask, isMine, onDelete,
}: { tasks: Task[]; onOpenTask: (id: string) => void; isMine: boolean; onDelete: (task: Task) => void }) {
  const archived = tasks.filter((t) => t.status === 'approved');
  const active = tasks.filter((t) => t.status !== 'approved');
  const keys = sortMonthKeys(Array.from(new Set(active.map((t) => t.due_month ?? null))));
  return (
    <>
      {keys.map((key) => (
        <div key={key ?? 'none'} className="flex flex-col gap-2">
          <div className="text-[10.5px] font-bold text-muted uppercase tracking-wide px-0.5 -mb-1">{monthLabel(key)}</div>
          {active.filter((t) => (t.due_month ?? null) === key).map((t) => (
            <TaskCard key={t.id} task={t} onOpen={() => onOpenTask(t.id)} isMine={isMine} onDelete={() => onDelete(t)} procedureStatus={t.status} />
          ))}
        </div>
      ))}
      {archived.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[10.5px] font-bold text-muted uppercase tracking-wide px-0.5 -mb-1">Архивные задачи</div>
          {archived.map((t) => (
            <TaskCard key={t.id} task={t} onOpen={() => onOpenTask(t.id)} isMine={isMine} onDelete={() => onDelete(t)} procedureStatus={t.status} />
          ))}
        </div>
      )}
    </>
  );
}

export function ProjectCard({
  project, pct, subtaskCount, isMine, onDelete,
}: { project: Project; pct: number; subtaskCount: number; isMine?: boolean; onDelete?: () => void }) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className="bg-surface border border-border rounded-[10px] p-2.5 block shadow-sm hover:shadow transition-shadow relative group"
    >
      <div className="flex items-start gap-1.5 mb-2.5">
        <div className="text-[13px] font-semibold flex-1 pr-4">{project.title}</div>
        {isMine && onDelete && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }}
            title="Удалить проект"
            className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center rounded-md text-muted hover:text-red hover:bg-red/10 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
          >✕</button>
        )}
        <span className="text-muted text-xs flex-none">↗</span>
      </div>
      <div className="flex items-center gap-2 mb-2.5">
        <ProgressBar value={pct} size="sm" />
        <span className="text-[11px] font-semibold text-muted flex-none">{Math.round(pct)}%</span>
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {project.approval_status === 'review' && (
          <span className="text-[10.5px] font-semibold rounded-full px-2 py-0.5 bg-accentSoft text-accent">На согласовании</span>
        )}
        {project.approval_status === 'approved' && (
          <span className="text-[10.5px] font-semibold rounded-full px-2 py-0.5 bg-green/15 text-green">✓ Согласовано</span>
        )}
        {project.approval_status === 'active' && project.due_month && (
          <span className="text-[11px] text-muted flex items-center gap-1">📅 {monthLabel(project.due_month)}</span>
        )}
        <span className="ml-auto text-[10.5px] font-semibold bg-accentSoft text-accent rounded-full px-2 py-0.5">{subtaskCount} подзадач ›</span>
      </div>
    </Link>
  );
}

export function ProjectApprovalCard({
  project, pct, subtaskCount, onApprove,
}: { project: Project; pct: number; subtaskCount: number; onApprove: () => void }) {
  return (
    <div className="bg-surface border border-border rounded-[10px] p-2.5 shadow-sm hover:shadow transition-shadow" style={{ borderLeft: '3px solid var(--accent)' }}>
      <Link href={`/projects/${project.id}`} className="block mb-2.5">
        <div className="text-[13px] font-semibold mb-2">{project.title}</div>
        <div className="flex items-center gap-2">
          <ProgressBar value={pct} size="sm" />
          <span className="text-[11px] font-semibold text-muted flex-none">{Math.round(pct)}%</span>
        </div>
        <div className="text-[10.5px] text-muted mt-1.5">{subtaskCount} подзадач · проект</div>
      </Link>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onApprove(); }}
        className="w-full text-xs font-semibold bg-green text-white rounded-lg px-2.5 py-1.5 hover:opacity-90 transition-opacity"
      >✓ Согласовано</button>
    </div>
  );
}

// Карточка задачи «на согласовании» в третьем блоке — с кнопкой самообслуживания «Согласовано»,
// по аналогии с ProjectApprovalCard.
export function TaskApprovalCard({ task, onOpen, onApprove }: { task: Task; onOpen: () => void; onApprove: () => void }) {
  const pr = PRIORITY_META[task.priority];
  return (
    <div className="bg-surface border border-border rounded-[10px] p-2.5 shadow-sm hover:shadow transition-shadow" style={{ borderLeft: `3px solid ${pr.color}` }}>
      <div onClick={onOpen} className="cursor-pointer mb-2.5">
        <div className="text-[13px] font-semibold mb-1.5">{task.title}</div>
        <div className="flex items-center gap-2 flex-wrap">
          {task.due_month ? (
            <span className="text-[11px] flex items-center gap-1 text-muted">📅 {monthLabel(task.due_month)}</span>
          ) : (
            <span className="text-[11px] flex items-center gap-1 text-muted">🕐 {formatDate(task.due_date)}</span>
          )}
          <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5" style={{ background: pr.color + '22', color: pr.color }}>{pr.label}</span>
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onApprove(); }}
        className="w-full text-xs font-semibold bg-green text-white rounded-lg px-2.5 py-1.5 hover:opacity-90 transition-opacity"
      >✓ Согласовано</button>
    </div>
  );
}

export function TaskCard({
  task, onOpen, showApprovalBadge, isMine, onDelete, procedureStatus,
}: { task: Task; onOpen: () => void; showApprovalBadge?: boolean; isMine?: boolean; onDelete?: () => void; procedureStatus?: string }) {
  const pr = PRIORITY_META[task.priority];
  const overdue = isOverdue(task.due_date, task.status);
  return (
    <div
      onClick={onOpen}
      className="bg-surface border border-border rounded-[10px] p-2.5 cursor-pointer shadow-sm hover:shadow transition-shadow relative group"
      style={{ borderLeft: `3px solid ${pr.color}` }}
    >
      {isMine && onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Удалить задачу"
          className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center rounded-md text-muted hover:text-red hover:bg-red/10 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
        >✕</button>
      )}
      <div className="text-[13px] font-semibold mb-2 pr-5">{task.title}</div>
      <div className="flex items-center gap-2 flex-wrap">
        {task.due_month ? (
          <span className="text-[11px] flex items-center gap-1 text-muted">📅 {monthLabel(task.due_month)}</span>
        ) : (
          <span className={`text-[11px] flex items-center gap-1 ${overdue ? 'text-red font-semibold' : 'text-muted'}`}>🕐 {formatDate(task.due_date)}</span>
        )}
        {procedureStatus === 'done' && (
          <span className="text-[10.5px] font-semibold rounded-full px-2 py-0.5 bg-accentSoft text-accent">На согласовании</span>
        )}
        {procedureStatus === 'approved' && (
          <span className="text-[10.5px] font-semibold rounded-full px-2 py-0.5 bg-green/15 text-green">✓ Согласовано</span>
        )}
        {(!procedureStatus || procedureStatus === 'review') && !showApprovalBadge && (
          <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5" style={{ background: pr.color + '22', color: pr.color }}>{pr.label}</span>
        )}
        {showApprovalBadge && (
          <span className="ml-auto text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-accentSoft text-accent">На согласовании</span>
        )}
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status];
  return <span className="text-[10.5px] font-bold px-1.5 py-0.5 rounded-full flex-none" style={{ background: m.color + '22', color: m.color }}>{m.label}</span>;
}

export function Stat({ label, value, accent, danger, success }: { label: string; value: React.ReactNode; accent?: boolean; danger?: boolean; success?: boolean }) {
  const color = danger ? 'var(--red)' : success ? 'var(--green)' : accent ? 'var(--accent)' : 'var(--text)';
  return (
    <div className="card p-3">
      <div className="text-xl font-extrabold font-mono" style={{ color }}>{value}</div>
      <div className="text-[11.5px] text-muted mt-0.5">{label}</div>
    </div>
  );
}
