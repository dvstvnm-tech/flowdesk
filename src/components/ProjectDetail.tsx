'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Project, ProjectStage, ProjectTask } from '@/lib/database.types';
import ProgressBar from '@/components/ProgressBar';
import InlineEditText from '@/components/InlineEditText';
import MonthSelect from '@/components/MonthSelect';

// Единый стиль для всех полей ввода на странице проекта
const FIELD = 'w-full border border-border bg-surface2 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-colors';

export default function ProjectDetail({
  project, initialStages, initialTasks,
}: { project: Project; initialStages: ProjectStage[]; initialTasks: ProjectTask[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [proj, setProj] = useState<Project>(project);
  const [stages, setStages] = useState<ProjectStage[]>(initialStages);
  const [tasks, setTasks] = useState<ProjectTask[]>(initialTasks);
  const [activeStageId, setActiveStageId] = useState<string | null>(initialStages[0]?.id ?? null);
  const [newStageTitle, setNewStageTitle] = useState('');
  const [addingStage, setAddingStage] = useState(false);
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  useEffect(() => {
    const channel = supabase
      .channel(`project-detail-${project.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'projects', filter: `id=eq.${project.id}` }, (p) => {
        setProj(p.new as Project);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_stages', filter: `project_id=eq.${project.id}` }, (p) => {
        setStages((prev) => {
          if (p.eventType === 'INSERT') return prev.some((x) => x.id === (p.new as ProjectStage).id) ? prev : [...prev, p.new as ProjectStage];
          if (p.eventType === 'UPDATE') return prev.map((x) => (x.id === (p.new as ProjectStage).id ? (p.new as ProjectStage) : x));
          if (p.eventType === 'DELETE') return prev.filter((x) => x.id !== (p.old as ProjectStage).id);
          return prev;
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_tasks' }, (p) => {
        setTasks((prev) => {
          if (p.eventType === 'INSERT') return prev.some((x) => x.id === (p.new as ProjectTask).id) ? prev : [...prev, p.new as ProjectTask];
          if (p.eventType === 'UPDATE') return prev.map((x) => (x.id === (p.new as ProjectTask).id ? (p.new as ProjectTask) : x));
          if (p.eventType === 'DELETE') return prev.filter((x) => x.id !== (p.old as ProjectTask).id);
          return prev;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const sortedStages = useMemo(() => [...stages].sort((a, b) => a.position - b.position), [stages]);
  const activeStage = sortedStages.find((s) => s.id === activeStageId) ?? sortedStages[0] ?? null;
  const activeTasks = useMemo(
    () => tasks.filter((t) => t.stage_id === activeStage?.id).sort((a, b) => a.position - b.position),
    [tasks, activeStage]
  );

  const overallProgress = useMemo(() => {
    const stageIds = stages.map((s) => s.id);
    const relevant = tasks.filter((t) => stageIds.includes(t.stage_id));
    if (relevant.length === 0) return 0;
    return (relevant.filter((t) => t.is_done).length / relevant.length) * 100;
  }, [tasks, stages]);

  function stageProgress(stageId: string) {
    const list = tasks.filter((t) => t.stage_id === stageId);
    if (list.length === 0) return 0;
    return (list.filter((t) => t.is_done).length / list.length) * 100;
  }

  async function saveProjectField(patch: Partial<Project>) {
    setProj((prev) => ({ ...prev, ...patch }));
    await supabase.from('projects').update(patch).eq('id', proj.id);
  }

  async function addStage() {
    if (!newStageTitle.trim()) return;
    const { data, error } = await supabase.from('project_stages').insert({
      project_id: project.id, title: newStageTitle.trim(), position: stages.length,
    }).select().single();
    if (error) { alert('Не удалось добавить этап: ' + error.message); return; }
    setStages((prev) => [...prev, data as ProjectStage]);
    setActiveStageId((data as ProjectStage).id);
    setNewStageTitle('');
    setAddingStage(false);
  }

  async function renameStage(stage: ProjectStage, title: string) {
    if (!title) return;
    setStages((prev) => prev.map((s) => (s.id === stage.id ? { ...s, title } : s)));
    await supabase.from('project_stages').update({ title }).eq('id', stage.id);
  }

  async function deleteStage(stage: ProjectStage) {
    if (!confirm('Удалить этап «' + stage.title + '» вместе со всеми его задачами?')) return;
    await supabase.from('project_stages').delete().eq('id', stage.id);
    if (activeStageId === stage.id) setActiveStageId(null);
  }

  async function addTask() {
    if (!newTaskTitle.trim() || !activeStage) return;
    const count = tasks.filter((t) => t.stage_id === activeStage.id).length;
    const { error } = await supabase.from('project_tasks').insert({
      stage_id: activeStage.id, title: newTaskTitle.trim(), position: count,
    });
    if (error) { alert('Не удалось добавить задачу: ' + error.message); return; }
    setNewTaskTitle('');
  }

  async function renameTask(t: ProjectTask, title: string) {
    if (!title) return;
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, title } : x)));
    await supabase.from('project_tasks').update({ title }).eq('id', t.id);
  }

  async function toggleTask(t: ProjectTask) {
    await supabase.from('project_tasks').update({ is_done: !t.is_done }).eq('id', t.id);
  }

  async function deleteTask(t: ProjectTask) {
    await supabase.from('project_tasks').delete().eq('id', t.id);
  }

  return (
    <div className="p-6 max-w-[1100px]">
      <button
        onClick={() => router.push('/board')}
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text mb-4 transition-colors"
      >
        <span aria-hidden>←</span> Доска
      </button>

      <div className="card p-5 mb-5">
        <InlineEditText
          value={proj.title}
          onSave={(title) => title && saveProjectField({ title })}
          displayClassName="text-xl font-extrabold tracking-tight"
          inputClassName="text-xl font-extrabold tracking-tight w-full border border-border bg-surface2 rounded-lg px-3 py-1.5 outline-none focus:border-accent focus:ring-2 focus:ring-accent/10"
        />
        <InlineEditText
          as="textarea"
          value={proj.description ?? ''}
          onSave={(description) => saveProjectField({ description })}
          placeholder="Добавить описание проекта…"
          displayClassName="text-sm text-muted mt-1.5 max-w-[640px] min-h-[20px]"
          inputClassName="text-sm w-full max-w-[640px] border border-border bg-surface2 rounded-lg p-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 min-h-[64px]"
        />
        <div className="flex items-center gap-5 mt-4 pt-4 border-t border-border flex-wrap">
          <div className="flex items-center gap-3 max-w-[420px] flex-1 min-w-[220px]">
            <ProgressBar value={overallProgress} />
            <span className="text-[13px] font-semibold flex-none tabular-nums">{Math.round(overallProgress)}%</span>
          </div>
          <div className="flex items-center gap-2 flex-none">
            <span className="text-[11px] text-muted font-semibold uppercase tracking-wide">Месяц сдачи</span>
            <MonthSelect
              value={proj.due_month ?? ''}
              onChange={(due_month) => saveProjectField({ due_month })}
              className="border border-border bg-surface2 rounded-lg px-3 py-1.5 text-[13px] outline-none focus:border-accent"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[280px_1fr] gap-5 items-start">
        <div className="card p-3">
          <div className="flex items-center justify-between px-1 pb-2.5">
            <span className="text-[11px] font-bold text-muted uppercase tracking-wide">Этапы</span>
            <button
              onClick={() => setAddingStage(true)}
              className="w-6 h-6 flex items-center justify-center rounded-md text-muted hover:text-accent hover:bg-accentSoft transition-colors text-base leading-none"
            >+</button>
          </div>
          <div className="flex flex-col gap-1.5">
            {sortedStages.map((s) => {
              const pct = stageProgress(s.id);
              const active = activeStage?.id === s.id;
              return (
                <div
                  key={s.id}
                  onClick={() => setActiveStageId(s.id)}
                  className={`group text-left rounded-xl p-3 transition-colors cursor-pointer border ${active ? 'bg-accentSoft border-accent/30' : 'border-transparent hover:bg-surface2'}`}
                >
                  <div className="flex items-center gap-2">
                    {editingStageId === s.id ? (
                      <InlineEditText
                        value={s.title}
                        onSave={(title) => { renameStage(s, title); setEditingStageId(null); }}
                        displayClassName={`text-[13px] font-semibold flex-1 ${active ? 'text-accent' : ''}`}
                        inputClassName="text-[13px] font-semibold flex-1 border border-border bg-surface rounded-md px-2 py-1 outline-none focus:border-accent"
                      />
                    ) : (
                      <span className={`text-[13px] font-semibold flex-1 truncate ${active ? 'text-accent' : ''}`}>{s.title}</span>
                    )}
                    <span className="text-[11px] text-muted tabular-nums flex-none">{Math.round(pct)}%</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingStageId(s.id); }}
                      title="Переименовать этап"
                      className="w-5 h-5 flex-none flex items-center justify-center rounded text-muted hover:text-accent opacity-0 group-hover:opacity-100 transition-opacity text-[11px]"
                    >✎</button>
                  </div>
                  <div className="mt-2"><ProgressBar value={pct} size="sm" /></div>
                </div>
              );
            })}
            {sortedStages.length === 0 && <div className="text-center py-8 text-[12.5px] text-muted">Нет этапов</div>}
          </div>
          {addingStage && (
            <div className="p-1 mt-1.5">
              <input
                autoFocus
                value={newStageTitle}
                onChange={(e) => setNewStageTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addStage(); if (e.key === 'Escape') setAddingStage(false); }}
                onBlur={() => { if (!newStageTitle.trim()) setAddingStage(false); }}
                placeholder="Название этапа…"
                className={FIELD}
              />
            </div>
          )}
        </div>

        <div className="card p-5">
          {activeStage ? (
            <>
              <div className="flex items-center justify-between mb-4 pb-3.5 border-b border-border">
                <div className="font-bold text-[15px]">{activeStage.title}</div>
                <button
                  onClick={() => deleteStage(activeStage)}
                  title="Удалить этап"
                  className="w-8 h-8 flex-none flex items-center justify-center rounded-lg text-muted hover:text-red hover:bg-red/10 transition-colors text-sm"
                >🗑</button>
              </div>
              <div className="flex flex-col gap-1 mb-4">
                {activeTasks.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-surface2 transition-colors group">
                    <input
                      type="checkbox"
                      checked={t.is_done}
                      onChange={() => toggleTask(t)}
                      className="w-4 h-4 flex-none accent-[var(--accent)] cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <InlineEditText
                        value={t.title}
                        onSave={(title) => renameTask(t, title)}
                        displayClassName={`text-[13.5px] ${t.is_done ? 'line-through text-muted' : ''}`}
                        inputClassName="text-[13.5px] w-full border border-border bg-surface rounded-md px-2 py-1 outline-none focus:border-accent"
                      />
                    </div>
                    <button
                      onClick={() => deleteTask(t)}
                      className="w-6 h-6 flex-none flex items-center justify-center rounded text-muted hover:text-red opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                    >✕</button>
                  </div>
                ))}
                {activeTasks.length === 0 && <div className="text-center py-10 text-[12.5px] text-muted">Нет задач в этом этапе</div>}
              </div>
              <div className="flex gap-2">
                <input
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTask()}
                  placeholder="Добавить задачу…"
                  className={FIELD + ' flex-1'}
                />
                <button
                  onClick={addTask}
                  className="w-9 h-9 flex-none flex items-center justify-center rounded-lg border border-border text-muted hover:text-accent hover:border-accent transition-colors text-base leading-none"
                >+</button>
              </div>
            </>
          ) : (
            <div className="text-center py-16 text-muted text-sm">Выберите или создайте этап слева</div>
          )}
        </div>
      </div>
    </div>
  );
}
