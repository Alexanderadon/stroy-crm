-- Подготовка к росту данных. Правила доступа не меняются.

-- Индексы для внешних ключей, которых не хватало.
create index tasks_author_id_idx on public.tasks (author_id);
create index task_history_actor_id_idx on public.task_history (actor_id);

-- Индексы под экраны: только неудалённые записи и в том порядке, в каком они выводятся.
-- Мягко удалённые строки копятся, но в эти индексы не попадают.
create index objects_active_name_idx on public.objects (name, id)
  where deleted_at is null;
create index tasks_active_object_idx on public.tasks (object_id, created_at, id)
  where deleted_at is null;
create index tasks_active_assignee_idx on public.tasks (assignee_id, created_at desc, id)
  where deleted_at is null;

-- Раньше задачи проверялись отдельно для каждого объекта. Теперь список объектов
-- исполнителя считается один раз на запрос. Условие доступа то же самое.
alter policy objects_select on public.objects
  using (
    deleted_at is null
    and (
      (select public.is_manager())
      or id in (
        select t.object_id
        from public.tasks t
        where t.assignee_id = (select auth.uid())
          and t.deleted_at is null
      )
    )
  );

-- Версия записи защищает от потери правок: если два постановщика открыли одну запись,
-- правка второго не пройдёт и не затрёт первую. Клиент только передаёт версию,
-- которую прочитал. Записать в эту колонку он не может: права на неё не выданы.
alter table public.objects add column updated_at timestamptz not null default now();
alter table public.tasks add column updated_at timestamptz not null default now();

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Новая функция по умолчанию доступна всем, поэтому право забираем сразу.
revoke execute on function public.set_updated_at() from public, anon, authenticated;

create trigger objects_set_updated_at
  before update on public.objects
  for each row execute function public.set_updated_at();

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();
