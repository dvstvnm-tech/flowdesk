'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { Project, ProjectStage, ProjectTask, Profile } from '@/lib/database.types';
import { fullName, monthLabel, currentMonthKey, sortMonthKeys } from '@/lib/utils';
import { Avatar } from '@/components/AppShell';
import ProgressBar from '@/components/ProgressBar';
import MonthSelect from '@/components/MonthSelect';

export default function ProjectsList({
  initialProjects, initialStages, initialTasks, profiles,
}: { initialProjects: Project[]; initialStages: ProjectStage[]; initialTasks: ProjectTask[]; profiles: Profile[] }) {
  const supabase = createClient();
  const { profile: me } = useCurrentUser();
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [stages, setStages] = useState<ProjectStage[]>(initialStages);
  const [tasks, setTasks] = useState<ProjectTask[]>(initialTasks);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueMonth, setDueMonth] = useState<string>(currentMonthKey());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const channel = supabase
      .channel('projects-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, (p) => {
        setProjects((prev) => {
          if (p.eventType === 'INSERT') return prev.some((x) => x.id === (p.new as Project).id) ? prev : [p.new as Project, ...prev];
          if (p.eventType === 'UPDATE') return prev.map((x) => (x.id === (p.new as Project).id ? (p.new as Project) : x));
          if (p.eventType === 'DELETE') return prev.filter((x) => x.id !== (p.old as Project).id);
          return prev;
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_stages' }, (p) => {
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function progressFor(projectId: string) {
    const stageIds = stages.filter((s) => s.project_id === projectId).map((s) => s.id);
    const projectTasks = tasks.filter((t) => stageIds.includes(t.stage_id));
    if (projectTasks.length === 0) return 0;
    return (projectTasks.filter((t) => t.is_done).length / projectTasks.length) * 100;
  }

  async function createProject() {
    if (!title.trim() || !me) return;
    setSaving(true);
    const { data, error } = await supabase
      .from('projects')
      .insert({ title: title.trim(), description: description.trim(), owner_id: me.id, due_month: dueMonth })
      .select().single();
    setSaving(false);
    if (error) { alert('Не удалось создать проект: ' + error.message); return; }
    setProjects((prev) => [data as Project, ...prev]);
    setTitle(''); setDescription(''); setCreating(false);
  }

  // Группировка проектов по месяцу сдачи — заголовок месяца сверху, проекты этого месяца под ним
  const groups = useMemo(() => {
    const keys = sortMonthKeys(Array.from(new Set(projects.map((p) => p.due_month ?? null))));
    return keys.map((key) => ({
      key,
      label: monthLabel(key),
      items: projects.filter((p) => (p.due_month ?? null) === key),
    }));
  }, [projects]);

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Проекты</h1>
          <p className="text-sm text-muted mt-0.5">Глобальные годовые результаты — проект → этапы → задачи</p>
        </div>
        <button onClick={() => setCreating(true)} className="text-xs font-semibold bg-accent text-white rounded-lg px-3.5 py-2">+ Новый проект</button>
      </div>

      {groups.map((g) => (
        <div key={g.key ?? 'none'} className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[13px] font-extrabold uppercase tracking-wide text-accent">{g.label}</span>
            <span className="text-[11px] text-muted bg-surface2 border border-border rounded-full px-2 py-0.5">{g.items.length}</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
            {g.items.map((p) => {
              const owner = profiles.find((pr) => pr.id === p.owner_id);
              const stageCount = stages.filter((s) => s.project_id === p.id).length;
              const pct = progressFor(p.id);
              return (
                <Link key={p.id} href={`/projects/${p.id}`} className="card p-5 hover:shadow-md transition-shadow block">
                  <div className="font-bold text-[15px] mb-1">{p.title}</div>
                  {p.description && <div className="text-[12.5px] text-muted mb-3 line-clamp-2">{p.description}</div>}
                  <div className="flex items-center gap-3">
                    <ProgressBar value={pct} />
                    <span className="text-[12.5px] font-semibold flex-none">{Math.round(pct)}%</span>
                  </div>
                  <div className="flex items-center justify-between mt-2.5 text-[11.5px] text-muted">
                    <span>{stageCount} {stageWord(stageCount)}</span>
                  </div>
                  {owner && (
                    <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-border">
                      <Avatar profile={owner} size={20} />
                      <span className="text-[11.5px] text-muted">{fullName(owner)}</span>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
      {projects.length === 0 && <div className="text-muted text-sm text-center py-16">Пока нет ни одного проекта</div>}

      {creating && (
        <div className="fixed inset-0 z-[70] bg-black/45 flex items-start justify-center pt-[10vh]" onClick={() => setCreating(false)}>
          <div className="bg-surface rounded-2xl w-[480px] max-w-[92vw] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-border font-bold text-[15px]">Новый проект</div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-text2 block mb-1">Название</label>
                <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: Запуск Корпоративного университета" className="w-full border border-border bg-surface2 rounded-lg px-2.5 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-text2 block mb-1">Описание (необязательно)</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full border border-border bg-surface2 rounded-lg p-2.5 text-sm min-h-[70px]" />
              </div>
              <div>
                <label className="text-xs font-semibold text-text2 block mb-1">Месяц сдачи</label>
                <MonthSelect value={dueMonth} onChange={setDueMonth} />
              </div>
            </div>
            <div className="p-3.5 border-t border-border flex justify-end gap-2">
              <button onClick={() => setCreating(false)} className="px-3 py-1.5 border border-border rounded-lg text-sm">Отмена</button>
              <button onClick={createProject} disabled={saving} className="px-3 py-1.5 bg-accent text-white rounded-lg text-sm font-semibold disabled:opacity-60">
                {saving ? 'Создаём…' : 'Создать проект'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function stageWord(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return 'этап';
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return 'этапа';
  return 'этапов';
}
