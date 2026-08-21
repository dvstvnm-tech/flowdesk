import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ProjectDetail from '@/components/ProjectDetail';

export default async function ProjectPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: project } = await supabase.from('projects').select('*').eq('id', params.id).single();
  if (!project) notFound();

  const { data: stages } = await supabase
    .from('project_stages').select('*').eq('project_id', params.id).order('position');
  const stageIds = (stages ?? []).map((s) => s.id);
  const { data: tasks } = stageIds.length
    ? await supabase.from('project_tasks').select('*').in('stage_id', stageIds).order('position')
    : { data: [] };

  return <ProjectDetail project={project} initialStages={stages ?? []} initialTasks={tasks ?? []} />;
}
