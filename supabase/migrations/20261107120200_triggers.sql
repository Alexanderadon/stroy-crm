-- Триггеры срабатывают при любой записи, поэтому правила ниже действуют
-- независимо от того, откуда пришёл запрос.

-- Профиль создаётся вместе с пользователем, всегда с ролью исполнителя.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    left(
      coalesce(
        nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
        nullif(split_part(new.email, '@', 1), ''),
        'Пользователь'
      ),
      200
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Второй замок после прав на колонки: даже запрос с серверными правами
-- не проведёт запрещённый переход и не изменит принятую задачу.
create function public.guard_task_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status <> 'new' then
    raise exception 'Задача создаётся только в статусе «Новая»';
  end if;

  if tg_op = 'UPDATE' then
    if new.status is distinct from old.status
       and not coalesce(public.is_valid_status_transition(old.status, new.status), false) then
      raise exception 'Такой переход статуса запрещён';
    end if;

    if old.status = 'accepted'
       and (new.title, new.description, new.object_id, new.assignee_id)
           is distinct from (old.title, old.description, old.object_id, old.assignee_id) then
      raise exception 'Принятую задачу нельзя изменить';
    end if;
  end if;

  if tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id then
    if not exists (
      select 1
      from public.profiles
      where id = new.assignee_id and role = 'executor'
    ) then
      raise exception 'Исполнителем можно назначить только пользователя с ролью исполнителя';
    end if;
  end if;

  if tg_op = 'INSERT' or new.object_id is distinct from old.object_id then
    -- Блокировка на чтение не даёт удалить объект, пока в него добавляется задача.
    perform 1
    from public.objects
    where id = new.object_id and deleted_at is null
    for share;

    if not found then
      raise exception 'Объект не найден' using errcode = 'P0002';
    end if;
  end if;

  return new;
end;
$$;

create trigger tasks_guard_write
  before insert or update on public.tasks
  for each row execute function public.guard_task_write();

-- Первая запись истории: задача создана в статусе «Новая».
create function public.log_task_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.task_history (task_id, from_status, to_status, actor_id, actor_name)
  values (
    new.id,
    null,
    new.status,
    new.author_id,
    (select full_name from public.profiles where id = new.author_id)
  );
  return null;
end;
$$;

create trigger tasks_log_created
  after insert on public.tasks
  for each row execute function public.log_task_created();

-- История неизменяема для всех, включая запросы с серверными правами.
create function public.forbid_history_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Историю статусов нельзя изменить или удалить' using errcode = '42501';
end;
$$;

create trigger task_history_forbid_change
  before update or delete on public.task_history
  for each row execute function public.forbid_history_change();

create trigger task_history_forbid_truncate
  before truncate on public.task_history
  for each statement execute function public.forbid_history_change();
