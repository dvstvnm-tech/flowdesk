import { createClient } from '@/lib/supabase/server';
import KanbanBoard from '@/components/KanbanBoard';

export default async function BoardPage() {
  const supabase = createClient();
  const [{ data: tasks }, { data: profiles }, { data: projects }, { data: stages }, { data: projectTasks }] = await Promise.all([
    supabase.from('tasks').select('*').order('position'),
    supabase.from('profiles').select('*').order('first_name'),
    supabase.from('projects').select('*').order('created_at', { ascending: false }),
    supabase.from('project_stages').select('*').order('position'),
    supabase.from('project_tasks').select('*').order('position'),
  ]);

  return (
    <KanbanBoard
      initialTasks={tasks ?? []}
      profiles={profiles ?? []}
      initialProjects={projects ?? []}
      initialStages={stages ?? []}
      initialProjectTasks={projectTasks ?? []}
    />
  );
}
