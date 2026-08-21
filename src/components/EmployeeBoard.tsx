'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { Task, Profile, Project, ProjectStage, ProjectTask, Department } from '@/lib/database.types';
import { isOverdue, fullName } from '@/lib/utils';
import { Avatar } from '@/components/AppShell';
import TaskPanel from '@/components/TaskPanel';
import QuickAddModal from '@/components/QuickAddModal';
import NewProjectModal from '@/components/NewProjectModal';
import { EmployeeSection, Stat } from '@/components/BoardBlocks';

const ROLE_LABEL: Record<string, string> = { administrator: 'Администратор', manager: 'Руководитель', employee: 'Сотрудник', viewer: 'Наблюдатель' };

export default function EmployeeBoard({
  employeeId, initialProfile, department, allProfiles, initialTasks, initialProjects, initialStages, initialProjectTasks,
}: {
  employeeId: string;
  initialProfile: Profile;
  department: Department | null;
  allProfiles: Profile[];
  initialTasks: Task[]; initialProjects: Project[]; initialStages: ProjectStage[]; initialProjectTasks: ProjectTask[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const { profile: me } = useCurrentUser();

  const [profile, setProfile] = useState<Profile>(initialProfile);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [stages, setStages] = useState<ProjectStage[]>(initialStages);
  const [projectTasks, setProjectTasks] = useState<ProjectTask[]>(initialProjectTasks);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [quickAdd, setQuickAdd] = useState<string | null>(null);
  const [addingProject, setAddingProject] = useState(false);

  const isMine = me?.id === employeeId;

  // Тот же принцип синхронизации в реальном времени, что и на общей доске —
  // подписываемся на изменения именно этого сотрудника
  useEffect(() => {
    const channel = supabase
      .channel(`employee-board-${employeeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `assignee_id=eq.${employeeId}` }, (payload) => {
        setTasks((prev) => {
          if (payload.eventType === 'INSERT') return prev.some((t) => t.id === (payload.new as Task).id) ? prev : [payload.new as Task, ...prev];
          if (payload.eventType === 'UPDATE') return prev.map((t) => (t.id === (payload.new as Task).id ? (payload.new as Task) : t));
          if (payload.eventType === 'DELETE') return prev.filter((t) => t.id !== (payload.old as Task).id);
          return prev;
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects', filter: `owner_id=eq.${employeeId}` }, (payload) => {
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
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${employeeId}` }, (payload) => {
        setProfile(payload.new as Profile);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [employeeId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const totalItems = tasks.length + projects.length;
  const completedTasks = tasks.filter((t) => t.status === 'approved').length;
  const archivedProjects = projects.filter((p) => p.approval_status === 'approved').length;
  const overdueTasks = useMemo(() => tasks.filter((t) => isOverdue(t.due_date, t.status)).length, [tasks]);

  return (
    <div className="p-6">
      <button
        onClick={() => router.push('/employees')}
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text mb-4 transition-colors"
      >
        <span aria-hidden>←</span> Все сотрудники
      </button>

      <div className="flex items-center gap-4 mb-5">
        <Avatar profile={profile} size={64} />
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">{fullName(profile) || profile.email}</h1>
          <p className="text-sm text-muted mt-0.5">{ROLE_LABEL[profile.role] ?? profile.role} · {department?.name ?? 'Без отдела'}</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2.5 mb-5">
        <Stat label="Всего задач" value={totalItems} />
        <Stat label="Выполнено" value={completedTasks} success />
        <Stat label="Просрочено" value={overdueTasks} danger />
        <Stat label="Архивные проекты" value={archivedProjects} accent />
      </div>

      <EmployeeSection
        profile={profile}
        tasks={tasks}
        projects={projects}
        projectProgress={projectProgress}
        isMine={isMine}
        onOpenTask={setOpenTaskId}
        onAdd={(status) => setQuickAdd(status)}
        onAddProject={() => setAddingProject(true)}
        onDeleteTask={deleteTask}
        onDeleteProject={deleteProject}
        onApproveProject={approveProject}
        showHeader={false}
      />

      {openTaskId && <TaskPanel taskId={openTaskId} profiles={allProfiles} onClose={() => setOpenTaskId(null)} />}

      {quickAdd && isMine && (
        <QuickAddModal
          status={quickAdd}
          profiles={allProfiles}
          onClose={() => setQuickAdd(null)}
          onCreated={(t) => { setTasks((prev) => [t, ...prev]); setQuickAdd(null); }}
        />
      )}

      {addingProject && isMine && (
        <NewProjectModal
          onClose={() => setAddingProject(false)}
          onCreated={(p) => { setProjects((prev) => [p, ...prev]); setAddingProject(false); }}
        />
      )}
    </div>
  );
}
