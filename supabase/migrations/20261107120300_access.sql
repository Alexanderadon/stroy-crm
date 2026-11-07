-- Права доступа. Здесь работают два независимых уровня:
-- 1. GRANT решает, какие действия и с какими колонками вообще разрешены.
-- 2. RLS решает, с какими строками можно работать.
-- RLS сама по себе не ограничивает колонки: без шага 1 исполнитель,
-- которому видна его задача, смог бы переписать в ней статус или автора.

-- Сначала забираем всё, потому что Supabase по умолчанию выдаёт широкие права.
-- Право на колонку не действует, пока есть право на всю таблицу.
revoke all on public.profiles, public.objects, public.tasks, public.task_history
  from public, anon, authenticated;

grant select on public.profiles, public.objects, public.tasks, public.task_history
  to authenticated;

grant insert (name, address), update (name, address)
  on public.objects to authenticated;

-- status, author_id, created_at и deleted_at клиент записать не может.
grant insert (title, description, object_id, assignee_id),
      update (title, description, object_id, assignee_id)
  on public.tasks to authenticated;

-- На profiles и task_history записи через API нет. DELETE не выдан никому.
-- Служебный ключ нужен только локальному seed-скрипту, чтобы назначить роли.
grant select, update on public.profiles to service_role;
grant select on public.objects, public.tasks, public.task_history to service_role;

-- Функции: по умолчанию выполнять может кто угодно, поэтому закрываем все
-- и открываем только те, что нужны интерфейсу.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.is_manager() to authenticated;
grant execute on function public.change_task_status(uuid, public.task_status, text) to authenticated;
grant execute on function public.delete_task(uuid) to authenticated;
grant execute on function public.delete_object(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.objects enable row level security;
alter table public.tasks enable row level security;
alter table public.task_history enable row level security;

-- Вызовы обёрнуты в (select ...), чтобы база считала их один раз на запрос, а не на строку.

-- Исполнитель видит себя и постановщиков, но не список других исполнителей.
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or role = 'manager'
    or (select public.is_manager())
  );

create policy objects_select on public.objects
  for select to authenticated
  using (
    deleted_at is null
    and (
      (select public.is_manager())
      or exists (
        select 1
        from public.tasks t
        where t.object_id = objects.id
          and t.assignee_id = (select auth.uid())
          and t.deleted_at is null
      )
    )
  );

create policy objects_insert on public.objects
  for insert to authenticated
  with check ((select public.is_manager()));

create policy objects_update on public.objects
  for update to authenticated
  using (deleted_at is null and (select public.is_manager()))
  with check ((select public.is_manager()));

create policy tasks_select on public.tasks
  for select to authenticated
  using (
    deleted_at is null
    and (
      (select public.is_manager())
      or assignee_id = (select auth.uid())
    )
  );

create policy tasks_insert on public.tasks
  for insert to authenticated
  with check ((select public.is_manager()));

create policy tasks_update on public.tasks
  for update to authenticated
  using (deleted_at is null and (select public.is_manager()))
  with check ((select public.is_manager()));

-- Постановщик видит и историю скрытых задач: удаление не стирает следов.
create policy task_history_select on public.task_history
  for select to authenticated
  using (
    (select public.is_manager())
    or exists (
      select 1
      from public.tasks t
      where t.id = task_history.task_id
        and t.assignee_id = (select auth.uid())
        and t.deleted_at is null
    )
  );
