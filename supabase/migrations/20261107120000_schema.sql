-- Типы, таблицы и индексы.
-- Функции, триггеры и права лежат в следующих миграциях.

create type public.user_role as enum ('manager', 'executor');

-- new = Новая, in_progress = В работе, review = На проверке,
-- accepted = Принята, rework = На доработке.
create type public.task_status as enum ('new', 'in_progress', 'review', 'accepted', 'rework');

-- Роль хранится здесь, а не в user_metadata: метаданные пользователь может менять сам.
-- Новый пользователь всегда исполнитель. Повысить роль может только администратор.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 200),
  role public.user_role not null default 'executor',
  created_at timestamptz not null default now()
);

create table public.objects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  address text not null check (char_length(btrim(address)) between 1 and 300),
  created_at timestamptz not null default now(),
  -- Мягкое удаление: запись скрывается, но остаётся в базе.
  deleted_at timestamptz
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 5000),
  object_id uuid not null references public.objects (id) on delete restrict,
  assignee_id uuid not null references public.profiles (id) on delete restrict,
  status public.task_status not null default 'new',
  -- Автора нельзя подменить: клиент не имеет права писать в эту колонку.
  author_id uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index tasks_object_id_idx on public.tasks (object_id);
create index tasks_assignee_id_idx on public.tasks (assignee_id);

-- Журнал только дополняется. on delete restrict не даёт стереть его вместе с задачей.
-- actor_name хранит имя на момент действия: исполнитель не видит список других
-- исполнителей, но должен видеть в истории, кто работал над задачей до него.
create table public.task_history (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks (id) on delete restrict,
  from_status public.task_status,
  to_status public.task_status not null,
  comment text check (char_length(comment) <= 2000),
  actor_id uuid not null references public.profiles (id) on delete restrict,
  actor_name text not null,
  created_at timestamptz not null default now()
);

create index task_history_task_id_idx on public.task_history (task_id, id);
