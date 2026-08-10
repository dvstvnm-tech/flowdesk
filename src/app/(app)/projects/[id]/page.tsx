import { createClient } from '@/lib/supabase/server';
import ProjectDetail from '@/components/ProjectDetail';
import type { Task } from '@/lib/database.types';

export default async function ProjectDetailPage({
  params, searchParams,
}: { params: { id: string }; searchParams: { stage?: string } }) {
  const supabase = createClient();
  const [{ data: project }, { data: stages }, { data: profiles }] = await Promise.all([
    supabase.from('projects').select('*').eq('id', params.id).single(),
    supabase.from('stages').select('*').eq('project_id', params.id).order('position'),
    supabase.from('profiles').select('*').order('first_name'),
  ]);

  const stageIds = (stages ?? []).map((s) => s.id);
  let tasks: Task[] = [];
  if (stageIds.length) {
    const { data } = await supabase.from('tasks').select('*').in('stage_id', stageIds).order('position');
    tasks = (data as Task[]) ?? [];
  }

  if (!project) {
    return <div className="p-6 text-muted text-sm">Проект не найден или был удалён.</div>;
  }

  return (
    <ProjectDetail
      initialProject={project}
      initialStages={stages ?? []}
      initialTasks={tasks}
      profiles={profiles ?? []}
      initialSelectedStageId={searchParams?.stage ?? null}
    />
  );
}

