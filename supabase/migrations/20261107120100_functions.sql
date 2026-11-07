-- Функции бизнес-логики. Все они работают с правами владельца базы (security definer),
-- поэтому каждая сама проверяет, кто её вызвал, а search_path пуст: подменить таблицу
-- или функцию через схему нельзя.

-- Роль текущего пользователя читается из таблицы при каждом запросе,
-- поэтому снятие роли действует сразу, а не после истечения токена.
create function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid()) and role = 'manager'
  );
$$;

-- Единственное место, где перечислены разрешённые переходы статусов.
create function public.is_valid_status_transition(
  p_from public.task_status,
  p_to public.task_status
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (p_from::text, p_to::text) in (
    ('new', 'in_progress'),
    ('in_progress', 'review'),
    ('review', 'accepted'),
    ('review', 'rework'),
    ('rework', 'in_progress')
  );
$$;

-- Единственный способ сменить статус. Смена статуса и запись в историю происходят
-- в одной транзакции. Автор, время и исходный статус берутся на сервере,
-- поэтому подделать запись истории через параметры нельзя.
create function public.change_task_status(
  p_task_id uuid,
  p_to_status public.task_status,
  p_comment text default null
)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role;
  v_actor_name text;
  v_comment text := nullif(btrim(p_comment), '');
  v_task public.tasks;
  v_from public.task_status;
begin
  select role, full_name into v_role, v_actor_name
  from public.profiles
  where id = v_user_id;

  if not found then
    raise exception 'Требуется вход в систему' using errcode = '42501';
  end if;

  -- Блокировка строки: при одновременных нажатиях второй запрос дождётся первого
  -- и будет проверен уже по новому статусу.
  select * into v_task
  from public.tasks
  where id = p_task_id and deleted_at is null
  for update;

  -- Чужая и несуществующая задача дают один ответ: нельзя узнать, что задача существует.
  if not found or (v_role <> 'manager' and v_task.assignee_id <> v_user_id) then
    raise exception 'Задача не найдена' using errcode = 'P0002';
  end if;

  v_from := v_task.status;

  if not coalesce(public.is_valid_status_transition(v_from, p_to_status), false) then
    raise exception 'Такой переход статуса запрещён';
  end if;

  -- Принять или вернуть может постановщик, остальные переходы делает назначенный исполнитель.
  if p_to_status in ('accepted', 'rework') then
    if v_role <> 'manager' then
      raise exception 'Это действие доступно только постановщику' using errcode = '42501';
    end if;
  elsif v_task.assignee_id <> v_user_id then
    raise exception 'Это действие доступно только назначенному исполнителю' using errcode = '42501';
  end if;

  if p_to_status = 'rework' and v_comment is null then
    raise exception 'При возврате на доработку нужен комментарий';
  end if;

  if char_length(v_comment) > 2000 then
    raise exception 'Комментарий должен быть не длиннее 2000 символов';
  end if;

  update public.tasks
  set status = p_to_status
  where id = p_task_id
  returning * into v_task;

  insert into public.task_history (task_id, from_status, to_status, comment, actor_id, actor_name)
  values (p_task_id, v_from, p_to_status, v_comment, v_user_id, v_actor_name);

  return v_task;
end;
$$;

-- Мягкое удаление идёт через функцию: обычный UPDATE здесь не сработал бы,
-- потому что новая строка перестала бы проходить политику чтения.
create function public.delete_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_manager() then
    raise exception 'Удалять задачи может только постановщик' using errcode = '42501';
  end if;

  update public.tasks
  set deleted_at = now()
  where id = p_task_id and deleted_at is null;

  if not found then
    raise exception 'Задача не найдена' using errcode = 'P0002';
  end if;
end;
$$;

create function public.delete_object(p_object_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_manager() then
    raise exception 'Удалять объекты может только постановщик' using errcode = '42501';
  end if;

  -- Блокировка не даёт добавить задачу в объект, пока идёт его удаление.
  perform 1
  from public.objects
  where id = p_object_id and deleted_at is null
  for update;

  if not found then
    raise exception 'Объект не найден' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.tasks
    where object_id = p_object_id and deleted_at is null
  ) then
    raise exception 'В объекте есть задачи: сначала удалите их или перенесите на другой объект';
  end if;

  update public.objects
  set deleted_at = now()
  where id = p_object_id;
end;
$$;
