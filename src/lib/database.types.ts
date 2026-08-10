// Соответствует supabase/schema.sql.
// Для полной генерации из реальной БД:
//   npx supabase gen types typescript --project-id <ваш-project-id> > src/lib/database.types.ts

export type UserRole = 'administrator' | 'manager' | 'employee' | 'viewer';
export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done' | 'approved';
export type TaskPriority = 'high' | 'medium' | 'low';
export type NotificationType = 'assigned' | 'comment' | 'status_change' | 'deadline' | 'mention';

export interface Department {
  id: string;
  name: string;
  created_at: string;
}

export interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url: string | null;
  department_id: string | null;
  role: UserRole;
  created_at: string;
  last_sign_in_at: string | null;
}

export interface Task {
  id: string;
  code: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string | null;
  reporter_id: string | null;
  due_date: string | null;
  deadline_notified: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface Subtask {
  id: string;
  task_id: string;
  title: string;
  is_done: boolean;
  position: number;
}

export interface Comment {
  id: string;
  task_id: string;
  author_id: string;
  text: string;
  mentioned_user_ids: string[];
  created_at: string;
  edited_at: string | null;
}

export interface Attachment {
  id: string;
  task_id: string;
  comment_id: string | null;
  uploaded_by: string;
  file_name: string;
  file_type: string;
  file_size_bytes: number;
  storage_path: string;
  created_at: string;
}

export interface ActivityLogEntry {
  id: string;
  task_id: string;
  actor_id: string | null;
  action: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  task_id: string | null;
  text: string;
  is_read: boolean;
  created_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
