'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { Project, Stage, Task, Profile } from '@/lib/database.types';
import { formatDate, fullName } from '@/lib/utils';
import { Avatar } from '@/components/AppShell';
import TaskPanel from '@/components/TaskPanel';

export default function ProjectDetail({
  initialProject, initialStages, initialTasks, profiles, initialSelectedStageId,
}: {
  initialProject: Project; initialStages: Stage[]; initialTasks: Task[]; profiles: Profile[]; initialSelectedStageId: string | null;
}) {
  const supabase = createClient();
  const { profile: me } = useCurrentUser();

  const [project, setProject] = useState<Project>(initialProject);
  const [stages, setStages] = useState<Stage[]>(initialStages);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(initialSelectedStageId ?? initialStages[0]?.id ?? null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [addingStage, setAddingStage] = useState(false);
  const [newStageTitle, setNewStageTitle] = useState('');

  const canManage = me?.role === 'administrator' || me?.role === 'manager';
  const isOwner = me?.id === project.assignee_id;

  // ---- Realtime ----
  useEffect(() => {
    const channel = supabase
      .channel(`project-page-${project.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'projects', filter: `id=eq.${project.id}` }, (p) => setProject(p.new as Project))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stages', filter: `project_id=eq.${project.id}` }, (p) => refreshList(p, setStages))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (p) => {
        const row = (p.eventType === 'DELETE' ? p.old : p.new) as Task;
        setStages((current) => {
          if (row.stage_id && current.some((s) => s.id === row.stage_id)) refreshList(p, setTasks);
          return current;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function refreshList<T extends { id: string }>(payload: any, setter: React.Dispatch<React.SetStateAction<T[]>>) {
    setter((prev) => {
      if (payload.eventType === 'INSERT') return prev.some((x) => x.id === payload.new.id) ? prev : [...prev, payload.new as T];
      if (payload.eventType === 'UPDATE') return prev.map((x) => (x.id === payload.new.id ? (payload.new as T) : x));
      if (payload.eventType === 'DELETE') return prev.filter((x) => x.id !== payload.old.id);
      return prev;
    });
  }

  const tasksByStage = useMemo(() => {
    const map = new Map<string, Task[]>();
    tasks.forEach((t) => {
      if (!t.stage_id) return;
      const list = map.get(t.stage_id) ?? [];
      list.push(t);
      map.set(t.stage_id, list);
    });
    return map;
  }, [tasks]);

  const totalTasks = tasks.length;
  const totalDone = tasks.filter((t) => t.status === 'done').length;
  const overallProgress = totalTasks ? Math.round((totalDone / totalTasks) * 100) : 0;

  const selectedStage = stages.find((s) => s.id === selectedStageId) ?? null;
  const selectedIndex = stages.findIndex((s) => s.id === selectedStageId);
  const selectedStageTasks = selectedStage ? (tasksByStage.get(selectedStage.id) ?? []) : [];
  const selectedStageDone = selectedStageTasks.filter((t) => t.status === 'done').length;
  const selectedStageProgress = selectedStageTasks.length ? Math.round((selectedStageDone / selectedStageTasks.length) * 100) : 0;

  async function updateProjectField(patch: Partial<Project>) {
    setProject({ ...project, ...patch });
    await supabase.from('projects').update(patch).eq('id', project.id);
  }

  async function addStage() {
    if (!newStageTitle.trim()) return;
    const { data } = await supabase.from('stages').insert({ project_id: project.id, title: newStageTitle.trim(), position: stages.length }).select().single();
    if (data) setSelectedStageId((data as Stage).id);
    setNewStageTitle('');
    setAddingStage(false);
  }

  async function deleteStage(stage: Stage) {
    if (!confirm(`Удалить этап «${stage.title}» вместе со всеми задачами внутри?`)) return;
    await supabase.from('stages').delete().eq('id', stage.id);
    if (selectedStageId === stage.id) setSelectedStageId(null);
  }

  async function renameStage(stage: Stage, title: string) {
    if (!title.trim() || title === stage.title) return;
    await supabase.from('stages').update({ title: title.trim() }).eq('id', stage.id);
  }

  async function addTask() {
    if (!newTaskTitle.trim() || !me || !selectedStage) return;
    await supabase.from('tasks').insert({
      title: newTaskTitle.trim(), stage_id: selectedStage.id, status: 'todo', priority: 'medium',
      assignee_id: me.id, reporter_id: me.id,
    });
    setNewTaskTitle('');
  }

  async function toggleTask(task: Task, e: React.MouseEvent) {
    e.stopPropagation();
    await supabase.from('tasks').update({ status: task.status === 'done' ? 'todo' : 'done' }).eq('id', task.id);
  }

  async function sendStageToReview(stage: Stage) { await supabase.from('stages').update({ status: 'on_review' }).eq('id', stage.id); }
  async function approveStage(stage: Stage) { await supabase.from('stages').update({ status: 'approved' }).eq('id', stage.id); }
  async function reworkStage(stage: Stage) { await supabase.from('stages').update({ status: 'in_progress' }).eq('id', stage.id); }

  async function deleteProject() {
    if (!confirm(`Удалить проект «${project.title}» вместе со всеми этапами и задачами?`)) return;
    await supabase.from('projects').delete().eq('id', project.id);
    window.location.href = '/board';
  }

  const assignee = profiles.find((p) => p.id === project.assignee_id);
  const approved = project.status === 'approved';

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <Link href="/board" className="text-[13px] text-muted hover:text-text inline-flex items-center gap-1 mb-4">← К списку проектов</Link>

      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <input
              defaultValue={project.title}
              onBlur={(e) => e.target.value !== project.title && updateProjectField({ title: e.target.value })}
              className="text-xl font-extrabold outline-none bg-transparent"
              style={{ minWidth: '200px' }}
            />
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#7C4FE022', color: '#7C4FE0' }}>Проект</span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: (approved ? '#16A34A' : '#C77C0A') + '22', color: approved ? '#16A34A' : '#C77C0A' }}>
              {approved ? 'Согласовано' : 'В работе'}
            </span>
          </div>
          <div className="text-[13px] text-muted flex items-center gap-3 flex-wrap">
            <span>🗓 {formatDate(project.created_at)} – {formatDate(project.due_date)}</span>
            <span>Ответственный: {assignee ? fullName(assignee) : '—'}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[11px] text-muted">Общий прогресс</div>
            <div className="text-xl font-extrabold" style={{ color: '#7C4FE0' }}>{overallProgress}%</div>
            <div className="w-[140px] h-1.5 bg-surface2 rounded-full mt-1 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${overallProgress}%`, background: '#7C4FE0' }} />
            </div>
          </div>
          <button onClick={() => setAddingStage(true)} className="text-xs font-semibold bg-accent text-white rounded-lg px-3 py-2 whitespace-nowrap">+ Добавить этап</button>
          {(me?.id === project.reporter_id || canManage) && (
            <button onClick={deleteProject} title="Удалить проект" className="text-muted hover:text-red w-8 h-8 flex-none">🗑</button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_1fr] gap-4">

        {/* ---- Этапы проекта ---- */}
        <div className="card p-4">
          <div className="text-[13px] font-bold mb-0.5">2. Этапы проекта <span className="text-muted font-normal">{stages.length} этап{stages.length === 1 ? '' : 'ов'}</span></div>
          <div className="text-[11.5px] text-muted mb-3">Крупные направления работы по проекту</div>

          <div className="flex flex-col gap-2">
            {stages.map((stage, i) => {
              const stageTasks = tasksByStage.get(stage.id) ?? [];
              const doneCount = stageTasks.filter((t) => t.status === 'done').length;
              const progress = stageTasks.length ? Math.round((doneCount / stageTasks.length) * 100) : 0;
              const visual = stageVisual(stage, progress);
              const selected = stage.id === selectedStageId;
              return (
                <div
                  key={stage.id}
                  onClick={() => setSelectedStageId(stage.id)}
                  className={`border rounded-xl p-3 cursor-pointer transition-colors ${selected ? 'border-accent bg-accentSoft' : 'border-border hover:bg-surface2'}`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-none" style={{ background: visual.color }}>{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <input
                        defaultValue={stage.title}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={(e) => renameStage(stage, e.target.value)}
                        className="text-[13.5px] font-semibold bg-transparent outline-none w-full"
                      />
                      <div className="text-[11px] text-muted">Задач: {doneCount}/{stageTasks.length}</div>
                    </div>
                    <span className="text-[10.5px] font-bold px-1.5 py-0.5 rounded-full flex-none" style={{ background: visual.color + '22', color: visual.color }}>{visual.label}</span>
                    {canManage && (
                      <button onClick={(e) => { e.stopPropagation(); deleteStage(stage); }} className="text-muted hover:text-red text-xs px-1 flex-none">🗑</button>
                    )}
                  </div>
                  <div className="w-full h-1.5 bg-surface2 rounded-full mt-2 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${progress}%`, background: visual.color }} />
                  </div>
                </div>
              );
            })}
            {stages.length === 0 && <div className="text-center py-6 text-[12px] text-muted">Этапов пока нет — добавьте первый</div>}

            {addingStage && (
              <div className="flex gap-2 mt-1">
                <input
                  autoFocus
                  value={newStageTitle}
                  onChange={(e) => setNewStageTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addStage()}
                  onBlur={() => { if (!newStageTitle.trim()) setAddingStage(false); }}
                  placeholder="Название этапа…"
                  className="flex-1 border border-border bg-surface2 rounded-md px-2.5 py-1.5 text-[13px]"
                />
                <button onClick={addStage} className="px-3 border border-border rounded-md text-sm">Добавить</button>
              </div>
            )}
          </div>
        </div>

        {/* ---- Задачи выбранного этапа ---- */}
        <div className="card p-4">
          {selectedStage ? (
            <>
              <div className="flex items-start justify-between mb-0.5">
                <div className="text-[13px] font-bold">{selectedIndex + 1}. Задачи этапа <span className="text-muted font-normal">{selectedStageTasks.length} задач</span></div>
                <div className="text-right">
                  <div className="text-[11px] text-muted">Прогресс этапа</div>
                  <div className="text-[13px] font-bold" style={{ color: stageVisual(selectedStage, selectedStageProgress).color }}>{selectedStageProgress}%</div>
                </div>
              </div>
              <div className="text-[11.5px] text-muted mb-3">{selectedStage.title}</div>

              <div className="flex flex-col gap-1 mb-3">
                {selectedStageTasks.map((t) => (
                  <div key={t.id} onClick={() => setOpenTaskId(t.id)} className="flex items-center gap-2.5 py-2 border-b border-border cursor-pointer hover:bg-surface2 rounded-md px-1.5 -mx-1.5">
                    <button onClick={(e) => toggleTask(t, e)} className="w-5 h-5 rounded-full border flex-none flex items-center justify-center text-[11px]"
                      style={{ borderColor: t.status === 'done' ? '#16A34A' : 'var(--border-strong, #999)', background: t.status === 'done' ? '#16A34A' : 'transparent', color: '#fff' }}>
                      {t.status === 'done' && '✓'}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className={`text-[13px] font-medium truncate ${t.status === 'done' ? 'line-through text-muted' : ''}`}>{t.title}</div>
                      {t.description && <div className="text-[11px] text-muted truncate">{t.description}</div>}
                      {t.due_date && <div className="text-[11px] text-muted">🗓 {formatDate(t.due_date)}</div>}
                    </div>
                    <Avatar profile={profiles.find((p) => p.id === t.assignee_id)} size={22} />
                  </div>
                ))}
                {selectedStageTasks.length === 0 && <div className="text-center py-6 text-[12px] text-muted">Задач пока нет</div>}
              </div>

              <div className="flex gap-2 mb-3">
                <input
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTask()}
                  placeholder="Добавить задачу…"
                  className="flex-1 border border-border bg-surface2 rounded-md px-2.5 py-1.5 text-[13px]"
                />
                <button onClick={addTask} className="px-3 border border-border rounded-md text-sm">+ Добавить задачу</button>
              </div>

              {selectedStage.status === 'in_progress' && selectedStageTasks.length > 0 && selectedStageDone === selectedStageTasks.length && (isOwner || canManage) && (
                <button onClick={() => sendStageToReview(selectedStage)} className="w-full text-xs font-semibold bg-accent text-white rounded-md px-2.5 py-2">
                  Отправить на согласование
                </button>
              )}
              {selectedStage.status === 'on_review' && canManage && (
                <div className="flex gap-2">
                  <button onClick={() => approveStage(selectedStage)} className="flex-1 text-xs font-semibold bg-green text-white rounded-md px-2.5 py-2">✓ Согласовать</button>
                  <button onClick={() => reworkStage(selectedStage)} className="flex-1 text-xs font-semibold border border-border rounded-md px-2.5 py-2">↩ На доработку</button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-10 text-[13px] text-muted">Выберите этап слева, чтобы увидеть задачи</div>
          )}
        </div>
      </div>

      {/* ---- О проекте ---- */}
      <div className="card p-4 mt-4">
        <div className="text-[13px] font-bold mb-2">О проекте</div>
        <textarea
          defaultValue={project.description}
          onBlur={(e) => e.target.value !== project.description && updateProjectField({ description: e.target.value })}
          placeholder="Описание проекта…"
          className="w-full border border-border bg-surface2 rounded-lg p-2.5 text-[13px] min-h-[50px] mb-3"
        />
        <div className="flex items-center gap-6 flex-wrap text-[12.5px]">
          <Metric icon="🗓" label="Старт проекта" value={formatDate(project.created_at)} />
          <Metric icon="🏁" label="Завершение" value={formatDate(project.due_date)} />
          <Metric icon="👤" label="Ответственный" value={assignee ? fullName(assignee) : '—'} />
          <Metric icon="📋" label="Всего задач" value={String(totalTasks)} />
          <Metric icon="📈" label="Общий прогресс" value={`${overallProgress}%`} />
        </div>
      </div>

      {openTaskId && <TaskPanel taskId={openTaskId} profiles={profiles} stages={stages} onClose={() => setOpenTaskId(null)} />}
    </div>
  );
}

function stageVisual(stage: Stage, progress: number): { label: string; color: string } {
  if (stage.status === 'approved') return { label: 'Согласовано', color: '#16A34A' };
  if (stage.status === 'on_review') return { label: 'На согласовании', color: '#2F5FE0' };
  if (progress === 100) return { label: 'Завершено', color: '#16A34A' };
  if (progress > 0) return { label: 'В работе', color: '#C77C0A' };
  return { label: 'Не начато', color: '#868C97' };
}

function Metric({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span>{icon}</span>
      <span className="text-muted">{label}:</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
