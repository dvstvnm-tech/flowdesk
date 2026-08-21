'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { Task, Profile, Project, ProjectStage, ProjectTask } from '@/lib/database.types';
import { STATUS_META, PRIORITY_META, formatDate, isOverdue, fullName, monthLabel, sortMonthKeys } from '@/lib/utils';
import { Avatar } from '@/components/AppShell';
import TaskPanel from '@/components/TaskPanel';
import QuickAddModal from '@/components/QuickAddModal';
import NewProjectModal from '@/components/NewProjectModal';
import ProgressBar from '@/components/ProgressBar';

const BLOCK_COLORS: Record<string, string> = {
  projects: '#7C4FE0',
  review: '#16A34A',
  done: '#C77C0A',
};
const BLOCK_SUBTITLES: Record<string, string> = {
  projects: 'Глобальные задачи на год',
  review: 'Документарная часть',
  done: 'Требует согласования руководителя',
};

export default function KanbanBoard({
  initialTasks, profiles, initialProjects, initialStages, initialProjectTasks,
}: {
  initialTasks: Task[]; profiles: Profile[];
  initialProjects: Project[]; initialStages: ProjectStage[]; initialProjectTasks: ProjectTask[];
}) {
  const supabase = createClient();
  const { profile: me } = useCurrentUser();
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [stages, setStages] = useState<ProjectStage[]>(initialStages);
  const [projectTasks, setProjectTasks] = useState<ProjectTask[]>(initialProjectTasks);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [quickAdd, setQuickAdd] = useState<string | null>(null);
  const [addingProject, setAddingProject] = useState(false);

  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [commentMatches, setCommentMatches] = useState<{ task_id: string; text: string }[]>([]);

  const [filterOpen, setFilterOpen] = useState(false);
  const [fPriority, setFPriority] = useState('');
  const [fOverdue, setFOverdue] = useState(false);

  useEffect(() => {
    const channel = supabase
      .channel('tasks-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
        setTasks((prev) => {
          if (payload.eventType === 'INSERT') {
            if (prev.some((t) => t.id === (payload.new as Task).id)) return prev;
            return [payload.new as Task, ...prev];
          }
          if (payload.eventType === 'UPDATE') return prev.map((t) => (t.id === (payload.new as Task).id ? (payload.new as Task) : t));
          if (payload.eventType === 'DELETE') return prev.filter((t) => t.id !== (payload.old as Task).id);
          return prev;
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, (payload) => {
        setProjects((prev) => {
          if (payload.eventType === 'INSERT') return prev.some((x) => x.id === (payload.new as Project).id) ? prev : [payload.new as Project, ...prev];
          if (payload.eventType === 'UPDATE') return prev.map((x) => (x.id === (payload.new as Project).id ? (payload.new as Project) : x));
          if (payload.eventType === 'DELETE') return prev.filter((x) => x.id !== (payload.old as Project).id);
          return prev;
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_stages' }, (payload) => {
        setStages((prev) => {
          if (payload.eventType === 'INSERT') return prev.some((x) => x.id === (payload.new as ProjectStage).id) ? prev : [...prev, payload.new as ProjectStage];
          if (payload.eventType === 'UPDATE') return prev.map((x) => (x.id === (payload.new as ProjectStage).id ? (payload.new as ProjectStage) : x));
          if (payload.eventType === 'DELETE') return prev.filter((x) => x.id !== (payload.old as ProjectStage).id);
          return prev;
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_tasks' }, (payload) => {
        setProjectTasks((prev) => {
          if (payload.eventType === 'INSERT') return prev.some((x) => x.id === (payload.new as ProjectTask).id) ? prev : [...prev, payload.new as ProjectTask];
          if (payload.eventType === 'UPDATE') return prev.map((x) => (x.id === (payload.new as ProjectTask).id ? (payload.new as ProjectTask) : x));
          if (payload.eventType === 'DELETE') return prev.filter((x) => x.id !== (payload.old as ProjectTask).id);
          return prev;
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!query.trim()) { setCommentMatches([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('comments').select('task_id, text').ilike('text', `%${query}%`).limit(5);
      setCommentMatches((data as { task_id: string; text: string }[]) ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  const matchingTasks = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return tasks.filter((t) => t.title.toLowerCase().includes(q) || t.code.toLowerCase().includes(q)).slice(0, 6);
  }, [query, tasks]);
  const matchingProfiles = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return profiles.filter((p) => fullName(p).toLowerCase().includes(q) || p.email.toLowerCase().includes(q)).slice(0, 5);
  }, [query, profiles]);

  const visibleTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (fPriority && t.priority !== fPriority) return false;
      if (fOverdue && !isOverdue(t.due_date, t.status)) return false;
      return true;
    });
  }, [tasks, fPriority, fOverdue]);

  function projectProgress(projectId: string) {
    const stageIds = stages.filter((s) => s.project_id === projectId).map((s) => s.id);
    const list = projectTasks.filter((t) => stageIds.includes(t.stage_id));
    if (list.length === 0) return { pct: 0, total: 0 };
    return { pct: (list.filter((t) => t.is_done).length / list.length) * 100, total: list.length };
  }

  async function deleteTask(task: Task) {
    if (!confirm('Удалить задачу «' + task.title + '»? Это действие необратимо.')) return;
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    const { error } = await supabase.from('tasks').delete().eq('id', task.id);
    if (error) alert('Не удалось удалить задачу: ' + error.message);
  }

  async function deleteProject(project: Project) {
    if (!confirm('Удалить проект «' + project.title + '» вместе со всеми этапами и подзадачами? Это действие необратимо.')) return;
    setProjects((prev) => prev.filter((p) => p.id !== project.id));
    const { error } = await supabase.from('projects').delete().eq('id', project.id);
    if (error) alert('Не удалось удалить проект: ' + error.message);
  }

  async function approveProject(project: Project) {
    setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, approval_status: 'approved' } : p)));
    const { error } = await supabase.from('projects').update({ approval_status: 'approved' }).eq('id', project.id);
    if (error) alert('Не удалось согласовать проект: ' + error.message);
  }

  const total = tasks.length;
  const review = tasks.filter((t) => t.status === 'review').length;
  const overdue = tasks.filter((t) => isOverdue(t.due_date, t.status)).length;
  const done = tasks.filter((t) => t.status === 'done' || t.status === 'approved').length;

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Доска</h1>
          <p className="text-sm text-muted mt-0.5">Проекты, процедуры и согласования — по каждому сотруднику</p>
        </div>

        <div className="relative">
          <div className="flex items-center gap-2 bg-surface2 border border-border rounded-lg px-3 py-1.5 w-[300px]">
            🔍
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSearchOpen(!!e.target.value); }}
              onFocus={() => setSearchOpen(!!query)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
              placeholder="Поиск задач, сотрудников, комментариев..."
              className="bg-transparent outline-none text-[13px] flex-1"
            />
          </div>
          {searchOpen && (matchingTasks.length > 0 || matchingProfiles.length > 0 || commentMatches.length > 0) && (
            <div className="absolute top-[42px] right-0 w-[360px] bg-surface border border-border rounded-xl shadow-lg overflow-hidden z-40 max-h-[70vh] overflow-y-auto">
              {matchingTasks.length > 0 && <SearchGroup label="Задачи" />}
              {matchingTasks.map((t) => (
                <div key={t.id} onMouseDown={() => setOpenTaskId(t.id)} className="flex items-center gap-2 px-3.5 py-2 hover:bg-surface2 cursor-pointer text-[13px]">
                  <StatusBadge status={t.status} /> {t.title}
                </div>
              ))}
              {matchingProfiles.length > 0 && <SearchGroup label="Сотрудники" />}
              {matchingProfiles.map((p) => (
                <div key={p.id} className="flex items-center gap-2 px-3.5 py-2 text-[13px]">
                  <Avatar profile={p} size={20} /> {fullName(p) || p.email}
                </div>
              ))}
              {commentMatches.length > 0 && <SearchGroup label="Комментарии" />}
              {commentMatches.map((c, i) => (
                <div key={i} onMouseDown={() => setOpenTaskId(c.task_id)} className="px-3.5 py-2 hover:bg-surface2 cursor-pointer text-[12.5px] text-text2 truncate">
                  «{c.text}»
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2.5 mb-4">
        <Stat label="Всего задач" value={total} />
        <Stat label="Процедуры" value={review} accent />
        <Stat label="Просрочено" value={overdue} danger />
        <Stat label="Завершено" value={done} success />
      </div>

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <button onClick={() => setFilterOpen((v) => !v)} className={`text-xs font-semibold border rounded-full px-3 py-1.5 ${filterOpen ? 'bg-accentSoft border-accent text-accent' : 'border-border text-text2'}`}>⚗ Фильтры</button>
        {fPriority && <FilterChip label={PRIORITY_META[fPriority].label} onClear={() => setFPriority('')} />}
        {fOverdue && <FilterChip label="Просроченные" onClear={() => setFOverdue(false)} />}
      </div>
      {filterOpen && (
        <div className="card p-3.5 mb-5 grid grid-cols-2 gap-3">
          <div>
            <div className="text-[11px] font-semibold text-muted uppercase mb-1">Приоритет</div>
            <select value={fPriority} onChange={(e) => setFPriority(e.target.value)} className="w-full border border-border bg-surface2 rounded-md px-2 py-1.5 text-[13px]">
              <option value="">Все</option>
              {Object.entries(PRIORITY_META).map(([id, m]) => <option key={id} value={id}>{m.label}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-[13px] font-medium"><input type="checkbox" checked={fOverdue} onChange={(e) => setFOverdue(e.target.checked)} /> Только просроченные по сроку</label>
          </div>
        </div>
      )}

      {profiles.map((p) => (
        <EmployeeSection
          key={p.id}
          profile={p}
          tasks={visibleTasks.filter((t) => t.assignee_id === p.id)}
          projects={projects.filter((pr) => pr.owner_id === p.id)}
          projectProgress={projectProgress}
          isMine={me?.id === p.id}
          onOpenTask={setOpenTaskId}
          onAdd={(status) => setQuickAdd(status)}
          onAddProject={() => setAddingProject(true)}
          onDeleteTask={deleteTask}
          onDeleteProject={deleteProject}
          onApproveProject={approveProject}
        />
      ))}
      {profiles.length === 0 && <div className="text-muted text-sm text-center py-10">Пока никто не вошёл в систему</div>}

      {openTaskId && <TaskPanel taskId={openTaskId} profiles={profiles} onClose={() => setOpenTaskId(null)} />}

      {quickAdd && (
        <QuickAddModal
          status={quickAdd}
          profiles={profiles}
          onClose={() => setQuickAdd(null)}
          onCreated={(t) => { setTasks((prev) => [t, ...prev]); setQuickAdd(null); }}
        />
      )}

      {addingProject && (
        <NewProjectModal
          onClose={() => setAddingProject(false)}
          onCreated={(p) => { setProjects((prev) => [p, ...prev]); setAddingProject(false); }}
        />
      )}
    </div>
  );
}

function EmployeeSection({
  profile, tasks, projects, projectProgress, isMine, onOpenTask, onAdd, onAddProject, onDeleteTask, onDeleteProject, onApproveProject,
}: {
  profile: Profile; tasks: Task[]; projects: Project[];
  projectProgress: (id: string) => { pct: number; total: number };
  isMine: boolean; onOpenTask: (id: string) => void; onAdd: (status: string) => void; onAddProject: () => void;
  onDeleteTask: (task: Task) => void; onDeleteProject: (project: Project) => void; onApproveProject: (project: Project) => void;
}) {
  const projectsInReview = projects.filter((p) => p.approval_status === 'review');
  const doneTasksCount = tasks.filter((t) => t.status === 'done').length;
  return (
    <div className="mb-7">
      <div className="flex items-center gap-2.5 mb-2.5">
        <Avatar profile={profile} size={30} />
        <span className="font-bold text-[14.5px]">{fullName(profile) || profile.email}</span>
        <span className="text-[11.5px] text-muted bg-surface2 border border-border rounded-full px-2 py-0.5">{tasks.length + projects.length} задач</span>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        <Block color={BLOCK_COLORS.projects} label="Проекты" subtitle={BLOCK_SUBTITLES.projects} count={projects.length} isMine={isMine} onAdd={isMine ? onAddProject : undefined}>
          <MonthGroupedProjects projects={projects} projectProgress={projectProgress} isMine={isMine} onDelete={onDeleteProject} />
          {projects.length === 0 && <Empty />}
        </Block>

        <Block color={BLOCK_COLORS.review} label={STATUS_META.review.label} subtitle={BLOCK_SUBTITLES.review} count={tasks.filter((t) => t.status === 'review').length} isMine={isMine} onAdd={() => onAdd('review')}>
          <MonthGroupedTasks tasks={tasks.filter((t) => t.status === 'review')} onOpenTask={onOpenTask} isMine={isMine} onDelete={onDeleteTask} />
          {tasks.filter((t) => t.status === 'review').length === 0 && <Empty />}
        </Block>

        <Block color={BLOCK_COLORS.done} label={STATUS_META.done.label} subtitle={BLOCK_SUBTITLES.done} count={doneTasksCount + projectsInReview.length} isMine={isMine} onAdd={() => onAdd('done')}>
          {projectsInReview.map((pr) => {
            const { pct, total } = projectProgress(pr.id);
            return <ProjectApprovalCard key={pr.id} project={pr} pct={pct} subtaskCount={total} onApprove={() => onApproveProject(pr)} />;
          })}
          {tasks.filter((t) => t.status === 'done').map((t) => (
            <TaskCard key={t.id} task={t} onOpen={() => onOpenTask(t.id)} showApprovalBadge isMine={isMine} onDelete={() => onDeleteTask(t)} />
          ))}
          {doneTasksCount === 0 && projectsInReview.length === 0 && <Empty />}
        </Block>
      </div>
    </div>
  );
}

function Block({
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

function Empty() {
  return <div className="text-center py-3 text-[11px] text-muted/70">Нет задач</div>;
}

function MonthGroupedProjects({
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

function MonthGroupedTasks({
  tasks, onOpenTask, isMine, onDelete,
}: { tasks: Task[]; onOpenTask: (id: string) => void; isMine: boolean; onDelete: (task: Task) => void }) {
  const keys = sortMonthKeys(Array.from(new Set(tasks.map((t) => t.due_month ?? null))));
  return (
    <>
      {keys.map((key) => (
        <div key={key ?? 'none'} className="flex flex-col gap-2">
          <div className="text-[10.5px] font-bold text-muted uppercase tracking-wide px-0.5 -mb-1">{monthLabel(key)}</div>
          {tasks.filter((t) => (t.due_month ?? null) === key).map((t) => (
            <TaskCard key={t.id} task={t} onOpen={() => onOpenTask(t.id)} isMine={isMine} onDelete={() => onDelete(t)} />
          ))}
        </div>
      ))}
    </>
  );
}

function ProjectCard({
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

function ProjectApprovalCard({
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

function SearchGroup({ label }: { label: string }) {
  return <div className="text-[11px] font-bold text-muted uppercase px-3.5 pt-2.5 pb-1">{label}</div>;
}
function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status];
  return <span className="text-[10.5px] font-bold px-1.5 py-0.5 rounded-full flex-none" style={{ background: m.color + '22', color: m.color }}>{m.label}</span>;
}
function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium bg-accentSoft text-accent border border-accent/30 rounded-full px-3 py-1.5">
      {label} <button onClick={onClear} className="opacity-70 hover:opacity-100">✕</button>
    </span>
  );
}
function Stat({ label, value, accent, danger, success }: { label: string; value: React.ReactNode; accent?: boolean; danger?: boolean; success?: boolean }) {
  const color = danger ? 'var(--red)' : success ? 'var(--green)' : accent ? 'var(--accent)' : 'var(--text)';
  return (
    <div className="card p-3">
      <div className="text-xl font-extrabold font-mono" style={{ color }}>{value}</div>
      <div className="text-[11.5px] text-muted mt-0.5">{label}</div>
    </div>
  );
}

function TaskCard({
  task, onOpen, showApprovalBadge, isMine, onDelete,
}: { task: Task; onOpen: () => void; showApprovalBadge?: boolean; isMine?: boolean; onDelete?: () => void }) {
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
        {!showApprovalBadge && (
          <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5" style={{ background: pr.color + '22', color: pr.color }}>{pr.label}</span>
        )}
        {showApprovalBadge && (
          <span className="ml-auto text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-accentSoft text-accent">На согласовании</span>
        )}
      </div>
    </div>
  );
}
