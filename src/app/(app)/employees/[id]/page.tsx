import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import EmployeeBoard from '@/components/EmployeeBoard';

export default async function EmployeeProfilePage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', params.id).single();
  if (!profile) notFound();

  const [{ data: department }, { data: allProfiles }, { data: tasks }, { data: projects }, { data: stages }, { data: projectTasks }] = await Promise.all([
    profile.department_id
      ? supabase.from('departments').select('*').eq('id', profile.department_id).single()
      : Promise.resolve({ data: null }),
    supabase.from('profiles').select('*').order('first_name'),
    supabase.from('tasks').select('*').eq('assignee_id', params.id).order('position'),
    supabase.from('projects').select('*').eq('owner_id', params.id).order('created_at', { ascending: false }),
    supabase.from('project_stages').select('*').order('position'),
    supabase.from('project_tasks').select('*').order('position'),
  ]);

  return (
    <EmployeeBoard
      employeeId={params.id}
      initialProfile={profile}
      department={department ?? null}
      allProfiles={allProfiles ?? []}
      initialTasks={tasks ?? []}
      initialProjects={projects ?? []}
      initialStages={stages ?? []}
      initialProjectTasks={projectTasks ?? []}
    />
  );
}
