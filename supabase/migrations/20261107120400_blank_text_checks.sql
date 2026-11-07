-- Исправление, ошибку нашёл scripts/security-check.ts.
-- btrim() без аргументов убирает только обычные пробелы, поэтому текст из переводов
-- строк считался непустым и проходил как обязательный комментарий или название.
-- Теперь пустым считается текст из любых пробельных символов, включая неразрывный пробел.

alter table public.profiles
  drop constraint profiles_full_name_check,
  add constraint profiles_full_name_check
    check (full_name ~ '[^\s ]' and char_length(full_name) <= 200);

alter table public.objects
  drop constraint objects_name_check,
  add constraint objects_name_check
    check (name ~ '[^\s ]' and char_length(name) <= 200),
  drop constraint objects_address_check,
  add constraint objects_address_check
    check (address ~ '[^\s ]' and char_length(address) <= 300);

alter table public.tasks
  drop constraint tasks_title_check,
  add constraint tasks_title_check
    check (title ~ '[^\s ]' and char_length(title) <= 200);

-- Изменилось только вычисление v_comment. Права на функцию сохраняются.
create or replace function public.change_task_status(
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
  v_comment text := nullif(regexp_replace(p_comment, '^[\s ]+|[\s ]+$', '', 'g'), '');
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
