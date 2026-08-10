import { createClient } from '@/lib/supabase/server';
import KanbanBoard from '@/components/KanbanBoard';

export default async function BoardPage() {
  const supabase = createClient();
  const [{ data: tasks }, { data: profiles }, { data: subtasks }] = await Promise.all([
    supabase.from('tasks').select('*').order('position'),
    supabase.from('profiles').select('*').order('first_name'),
    supabase.from('subtasks').select('*').order('position'),
  ]);

  return <KanbanBoard initialTasks={tasks ?? []} profiles={profiles ?? []} initialSubtasks={subtasks ?? []} />;
}
