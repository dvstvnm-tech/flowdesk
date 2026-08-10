'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { Task, Profile, Project, Stage } from '@/lib/database.types';
import { STATUS_META, PRIORITY_META, formatDate, isOverdue, fullName } from '@/lib/utils';
import { Avatar } from '@/components/AppShell';
import TaskPanel from '@/components/TaskPanel';
import QuickAddModal from '@/components/QuickAddModal';
import ProjectQuickAddModal from '@/components/ProjectQuickAddModal';

// Компактные блоки со статусами "Процедуры" на общей доске (карточка "Проекты" рисуется отдельно)
const PROCEDURE_STATUS = 'review';
const PROCEDURE_DONE_STATUS = 'done';

export default function KanbanBoard({
  initialTasks, profiles, initialProjects, initialStages,
}: { initialTasks: Task[]; profiles: Profile[]; initialProjects: Project[]; initialStages: Stage[] }) {
  const supabase = createClient();
  const router = useRouter();
  const { profile: me } = useCurrentUser();
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [stages, setStages] = useState<Stage[]>(initialStages);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [quickAdd, setQuickAdd] = useState<string | null>(null); // статус процедуры, для которой открыта форма
  const [projectQuickAddFor, setProjectQuickAddFor] = useState<string | null>(null); // id сотрудника

  function openProject(id: string, stageId?: string) {
    router.push(`/projects/${id}${stageId ? `?stage=${stageId}` : ''}`);
  }

  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [commentMatches, setCommentMatches] = useState<{ task_id: string; text: string }[]>([]);

  const [filterOpen, setFilterOpen] = useState(false);
  const [fPriority, setFPriority] = useState('');
  const [fOverdue, setFOverdue] = useState(false);

  // ---- Realtime: задачи (процедуры + задачи внутри этапов) ----
  useEffect(() => {
    const channel = supabase
      .channel('tasks-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
        setTasks((prev) => {
          if (payload.eventType === 'INSERT') {
            if (prev.some((t) => t.id === (payload.new as Task).id)) return prev;
            return [payload.new as Task, ...prev];
          }
          if (payload.eventType === 'UPDATE') {
            return prev.map((t) => (t.id === (payload.new as Task).id ? (payload.new as Task) : t));
          }
          if (payload.eventType === 'DELETE') {
            return prev.filter((t) => t.id !== (payload.old as Task).id);
          }
          return prev;
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Realtime: проекты ----
  useEffect(() => {
    const channel = supabase
      .channel('projects-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, (payload) => {
        setProjects((prev) => {
          if (payload.eventType === 'INSERT') {
            if (prev.some((p) => p.id === (payload.new as Project).id)) return prev;
            return [payload.new as Project, ...prev];
          }
          if (payload.eventType === 'UPDATE') {
            return prev.map((p) => (p.id === (payload.new as Project).id ? (payload.new as Project) : p));
          }
          if (payload.eventType === 'DELETE') {
            return prev.filter((p) => p.id !== (payload.old as Project).id);
          }
          return prev;
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Realtime: этапы ----
  useEffect(() => {
    const channel = supabase
      .channel('stages-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stages' }, (payload) => {
        setStages((prev) => {
          if (payload.eventType === 'INSERT') {
            if (prev.some((s) => s.id === (payload.new as Stage).id)) return prev;
            return [...prev, payload.new as Stage];
          }
          if (payload.eventType === 'UPDATE') {
            return prev.map((s) => (s.id === (payload.new as Stage).id ? (payload.new as Stage) : s));
          }
          if (payload.eventType === 'DELETE') {
            return prev.filter((s) => s.id !== (payload.old as Stage).id);
          }
          return prev;
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Поиск: задачи, проекты и сотрудники — локально; комментарии — отдельным запросом ----
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
    return tasks.filter((t) => !t.stage_id && (t.title.toLowerCase().includes(q) || t.code.toLowerCase().includes(q))).slice(0, 6);
  }, [query, tasks]);
  const matchingProjects = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return projects.filter((p) => p.title.toLowerCase().includes(q)).slice(0, 6);
  }, [query, projects]);
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

  const stagesByProject = useMemo(() => {
    const map = new Map<string, Stage[]>();
    stages.forEach((s) => {
      const list = map.get(s.project_id) ?? [];
      list.push(s);
      map.set(s.project_id, list);
    });
    map.forEach((list) => list.sort((a, b) => a.position - b.position));
    return map;
  }, [stages]);

  const stageTasksByStage = useMemo(() => {
    const map = new Map<string, Task[]>();
    tasks.forEach((t) => {
      if (!t.stage_id) return;
      const list = map.get(t.stage_id) ?? [];
      list.push(t);
      map.set(t.stage_id, list);
    });
    return map;
  }, [tasks]);

  const total = tasks.filter((t) => !t.stage_id).length;
  const projectsCount = projects.length;
  const procedures = tasks.filter((t) => t.status === PROCEDURE_STATUS).length;
  const overdue = tasks.filter((t) => !t.stage_id && isOverdue(t.due_date, t.status)).length
    + projects.filter((p) => isOverdue(p.due_date, p.status === 'approved' ? 'done' : 'active')).length;
  const done = tasks.filter((t) => !t.stage_id && (t.status === 'done' || t.status === 'approved')).length
    + projects.filter((p) => p.status === 'approved').length;

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Доска</h1>
          <p className="text-sm text-muted mt-0.5">Задачи каждого сотрудника — сгруппированы по человеку</p>
        </div>

        <div className="relative">
          <div className="flex items-center gap-2 bg-surface2 border border-border rounded-lg px-3 py-1.5 w-[300px]">
            🔍
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSearchOpen(!!e.target.value); }}
              onFocus={() => setSearchOpen(!!query)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
              placeholder="Поиск задач, проектов, сотрудников..."
              className="bg-transparent outline-none text-[13px] flex-1"
            />
          </div>
          {searchOpen && (matchingTasks.length > 0 || matchingProjects.length > 0 || matchingProfiles.length > 0 || commentMatches.length > 0) && (
            <div className="absolute top-[42px] right-0 w-[360px] bg-surface border border-border rounded-xl shadow-lg overflow-hidden z-40 max-h-[70vh] overflow-y-auto">
              {matchingProjects.length > 0 && <SearchGroup label="Проекты" />}
              {matchingProjects.map((p) => (
                <div key={p.id} onMouseDown={() => openProject(p.id)} className="flex items-center gap-2 px-3.5 py-2 hover:bg-surface2 cursor-pointer text-[13px]">
                  <span className="w-2 h-2 rounded-full flex-none" style={{ background: '#7C4FE0' }} /> {p.title}
                </div>
              ))}
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

      <div className="grid grid-cols-5 gap-2.5 mb-4">
        <Stat label="Всего задач" value={total} />
        <Stat label="Проекты" value={projectsCount} accent />
        <Stat label="Процедуры" value={procedures} />
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
          procedureTasks={visibleTasks.filter((t) => t.assignee_id === p.id && !t.stage_id)}
          employeeProjects={projects.filter((pr) => pr.assignee_id === p.id)}
          stagesByProject={stagesByProject}
          stageTasksByStage={stageTasksByStage}
          isMine={me?.id === p.id}
          onOpenTask={setOpenTaskId}
          onOpenProject={openProject}
          onAdd={(status) => setQuickAdd(status)}
          onAddProject={() => setProjectQuickAddFor(p.id)}
        />
      ))}
      {profiles.length === 0 && <div className="text-muted text-sm text-center py-10">Пока никто не вошёл в систему</div>}

      {openTaskId && <TaskPanel taskId={openTaskId} profiles={profiles} stages={stages} onClose={() => setOpenTaskId(null)} />}

      {quickAdd && (
        <QuickAddModal
          status={quickAdd}
          profiles={profiles}
          onClose={() => setQuickAdd(null)}
          onCreated={(t) => { setTasks((prev) => [t, ...prev]); setQuickAdd(null); }}
        />
      )}

      {projectQuickAddFor && (
        <ProjectQuickAddModal
          onClose={() => setProjectQuickAddFor(null)}
          onCreated={(pr) => { setProjects((prev) => [pr, ...prev]); setProjectQuickAddFor(null); }}
        />
      )}
    </div>
  );
}

function EmployeeSection({
  profile, procedureTasks, employeeProjects, stagesByProject, stageTasksByStage, isMine, onOpenTask, onOpenProject, onAdd, onAddProject,
}: {
  profile: Profile; procedureTasks: Task[]; employeeProjects: Project[];
  stagesByProject: Map<string, Stage[]>; stageTasksByStage: Map<string, Task[]>; isMine: boolean;
  onOpenTask: (id: string) => void; onOpenProject: (id: string, stageId?: string) => void; onAdd: (status: string) => void; onAddProject: () => void;
}) {
  const totalCount = procedureTasks.length + employeeProjects.length;

  const proceduresInProgress = procedureTasks.filter((t) => t.status === PROCEDURE_STATUS);
  const proceduresDone = procedureTasks.filter((t) => t.status === PROCEDURE_DONE_STATUS);

  const stagesOnReview = employeeProjects.flatMap((pr) =>
    (stagesByProject.get(pr.id) ?? []).filter((s) => s.status === 'on_review').map((s) => ({ stage: s, project: pr }))
  );

  return (
    <div className="mb-7">
      <div className="flex items-center gap-2.5 mb-2.5">
        <Avatar profile={profile} size={30} />
        <span className="font-bold text-[14.5px]">{fullName(profile) || profile.email}</span>
        <span className="text-[11.5px] text-muted bg-surface2 border border-border rounded-full px-2 py-0.5">{totalCount} задач</span>
      </div>

      <div className="grid grid-cols-3 gap-2.5">

        {/* ---- Проекты ---- */}
        <div className="bg-surface2 border border-border rounded-2xl p-2.5">
          <div className="flex items-center gap-2 px-1.5 pb-2.5">
            <span className="w-2 h-2 rounded-full" style={{ background: '#7C4FE0' }} />
            <span className="font-bold text-[12px]">Проекты</span>
            <span className="ml-auto text-[11px] text-muted bg-surface border border-border rounded-full px-1.5">{employeeProjects.length}</span>
            {isMine && <button onClick={onAddProject} className="text-muted hover:text-accent text-sm px-0.5">+</button>}
          </div>
          <div className="flex flex-col gap-2 min-h-[20px]">
            {employeeProjects.map((pr) => (
              <ProjectCard
                key={pr.id}
                project={pr}
                stageCount={(stagesByProject.get(pr.id) ?? []).length}
                onOpen={() => onOpenProject(pr.id)}
              />
            ))}
            {employeeProjects.length === 0 && <div className="text-center py-3 text-[11px] text-muted/70">Нет задач</div>}
          </div>
        </div>

        {/* ---- Процедуры ---- */}
        <div className="bg-surface2 border border-border rounded-2xl p-2.5">
          <div className="flex items-center gap-2 px-1.5 pb-2.5">
            <span className="w-2 h-2 rounded-full" style={{ background: STATUS_META.review.color }} />
            <span className="font-bold text-[12px]">Процедуры</span>
            <span className="ml-auto text-[11px] text-muted bg-surface border border-border rounded-full px-1.5">{proceduresInProgress.length}</span>
            {isMine && <button onClick={() => onAdd(PROCEDURE_STATUS)} className="text-muted hover:text-accent text-sm px-0.5">+</button>}
          </div>
          <div className="flex flex-col gap-2 min-h-[20px]">
            {proceduresInProgress.map((t) => <TaskCard key={t.id} task={t} onOpen={() => onOpenTask(t.id)} />)}
            {proceduresInProgress.length === 0 && <div className="text-center py-3 text-[11px] text-muted/70">Нет задач</div>}
          </div>
        </div>

        {/* ---- На согласование ---- */}
        <div className="bg-surface2 border border-border rounded-2xl p-2.5">
          <div className="flex items-center gap-2 px-1.5 pb-2.5">
            <span className="w-2 h-2 rounded-full" style={{ background: STATUS_META.done.color }} />
            <span className="font-bold text-[12px]">На согласование</span>
            <span className="ml-auto text-[11px] text-muted bg-surface border border-border rounded-full px-1.5">{proceduresDone.length + stagesOnReview.length}</span>
          </div>
          <div className="flex flex-col gap-2 min-h-[20px]">
            {stagesOnReview.map(({ stage, project }) => (
              <ReviewCard key={stage.id} title={stage.title} subtitle={`проект «${project.title}»`} onOpen={() => onOpenProject(project.id, stage.id)} />
            ))}
            {proceduresDone.map((t) => <TaskCard key={t.id} task={t} onOpen={() => onOpenTask(t.id)} />)}
            {proceduresDone.length === 0 && stagesOnReview.length === 0 && <div className="text-center py-3 text-[11px] text-muted/70">Нет задач</div>}
          </div>
        </div>

      </div>
    </div>
  );
}

function ProjectCard({ project, stageCount, onOpen }: { project: Project; stageCount: number; onOpen: () => void }) {
  const approved = project.status === 'approved';
  return (
    <div
      onClick={onOpen}
      className="bg-surface border border-border rounded-[10px] p-2.5 cursor-pointer shadow-sm hover:shadow transition-shadow"
      style={{ borderLeft: `3px solid ${approved ? 'var(--green)' : '#7C4FE0'}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[13px] font-semibold">{project.title}</div>
        {approved && <span className="text-[11px] font-bold text-green flex-none">✓</span>}
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className={`text-[11px] flex items-center gap-1 ${isOverdue(project.due_date, approved ? 'done' : 'active') ? 'text-red font-semibold' : 'text-muted'}`}>🕐 {formatDate(project.due_date)}</span>
        <span className="text-[11px] text-muted bg-surface2 border border-border rounded-full px-1.5">{stageCount} {pluralStages(stageCount)}</span>
      </div>
    </div>
  );
}

function ReviewCard({ title, subtitle, onOpen }: { title: string; subtitle: string; onOpen: () => void }) {
  return (
    <div
      onClick={onOpen}
      className="bg-surface border border-border rounded-[10px] p-2.5 cursor-pointer shadow-sm hover:shadow transition-shadow"
      style={{ borderLeft: '3px solid var(--accent)' }}
    >
      <div className="text-[13px] font-semibold mb-1">{title}</div>
      <div className="text-[11px] text-muted">{subtitle}</div>
    </div>
  );
}

function pluralStages(n: number): string {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'этап';
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'этапа';
  return 'этапов';
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

function TaskCard({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const pr = PRIORITY_META[task.priority];
  const overdue = isOverdue(task.due_date, task.status);
  return (
    <div
      onClick={onOpen}
      className="bg-surface border border-border rounded-[10px] p-2.5 cursor-pointer shadow-sm hover:shadow transition-shadow"
      style={{ borderLeft: `3px solid ${pr.color}` }}
    >
      <div className="text-[13px] font-semibold mb-2">{task.title}</div>
      <span className={`text-[11px] flex items-center gap-1 ${overdue ? 'text-red font-semibold' : 'text-muted'}`}>🕐 {formatDate(task.due_date)}</span>
    </div>
  );
}
