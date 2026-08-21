import { createClient } from '@/lib/supabase/server';
import ProjectsList from '@/components/ProjectsList';

export default async function ProjectsPage() {
  const supabase = createClient();
  const [{ data: projects }, { data: stages }, { data: ptasks }, { data: profiles }] = await Promise.all([
    supabase.from('projects').select('*').order('created_at', { ascending: false }),
    supabase.from('project_stages').select('*').order('position'),
    supabase.from('project_tasks').select('*').order('position'),
    supabase.from('profiles').select('*').order('first_name'),
  ]);

  return (
    <ProjectsList
      initialProjects={projects ?? []}
      initialStages={stages ?? []}
      initialTasks={ptasks ?? []}
      profiles={profiles ?? []}
    />
  );
}
