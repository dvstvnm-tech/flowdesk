-- ============================================================================
-- FLOWDESK — Supabase schema (v2, упрощённая под единую общую доску)
-- Выполните этот файл целиком в Supabase Dashboard → SQL Editor → New query
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_cron"; -- для напоминаний о дедлайнах по расписанию

create type user_role as enum ('administrator','manager','employee','viewer');
create type task_status as enum ('backlog','todo','in_progress','review','done','approved');
create type task_priority as enum ('high','medium','low');
create type notification_type as enum ('assigned','comment','status_change','deadline','mention');

-- ============================================================================
-- ОТДЕЛЫ (используются только как поле профиля пользователя "Отдел")
-- ============================================================================
create table public.departments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

insert into public.departments (name) values
  ('Отдел развития и обучения'),
  ('Отдел оценки и мотивации'),
  ('Отдел кадрового администрирования'),
  ('Отдел подбора и адаптации');

-- ============================================================================
-- ПОЛЬЗОВАТЕЛИ (profiles расширяет auth.users)
-- ============================================================================
create table public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  first_name        text not null default '',
  last_name         text not null default '',
  email             text not null,
  avatar_url        text,               -- фото Google
  department_id     uuid references public.departments(id) on delete set null,
  role              user_role not null default 'employee',
  created_at        timestamptz not null default now(),
  last_sign_in_at   timestamptz
);
comment on table public.profiles is 'Имя, фамилия, email, фото Google, отдел и роль — создаётся автоматически при первом входе';

-- ============================================================================
-- ЗАДАЧИ — одна общая доска для всей команды
-- ============================================================================
create sequence public.task_code_seq start 1000;

create table public.tasks (
  id               uuid primary key default gen_random_uuid(),
  code             text not null default ('T-' || nextval('public.task_code_seq')::text) unique,
  title            text not null,
  description      text default '',
  status           task_status not null default 'backlog',
  priority         task_priority not null default 'medium',
  assignee_id      uuid references public.profiles(id) on delete set null,  -- Исполнитель
  reporter_id      uuid references public.profiles(id) on delete set null,  -- Постановщик
  due_date         timestamptz,                                             -- Дедлайн
  deadline_notified boolean not null default false,                        -- чтобы не дублировать напоминания
  position         integer not null default 0,
  created_at       timestamptz not null default now(),                     -- Дата создания
  updated_at       timestamptz not null default now()
);
create index tasks_status_idx on public.tasks(status);
create index tasks_assignee_idx on public.tasks(assignee_id);
create index tasks_due_idx on public.tasks(due_date) where status <> 'done';

create table public.subtasks (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid references public.tasks(id) on delete cascade,
  title      text not null,
  is_done    boolean not null default false,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.comments (
  id                 uuid primary key default gen_random_uuid(),
  task_id            uuid references public.tasks(id) on delete cascade,
  author_id          uuid references public.profiles(id) on delete set null,
  text               text not null,
  mentioned_user_ids uuid[] default '{}',
  created_at         timestamptz not null default now(),
  edited_at          timestamptz
);
create index comments_task_idx on public.comments(task_id, created_at);

create table public.attachments (
  id                uuid primary key default gen_random_uuid(),
  task_id           uuid references public.tasks(id) on delete cascade,
  comment_id        uuid references public.comments(id) on delete cascade, -- файл/изображение прикреплён к комментарию, если задано
  uploaded_by       uuid references public.profiles(id) on delete set null,
  file_name         text not null,
  file_type         text,
  file_size_bytes   bigint,
  storage_path      text not null,
  created_at        timestamptz not null default now()
);

create table public.activity_log (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid references public.tasks(id) on delete cascade,
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text not null,
  payload     jsonb default '{}',
  created_at  timestamptz not null default now()
);
create index activity_log_task_idx on public.activity_log(task_id, created_at);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete cascade,
  type        notification_type not null,
  task_id     uuid references public.tasks(id) on delete cascade,
  text        text not null,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, is_read, created_at desc);

