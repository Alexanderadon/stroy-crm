-- Исправление, ошибку нашёл аудит кода и подтвердил scripts/security-check.ts.
-- Триггер срабатывает раньше проверки RLS, поэтому исполнитель, пытаясь создать задачу,
-- получал разные ответы и мог узнать, существует ли объект и кто является исполнителем.
-- Теперь роль при создании проверяется первой, и отказ всегда одинаковый.
--
-- Проверка только для INSERT: смена статуса исполнителем идёт через change_task_status
-- и обновляет строку от его имени. При UPDATE подсказки нет: политика RLS отсекает
-- недоступные строки раньше триггера.
create or replace function public.guard_task_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and auth.uid() is not null and not public.is_manager() then
    raise exception 'Создавать задачи может только постановщик' using errcode = '42501';
  end if;

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
