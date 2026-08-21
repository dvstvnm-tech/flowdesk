'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Project, ProjectStage, ProjectTask } from '@/lib/database.types';
import ProgressBar from '@/components/ProgressBar';
import InlineEditText from '@/components/InlineEditText';
import MonthSelect from '@/components/MonthSelect';

export default function ProjectDetail({
  project, initialStages, initialTasks,
}: { project: Project; initialStages: ProjectStage[]; initialTasks: ProjectTask[] }) {
  const supabase = createClient();
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
    <div className="p-6">
      <Link href="/projects" className="inline-block text-sm text-muted hover:text-text mb-3.5">← Все проекты</Link>
      <div className="mb-5">
        <InlineEditText
          value={proj.title}
          onSave={(title) => title && saveProjectField({ title })}
          displayClassName="text-xl font-extrabold tracking-tight"
          inputClassName="text-xl font-extrabold tracking-tight w-full border border-border bg-surface2 rounded-lg px-2 py-1 outline-none focus:border-accent"
        />
        <InlineEditText
          as="textarea"
          value={proj.description ?? ''}
          onSave={(description) => saveProjectField({ description })}
          placeholder="Добавить описание проекта…"
          displayClassName="text-sm text-muted mt-1 max-w-[640px] min-h-[20px]"
          inputClassName="text-sm w-full max-w-[640px] border border-border bg-surface2 rounded-lg p-2 outline-none focus:border-accent min-h-[60px]"
        />
        <div className="flex items-center gap-4 mt-3 flex-wrap">
          <div className="flex items-center gap-3 max-w-[420px] flex-1 min-w-[220px]">
            <ProgressBar value={overallProgress} />
            <span className="text-[13px] font-semibold flex-none">{Math.round(overallProgress)}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted font-semibold uppercase">Месяц сдачи</span>
            <MonthSelect
              value={proj.due_month ?? ''}
              onChange={(due_month) => saveProjectField({ due_month })}
              className="border border-border bg-surface2 rounded-lg px-2.5 py-1.5 text-[13px]"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[260px_1fr] gap-5 items-start">
        <div className="card p-2.5">
          <div className="flex items-center justify-between px-1.5 pb-2">
            <span className="text-[11px] font-bold text-muted uppercase">Этапы</span>
            <button onClick={() => setAddingStage(true)} className="text-muted hover:text-accent text-sm px-0.5">+</button>
          </div>
          <div className="flex flex-col gap-1">
            {sortedStages.map((s) => {
              const pct = stageProgress(s.id);
              const active = activeStage?.id === s.id;
              return (
                <div
                  key={s.id}
                  onClick={() => setActiveStageId(s.id)}
                  className={`group text-left rounded-xl p-2.5 transition-colors cursor-pointer ${active ? 'bg-accentSoft' : 'hover:bg-surface2'}`}
                >
                  <div className="flex items-center gap-2">
                    {editingStageId === s.id ? (
                      <InlineEditText
                        value={s.title}
                        onSave={(title) => { renameStage(s, title); setEditingStageId(null); }}
                        displayClassName={`text-[13px] font-semibold flex-1 ${active ? 'text-accent' : ''}`}
                        inputClassName="text-[13px] font-semibold flex-1 border border-border bg-surface rounded-md px-1.5 py-0.5 outline-none focus:border-accent"
                      />
                    ) : (
                      <span className={`text-[13px] font-semibold flex-1 ${active ? 'text-accent' : ''}`}>{s.title}</span>
                    )}
                    <span className="text-[11px] text-muted">{Math.round(pct)}%</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingStageId(s.id); }}
                      title="Переименовать этап"
                      className="text-muted hover:text-accent text-[11px] opacity-0 group-hover:opacity-100 transition-opacity"
                    >✎</button>
                  </div>
                  <div className="mt-1.5"><ProgressBar value={pct} size="sm" /></div>
                </div>
              );
            })}
            {sortedStages.length === 0 && <div className="text-center py-6 text-[12px] text-muted">Нет этапов</div>}
          </div>
          {addingStage && (
            <div className="p-1.5 mt-1">
              <input
                autoFocus
                value={newStageTitle}
                onChange={(e) => setNewStageTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addStage(); if (e.key === 'Escape') setAddingStage(false); }}
                onBlur={() => { if (!newStageTitle.trim()) setAddingStage(false); }}
                placeholder="Название этапа…"
                className="w-full border border-border bg-surface2 rounded-lg px-2.5 py-1.5 text-[13px]"
              />
            </div>
          )}
        </div>

        <div className="card p-4">
          {activeStage ? (
            <>
              <div className="flex items-center justify-between mb-3.5">
                <div className="font-bold text-[15px]">{activeStage.title}</div>
                <button onClick={() => deleteStage(activeStage)} title="Удалить этап" className="text-muted hover:text-red text-xs">🗑</button>
              </div>
              <div className="flex flex-col gap-1.5 mb-3">
                {activeTasks.map((t) => (
                  <div key={t.id} className="flex items-center gap-2.5 py-1.5 border-b border-border last:border-0 group">
                    <input type="checkbox" checked={t.is_done} onChange={() => toggleTask(t)} />
                    <div className="flex-1">
                      <InlineEditText
                        value={t.title}
                        onSave={(title) => renameTask(t, title)}
                        displayClassName={`text-[13.5px] ${t.is_done ? 'line-through text-muted' : ''}`}
                        inputClassName="text-[13.5px] w-full border border-border bg-surface2 rounded-md px-1.5 py-0.5 outline-none focus:border-accent"
                      />
                    </div>
                    <button onClick={() => deleteTask(t)} className="text-muted hover:text-red text-xs opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                  </div>
                ))}
                {activeTasks.length === 0 && <div className="text-center py-8 text-[12.5px] text-muted">Нет задач в этом этапе</div>}
              </div>
              <div className="flex gap-2">
                <input
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTask()}
                  placeholder="Добавить задачу…"
                  className="flex-1 border border-border bg-surface2 rounded-lg px-2.5 py-1.5 text-[13px]"
                />
                <button onClick={addTask} className="px-2.5 border border-border rounded-lg text-sm">+</button>
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