-- ============================================================================
-- ТРИГГЕРЫ
-- ============================================================================

-- 1) Автосоздание профиля при первом входе через Google
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, first_name, last_name, email, avatar_url, last_sign_in_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'given_name', split_part(coalesce(new.raw_user_meta_data->>'full_name', new.email), ' ', 1)),
    coalesce(new.raw_user_meta_data->>'family_name', ''),
    new.email,
    new.raw_user_meta_data->>'avatar_url',
    now()
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.handle_user_sign_in()
returns trigger as $$
begin
  update public.profiles set last_sign_in_at = now() where id = new.id;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_sign_in
  after update of last_sign_in_at on auth.users
  for each row execute procedure public.handle_user_sign_in();

-- 2) updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute procedure public.set_updated_at();

-- 3) Журнал изменений + уведомления: создание / смена статуса / назначение исполнителя
create or replace function public.log_task_changes()
returns trigger as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.activity_log (task_id, actor_id, action, payload)
    values (new.id, new.reporter_id, 'created', jsonb_build_object('title', new.title));
    if new.assignee_id is not null then
      insert into public.notifications (user_id, type, task_id, text)
      values (new.assignee_id, 'assigned', new.id, 'Вам назначена задача «'||new.title||'»');
    end if;
    return new;
  end if;

  if (tg_op = 'UPDATE') then
    if new.status is distinct from old.status then
      insert into public.activity_log (task_id, actor_id, action, payload)
      values (new.id, new.assignee_id, 'status_changed', jsonb_build_object('from', old.status, 'to', new.status));
      if new.reporter_id is not null then
        insert into public.notifications (user_id, type, task_id, text)
        values (new.reporter_id, 'status_change', new.id, 'Статус задачи «'||new.title||'» изменён');
      end if;
    end if;
    if new.assignee_id is distinct from old.assignee_id and new.assignee_id is not null then
      insert into public.activity_log (task_id, actor_id, action, payload)
      values (new.id, new.assignee_id, 'assigned', jsonb_build_object('assignee_id', new.assignee_id));
      insert into public.notifications (user_id, type, task_id, text)
      values (new.assignee_id, 'assigned', new.id, 'Вам назначена задача «'||new.title||'»');
    end if;
    if new.due_date is distinct from old.due_date then
      new.deadline_notified := false;
    end if;
    return new;
  end if;

  return null;
end;
$$ language plpgsql security definer;

create trigger tasks_log_changes
  before insert or update on public.tasks
  for each row execute procedure public.log_task_changes();

-- 4) Комментарии: журнал + уведомления (включая упоминания @Имя)
create or replace function public.handle_new_comment()
returns trigger as $$
declare
  t record;
  notify_user uuid;
begin
  select * into t from public.tasks where id = new.task_id;

  insert into public.activity_log (task_id, actor_id, action, payload)
  values (new.task_id, new.author_id, 'commented', jsonb_build_object('comment_id', new.id));

  foreach notify_user in array array[t.assignee_id, t.reporter_id]::uuid[] loop
    if notify_user is not null and notify_user <> new.author_id then
      insert into public.notifications (user_id, type, task_id, text)
      values (notify_user, 'comment', new.task_id, 'Новый комментарий в задаче «'||t.title||'»');
    end if;
  end loop;

  if new.mentioned_user_ids is not null then
    foreach notify_user in array new.mentioned_user_ids loop
      if notify_user <> new.author_id then
        insert into public.notifications (user_id, type, task_id, text)
        values (notify_user, 'mention', new.task_id, 'Вас упомянули в задаче «'||t.title||'»');
      end if;
    end loop;
  end if;

  return new;
end;
$$ language plpgsql security definer;

create trigger comments_notify
  after insert on public.comments
  for each row execute procedure public.handle_new_comment();

