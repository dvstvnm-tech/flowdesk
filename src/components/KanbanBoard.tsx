'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { Task, Profile, Subtask } from '@/lib/database.types';
import { STATUS_META, PRIORITY_META, formatDate, isOverdue, fullName } from '@/lib/utils';
import { Avatar } from '@/components/AppShell';
import TaskPanel from '@/components/TaskPanel';
import QuickAddModal from '@/components/QuickAddModal';

// Компактные блоки под каждым сотрудником (без "Проекты" — та рисуется отдельно, во всю ширину)
const COMPACT_BLOCK_STATUSES = ['review', 'done'] as const;

export default function KanbanBoard({
  initialTasks, profiles, initialSubtasks,
}: { initialTasks: Task[]; profiles: Profile[]; initialSubtasks: Subtask[] }) {
  const supabase = createClient();
  const { profile: me } = useCurrentUser();
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [subtasks, setSubtasks] = useState<Subtask[]>(initialSubtasks);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [quickAdd, setQuickAdd] = useState<string | null>(null); // статус, для которого открыта форма

  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [commentMatches, setCommentMatches] = useState<{ task_id: string; text: string }[]>([]);

  const [filterOpen, setFilterOpen] = useState(false);
  const [fPriority, setFPriority] = useState('');
  const [fOverdue, setFOverdue] = useState(false);

  // ---- Realtime: вся доска общая — синхронизируем изменения задач у всех пользователей ----
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

  // ---- Realtime: подзадачи (мини-блоки под задачами "Проекты") ----
  useEffect(() => {
    const channel = supabase
      .channel('subtasks-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subtasks' }, (payload) => {
        setSubtasks((prev) => {
          if (payload.eventType === 'INSERT') {
            if (prev.some((s) => s.id === (payload.new as Subtask).id)) return prev;
            return [...prev, payload.new as Subtask];
          }
          if (payload.eventType === 'UPDATE') {
            return prev.map((s) => (s.id === (payload.new as Subtask).id ? (payload.new as Subtask) : s));
          }
          if (payload.eventType === 'DELETE') {
            return prev.filter((s) => s.id !== (payload.old as Subtask).id);
          }
          return prev;
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Поиск: задачи и сотрудники — локально; комментарии — отдельным запросом к Supabase ----
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

  const subtasksByTask = useMemo(() => {
    const map = new Map<string, Subtask[]>();
    subtasks.forEach((s) => {
      const list = map.get(s.task_id) ?? [];
      list.push(s);
      map.set(s.task_id, list);
    });
    map.forEach((list) => list.sort((a, b) => a.position - b.position));
    return map;
  }, [subtasks]);

  async function addSubtask(taskId: string, title: string) {
    const existing = subtasksByTask.get(taskId) ?? [];
    await supabase.from('subtasks').insert({ task_id: taskId, title, position: existing.length });
  }

  const total = tasks.length;
  const projectsCount = tasks.filter((t) => t.status === 'backlog').length;
  const procedures = tasks.filter((t) => t.status === 'review').length;
  const overdue = tasks.filter((t) => isOverdue(t.due_date, t.status)).length;
  const done = tasks.filter((t) => t.status === 'done' || t.status === 'approved').length;

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
          tasks={visibleTasks.filter((t) => t.assignee_id === p.id)}
          subtasksByTask={subtasksByTask}
          isMine={me?.id === p.id}
          onOpenTask={setOpenTaskId}
          onAdd={(status) => setQuickAdd(status)}
          onAddSubtask={addSubtask}
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
    </div>
  );
}

function EmployeeSection({
  profile, tasks, subtasksByTask, isMine, onOpenTask, onAdd, onAddSubtask,
}: {
  profile: Profile; tasks: Task[]; subtasksByTask: Map<string, Subtask[]>; isMine: boolean;
  onOpenTask: (id: string) => void; onAdd: (status: string) => void; onAddSubtask: (taskId: string, title: string) => void;
}) {
  const projectTasks = tasks.filter((t) => t.status === 'backlog');
  return (
    <div className="mb-7">
      <div className="flex items-center gap-2.5 mb-2.5">
        <Avatar profile={profile} size={30} />
        <span className="font-bold text-[14.5px]">{fullName(profile) || profile.email}</span>
        <span className="text-[11.5px] text-muted bg-surface2 border border-border rounded-full px-2 py-0.5">{tasks.length} задач</span>
      </div>

      <div className="bg-surface2 border border-border rounded-2xl p-2.5 mb-2.5">
        <div className="flex items-center gap-2 px-1.5 pb-2.5">
          <span className="w-2 h-2 rounded-full" style={{ background: STATUS_META.backlog.color }} />
          <span className="font-bold text-[12px]">{STATUS_META.backlog.label}</span>
          <span className="ml-auto text-[11px] text-muted bg-surface border border-border rounded-full px-1.5">{projectTasks.length}</span>
          {isMine && <button onClick={() => onAdd('backlog')} className="text-muted hover:text-accent text-sm px-0.5">+</button>}
        </div>
        <div className="flex flex-col gap-2">
          {projectTasks.map((t) => (
            <div key={t.id} className="flex items-start gap-2 flex-wrap">
              <TaskCard task={t} onOpen={() => onOpenTask(t.id)} />
              {(subtasksByTask.get(t.id) ?? []).map((s, i) => (
                <SubtaskChip key={s.id} index={i + 1} subtask={s} onOpen={() => onOpenTask(t.id)} />
              ))}
              {isMine && <InlineAddSubtask taskId={t.id} nextIndex={(subtasksByTask.get(t.id) ?? []).length + 1} onAdd={onAddSubtask} />}
            </div>
          ))}
          {projectTasks.length === 0 && <div className="text-center py-3 text-[11px] text-muted/70">Нет задач</div>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {COMPACT_BLOCK_STATUSES.map((status) => {
          const meta = STATUS_META[status];
          const blockTasks = tasks.filter((t) => t.status === status);
          return (
            <div key={status} className="bg-surface2 border border-border rounded-2xl p-2.5">
              <div className="flex items-center gap-2 px-1.5 pb-2.5">
                <span className="w-2 h-2 rounded-full" style={{ background: meta.color }} />
                <span className="font-bold text-[12px]">{meta.label}</span>
                <span className="ml-auto text-[11px] text-muted bg-surface border border-border rounded-full px-1.5">{blockTasks.length}</span>
                {isMine && <button onClick={() => onAdd(status)} className="text-muted hover:text-accent text-sm px-0.5">+</button>}
              </div>
              <div className="flex flex-col gap-2 min-h-[20px]">
                {blockTasks.map((t) => <TaskCard key={t.id} task={t} onOpen={() => onOpenTask(t.id)} />)}
                {blockTasks.length === 0 && <div className="text-center py-3 text-[11px] text-muted/70">Нет задач</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SubtaskChip({ index, subtask, onOpen }: { index: number; subtask: Subtask; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="bg-surface border border-border rounded-[10px] p-2 text-left w-[150px] flex-none"
    >
      <p className="text-[11px] text-muted mb-1">Подзадача {index}</p>
      <p className={`text-[12.5px] ${subtask.is_done ? 'line-through text-muted' : ''}`}>{subtask.title}</p>
    </button>
  );
}

function InlineAddSubtask({ taskId, nextIndex, onAdd }: { taskId: string; nextIndex: number; onAdd: (taskId: string, title: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');

  function submit() {
    if (!value.trim()) { setOpen(false); return; }
    onAdd(taskId, value.trim());
    setValue('');
    setOpen(false);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-9 h-9 flex-none self-center text-muted hover:text-accent border border-border rounded-full text-sm">+</button>
    );
  }
  return (
    <div className="bg-surface border border-border rounded-[10px] p-2 w-[150px] flex-none">
      <p className="text-[11px] text-muted mb-1">Подзадача {nextIndex}</p>
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setOpen(false); }}
        onBlur={submit}
        placeholder="Текст…"
        className="w-full bg-transparent outline-none text-[12.5px]"
      />
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

function TaskCard({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const pr = PRIORITY_META[task.priority];
  const overdue = isOverdue(task.due_date, task.status);
  return (
    <div
      onClick={onOpen}
      className="bg-surface border border-border rounded-[10px] p-2.5 cursor-pointer shadow-sm hover:shadow transition-shadow w-[190px] flex-none"
      style={{ borderLeft: `3px solid ${pr.color}` }}
    >
      <div className="text-[13px] font-semibold mb-2">{task.title}</div>
      <span className={`text-[11px] flex items-center gap-1 ${overdue ? 'text-red font-semibold' : 'text-muted'}`}>🕐 {formatDate(task.due_date)}</span>
    </div>
  );
}
