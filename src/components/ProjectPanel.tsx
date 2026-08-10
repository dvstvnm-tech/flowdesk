'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { Project, Stage, Task, Profile } from '@/lib/database.types';
import { formatDate, fullName } from '@/lib/utils';
import { Avatar } from '@/components/AppShell';

export default function ProjectPanel({
  projectId, profiles, onClose, onOpenTask,
}: { projectId: string; profiles: Profile[]; onClose: () => void; onOpenTask: (id: string) => void }) {
  const supabase = createClient();
  const { profile: me } = useCurrentUser();

  const [project, setProject] = useState<Project | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newStageTitle, setNewStageTitle] = useState('');

  const canManage = me?.role === 'administrator' || me?.role === 'manager';
  const isOwner = me?.id === project?.assignee_id;

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: proj } = await supabase.from('projects').select('*').eq('id', projectId).single();
      const { data: stg } = await supabase.from('stages').select('*').eq('project_id', projectId).order('position');
      if (!active) return;
      setProject(proj as Project);
      const stageList = (stg as Stage[]) ?? [];
      setStages(stageList);
      if (stageList.length) {
        const { data: t } = await supabase.from('tasks').select('*').in('stage_id', stageList.map((s) => s.id)).order('position');
        if (active) setTasks((t as Task[]) ?? []);
      } else {
        setTasks([]);
      }
    }
    load();

    const channel = supabase
      .channel(`project-detail-${projectId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'projects', filter: `id=eq.${projectId}` }, (p) => setProject(p.new as Project))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stages', filter: `project_id=eq.${projectId}` }, (p) => refreshList(p, setStages))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (p) => {
        const row = (p.eventType === 'DELETE' ? p.old : p.new) as Task;
        setStages((currentStages) => {
          if (row.stage_id && currentStages.some((s) => s.id === row.stage_id)) {
            refreshList(p, setTasks);
          }
          return currentStages;
        });
      })
      .subscribe();

    return () => { active = false; supabase.removeChannel(channel); };
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  function refreshList<T extends { id: string }>(payload: any, setter: React.Dispatch<React.SetStateAction<T[]>>) {
    setter((prev) => {
      if (payload.eventType === 'INSERT') return prev.some((x) => x.id === payload.new.id) ? prev : [...prev, payload.new as T];
      if (payload.eventType === 'UPDATE') return prev.map((x) => (x.id === payload.new.id ? (payload.new as T) : x));
      if (payload.eventType === 'DELETE') return prev.filter((x) => x.id !== payload.old.id);
      return prev;
    });
  }

  async function updateProjectField(patch: Partial<Project>) {
    if (!project) return;
    setProject({ ...project, ...patch });
    await supabase.from('projects').update(patch).eq('id', project.id);
  }

  async function addStage() {
    if (!newStageTitle.trim() || !project) return;
    await supabase.from('stages').insert({ project_id: project.id, title: newStageTitle.trim(), position: stages.length });
    setNewStageTitle('');
  }

  async function deleteStage(stage: Stage) {
    if (!confirm(`Удалить этап «${stage.title}» вместе со всеми задачами внутри?`)) return;
    await supabase.from('stages').delete().eq('id', stage.id);
  }

  async function renameStage(stage: Stage, title: string) {
    if (!title.trim() || title === stage.title) return;
    await supabase.from('stages').update({ title: title.trim() }).eq('id', stage.id);
  }

  async function addTaskToStage(stage: Stage, title: string) {
    if (!title.trim() || !me) return;
    await supabase.from('tasks').insert({
      title: title.trim(), stage_id: stage.id, status: 'todo', priority: 'medium',
      assignee_id: me.id, reporter_id: me.id,
    });
  }

  async function toggleTaskDone(task: Task) {
    await supabase.from('tasks').update({ status: task.status === 'done' ? 'todo' : 'done' }).eq('id', task.id);
  }

  async function sendStageToReview(stage: Stage) {
    await supabase.from('stages').update({ status: 'on_review' }).eq('id', stage.id);
  }
  async function approveStage(stage: Stage) {
    await supabase.from('stages').update({ status: 'approved' }).eq('id', stage.id);
  }
  async function reworkStage(stage: Stage) {
    await supabase.from('stages').update({ status: 'in_progress' }).eq('id', stage.id);
  }

  async function deleteProject() {
    if (!project) return;
    if (!confirm(`Удалить проект «${project.title}» вместе со всеми этапами и задачами?`)) return;
    const { error } = await supabase.from('projects').delete().eq('id', project.id);
    if (error) { alert('Не удалось удалить проект: ' + error.message); return; }
    onClose();
  }

  if (!project) {
    return (
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={onClose}>
        <div className="fixed top-0 right-0 bottom-0 w-[560px] max-w-[94vw] bg-surface p-6" onClick={(e) => e.stopPropagation()}>Загрузка…</div>
      </div>
    );
  }

  const assignee = profiles.find((p) => p.id === project.assignee_id);
  const approved = project.status === 'approved';

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[1px]" onClick={onClose}>
      <div className="fixed top-0 right-0 bottom-0 w-[560px] max-w-[94vw] bg-surface shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-3.5 border-b border-border flex items-center gap-2">
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#7C4FE022', color: '#7C4FE0' }}>Проект</span>
          {approved && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-green/15 text-green">✓ Согласовано</span>}
          {(me?.id === project.reporter_id || canManage) && (
            <button onClick={deleteProject} title="Удалить проект" className="ml-auto text-muted hover:text-red w-8 h-8">🗑</button>
          )}
          <button onClick={onClose} className={`${(me?.id === project.reporter_id || canManage) ? '' : 'ml-auto'} text-muted hover:text-text w-8 h-8`}>✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <input
            defaultValue={project.title}
            onBlur={(e) => e.target.value !== project.title && updateProjectField({ title: e.target.value })}
            className="w-full text-lg font-extrabold outline-none bg-transparent mb-1"
          />
          <div className="text-xs text-muted mb-3">Создан {formatDate(project.created_at)}</div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <Field label="Исполнитель">
              <div className="flex items-center gap-1.5 text-[13px]"><Avatar profile={assignee} size={20} /> {assignee ? fullName(assignee) : '—'}</div>
            </Field>
            <Field label="Срок проекта">
              <input
                type="date"
                value={project.due_date ? project.due_date.slice(0, 10) : ''}
                onChange={(e) => updateProjectField({ due_date: e.target.value ? new Date(e.target.value + 'T12:00:00').toISOString() : null })}
                className="w-full border border-border bg-surface2 rounded-md px-2 py-1.5 text-[13px]"
              />
            </Field>
          </div>

          <label className="block text-[11px] text-muted font-semibold uppercase mb-1">Описание</label>
          <textarea
            defaultValue={project.description}
            onBlur={(e) => e.target.value !== project.description && updateProjectField({ description: e.target.value })}
            className="w-full border border-border bg-surface2 rounded-lg p-2.5 text-[13px] min-h-[60px] mb-4"
          />

          <div className="flex items-center mb-2.5 mt-5">
            <div className="text-[12.5px] font-bold">Этапы <span className="text-muted font-normal">{stages.length}</span></div>
          </div>

          <div className="flex flex-col gap-2.5">
            {stages.map((stage, i) => (
              <StageBlock
                key={stage.id}
                index={i + 1}
                stage={stage}
                tasks={tasks.filter((t) => t.stage_id === stage.id)}
                profiles={profiles}
                isOwner={isOwner}
                canManage={!!canManage}
                onOpenTask={onOpenTask}
                onRename={(title) => renameStage(stage, title)}
                onDelete={() => deleteStage(stage)}
                onAddTask={(title) => addTaskToStage(stage, title)}
                onToggleTask={toggleTaskDone}
                onSendToReview={() => sendStageToReview(stage)}
                onApprove={() => approveStage(stage)}
                onRework={() => reworkStage(stage)}
              />
            ))}
            {stages.length === 0 && <div className="text-center py-4 text-[12px] text-muted">Этапов пока нет</div>}
          </div>

          {(isOwner || canManage) && (
            <div className="flex gap-2 mt-3">
              <input
                value={newStageTitle}
                onChange={(e) => setNewStageTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addStage()}
                placeholder="Добавить этап…"
                className="flex-1 border border-border bg-surface2 rounded-md px-2 py-1.5 text-[13px]"
              />
              <button onClick={addStage} className="px-2.5 border border-border rounded-md text-sm">+</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const STAGE_STATUS_META: Record<string, { label: string; color: string }> = {
  in_progress: { label: 'В работе', color: '#C77C0A' },
  on_review: { label: 'На согласовании', color: '#2F5FE0' },
  approved: { label: 'Согласовано', color: '#16A34A' },
};

function StageBlock({
  index, stage, tasks, profiles, isOwner, canManage, onOpenTask, onRename, onDelete, onAddTask, onToggleTask, onSendToReview, onApprove, onRework,
}: {
  index: number; stage: Stage; tasks: Task[]; profiles: Profile[]; isOwner: boolean; canManage: boolean;
  onOpenTask: (id: string) => void; onRename: (title: string) => void; onDelete: () => void;
  onAddTask: (title: string) => void; onToggleTask: (task: Task) => void;
  onSendToReview: () => void; onApprove: () => void; onRework: () => void;
}) {
  const [newTask, setNewTask] = useState('');
  const meta = STAGE_STATUS_META[stage.status];
  const doneCount = tasks.filter((t) => t.status === 'done').length;
  const canSendToReview = stage.status === 'in_progress' && tasks.length > 0 && doneCount === tasks.length && (isOwner || canManage);

  function submitNewTask() {
    if (!newTask.trim()) return;
    onAddTask(newTask.trim());
    setNewTask('');
  }

  return (
    <div className="border border-border rounded-xl p-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[13px] font-semibold flex-1">
          {index}.{' '}
          <input
            defaultValue={stage.title}
            onBlur={(e) => onRename(e.target.value)}
            className="bg-transparent outline-none font-semibold"
            style={{ width: `${Math.max(stage.title.length, 8)}ch` }}
          />
        </span>
        <span className="text-[10.5px] font-bold px-1.5 py-0.5 rounded-full flex-none" style={{ background: meta.color + '22', color: meta.color }}>{meta.label}</span>
        {canManage && <button onClick={onDelete} title="Удалить этап" className="text-muted hover:text-red text-xs px-1">🗑</button>}
      </div>
      <div className="text-[11.5px] text-muted mb-2">{doneCount}/{tasks.length} задач выполнено</div>

      <div className="flex flex-col gap-1 mb-2">
        {tasks.map((t) => (
          <label key={t.id} className="flex items-center gap-2 py-1 border-b border-border text-[13px]">
            <input type="checkbox" checked={t.status === 'done'} onChange={() => onToggleTask(t)} />
            <span onClick={() => onOpenTask(t.id)} className={`flex-1 cursor-pointer hover:underline ${t.status === 'done' ? 'line-through text-muted' : ''}`}>{t.title}</span>
            <Avatar profile={profiles.find((p) => p.id === t.assignee_id)} size={18} />
          </label>
        ))}
      </div>

      <div className="flex gap-2 mb-2">
        <input
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submitNewTask()}
          placeholder="Добавить задачу…"
          className="flex-1 border border-border bg-surface2 rounded-md px-2 py-1 text-[12.5px]"
        />
        <button onClick={submitNewTask} className="px-2 border border-border rounded-md text-xs">+</button>
      </div>

      {canSendToReview && (
        <button onClick={onSendToReview} className="w-full text-xs font-semibold bg-accent text-white rounded-md px-2.5 py-1.5">
          Отправить на согласование
        </button>
      )}

      {stage.status === 'on_review' && canManage && (
        <div className="flex gap-2">
          <button onClick={onApprove} className="flex-1 text-xs font-semibold bg-green text-white rounded-md px-2.5 py-1.5">✓ Согласовать</button>
          <button onClick={onRework} className="flex-1 text-xs font-semibold border border-border rounded-md px-2.5 py-1.5">↩ На доработку</button>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-muted font-semibold uppercase mb-1">{label}</div>
      {children}
    </div>
  );
}