-- 5) Напоминания о приближении дедлайна — запускается по расписанию (pg_cron)
create or replace function public.notify_upcoming_deadlines()
returns void as $$
begin
  insert into public.notifications (user_id, type, task_id, text)
  select t.assignee_id, 'deadline', t.id, 'Дедлайн задачи «'||t.title||'» приближается'
  from public.tasks t
  where t.assignee_id is not null
    and t.status <> 'done'
    and t.deadline_notified = false
    and t.due_date is not null
    and t.due_date <= now() + interval '24 hours'
    and t.due_date >= now();

  update public.tasks
  set deadline_notified = true
  where status <> 'done'
    and deadline_notified = false
    and due_date is not null
    and due_date <= now() + interval '24 hours'
    and due_date >= now();
end;
$$ language plpgsql security definer;

-- Запускать каждый час (в Supabase Dashboard → Database → Extensions включите pg_cron, если команда ниже выдаст ошибку)
select cron.schedule('notify-upcoming-deadlines', '0 * * * *', $$select public.notify_upcoming_deadlines();$$);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.profiles      enable row level security;
alter table public.departments   enable row level security;
alter table public.tasks         enable row level security;
alter table public.subtasks      enable row level security;
alter table public.comments      enable row level security;
alter table public.attachments   enable row level security;
alter table public.activity_log  enable row level security;
alter table public.notifications enable row level security;

create or replace function public.current_user_role()
returns user_role as $$
  select role from public.profiles where id = auth.uid();
$$ language sql stable security definer;

create policy "profiles_select_all" on public.profiles for select using (auth.uid() is not null);
create policy "profiles_update_self" on public.profiles for update using (id = auth.uid() or public.current_user_role() = 'administrator');

create policy "departments_select_all" on public.departments for select using (auth.uid() is not null);
create policy "departments_write_admins" on public.departments for all using (public.current_user_role() = 'administrator');

-- одна общая доска — все авторизованные видят все задачи
create policy "tasks_select_all" on public.tasks for select using (auth.uid() is not null);
create policy "tasks_insert" on public.tasks for insert with check (
  public.current_user_role() in ('administrator','manager')
  or assignee_id = auth.uid()
);
create policy "tasks_update" on public.tasks for update using (
  public.current_user_role() in ('administrator','manager')
  or assignee_id = auth.uid()
  or reporter_id = auth.uid()
);
create policy "tasks_delete" on public.tasks for delete using (
  public.current_user_role() in ('administrator','manager') or reporter_id = auth.uid()
);

create policy "subtasks_all" on public.subtasks for all using (auth.uid() is not null);
create policy "comments_select" on public.comments for select using (auth.uid() is not null);
create policy "comments_insert" on public.comments for insert with check (author_id = auth.uid());
create policy "comments_update_own" on public.comments for update using (author_id = auth.uid());
create policy "attachments_all" on public.attachments for all using (auth.uid() is not null);
create policy "activity_log_select" on public.activity_log for select using (auth.uid() is not null);

create policy "notifications_select_own" on public.notifications for select using (user_id = auth.uid());
create policy "notifications_update_own" on public.notifications for update using (user_id = auth.uid());

-- ============================================================================
-- REALTIME
-- ============================================================================
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.subtasks;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.activity_log;

-- ============================================================================
-- STORAGE
-- ============================================================================
insert into storage.buckets (id, name, public) values ('attachments', 'attachments', false)
on conflict (id) do nothing;

create policy "attachments_storage_read" on storage.objects for select using (bucket_id = 'attachments' and auth.uid() is not null);
create policy "attachments_storage_write" on storage.objects for insert with check (bucket_id = 'attachments' and auth.uid() is not null);
create policy "attachments_storage_delete" on storage.objects for delete using (bucket_id = 'attachments' and auth.uid() is not null);

-- ============================================================================
-- Готово. Данные не сеются намеренно — рабочее пространство пустое.
-- ============================================================================
