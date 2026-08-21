import { createClient } from '@/lib/supabase/server';
import EmployeesGrid from '@/components/EmployeesGrid';

export default async function EmployeesPage() {
  const supabase = createClient();
  const { data: profiles } = await supabase.from('profiles').select('*').order('first_name');
  const { data: tasks } = await supabase.from('tasks').select('id, assignee_id, status');
  const { data: projects } = await supabase.from('projects').select('id, owner_id, approval_status');
  const { data: departments } = await supabase.from('departments').select('*');

  return <EmployeesGrid profiles={profiles ?? []} tasks={tasks ?? []} projects={projects ?? []} departments={departments ?? []} />;
}
