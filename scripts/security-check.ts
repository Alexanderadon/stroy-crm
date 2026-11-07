// Проверка защиты в обход интерфейса: только публичный ключ и настоящие логины,
// те же возможности, что у любого человека с открытой консолью браузера.
// Создаёт свои задачи [check] и в конце мягко удаляет их, демо-данные не трогает.
import { randomBytes } from 'node:crypto';
import { changeStatus, loadUsers, publicClient, signIn, type Session } from './lib.ts';

type Answer = { data?: unknown; error?: { message: string } | null };

const results: boolean[] = [];

function record(who: string, what: string, ok: boolean, detail?: string) {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${who.padEnd(11)} ${what}${!ok && detail ? ` [${detail}]` : ''}`);
}

/** Запрос должен завершиться ошибкой. */
async function refused(who: string, what: string, query: PromiseLike<Answer>) {
  const { error } = await query;
  record(who, what, Boolean(error), 'запрос прошёл');
}

/** Запрос должен завершиться ошибкой или не затронуть ни одной строки. */
async function noRows(who: string, what: string, query: PromiseLike<Answer>) {
  const { data, error } = await query;
  const count = Array.isArray(data) ? data.length : data ? 1 : 0;
  record(who, what, Boolean(error) || count === 0, `строк: ${count}`);
}

/** Запрос должен пройти: без таких проверок защита могла бы просто запрещать всё. */
async function allowed(who: string, what: string, query: PromiseLike<Answer>) {
  const { error } = await query;
  record(who, what, !error, error?.message);
}

const users = loadUsers();
const anon = publicClient();
const m1 = await signIn(users.manager1);
const m2 = await signIn(users.manager2);
const e1 = await signIn(users.executor1);
const e2 = await signIn(users.executor2);

const taskIds: string[] = [];
const objectIds: string[] = [];

async function newObject(name: string): Promise<string> {
  const { data, error } = await m1.client
    .from('objects')
    .insert({ name: `[check] ${name}`, address: 'Проверочный адрес' })
    .select('id')
    .single();
  if (error) throw error;
  objectIds.push(data.id);
  return data.id;
}

async function newTask(title: string, objectId: string, assignee: Session): Promise<string> {
  const { data, error } = await m1.client
    .from('tasks')
    .insert({ title: `[check] ${title}`, object_id: objectId, assignee_id: assignee.id })
    .select('id')
    .single();
  if (error) throw error;
  taskIds.push(data.id);
  return data.id;
}

async function readTask(id: string) {
  const { data, error } = await m1.client.from('tasks').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

try {
  const objA = await newObject('Объект исполнителя 1');
  const objB = await newObject('Объект исполнителя 2');
  const taskA = await newTask('Задача исполнителя 1', objA, e1);
  const taskB = await newTask('Задача исполнителя 2', objB, e2);
  const taskC = await newTask('Полный цикл', objA, e1);

  console.log('\n--- Без входа ---');
  for (const table of ['profiles', 'objects', 'tasks', 'task_history']) {
    await noRows('Аноним', `прочитать ${table}`, anon.from(table).select('*'));
  }
  await refused(
    'Аноним',
    'зарегистрироваться самостоятельно',
    anon.auth.signUp({
      email: `check-${randomBytes(4).toString('hex')}@stroy-crm.test`,
      password: randomBytes(16).toString('hex'),
    }),
  );
  await refused('Аноним', 'войти анонимно, без учётной записи', publicClient().auth.signInAnonymously());
  await refused('Аноним', 'создать объект', anon.from('objects').insert({ name: 'x', address: 'x' }));
  await refused(
    'Аноним',
    'сменить статус задачи',
    anon.rpc('change_task_status', { p_task_id: taskA, p_to_status: 'in_progress' }),
  );

  console.log('\n--- Исполнитель: чужие данные ---');
  const ownTasks = await e1.client.from('tasks').select('id, assignee_id');
  record(
    'Исполнитель',
    'в списке задач только свои, и они есть',
    !ownTasks.error &&
      (ownTasks.data ?? []).length > 0 &&
      (ownTasks.data ?? []).every((t) => t.assignee_id === e1.id),
  );
  const counted = await e1.client.from('tasks').select('id', { count: 'exact', head: true });
  record('Исполнитель', 'счётчик для постраничного вывода не учитывает чужие задачи', counted.count === ownTasks.data?.length, `счётчик: ${counted.count}`);
  await noRows('Исполнитель', 'прочитать чужую задачу', e1.client.from('tasks').select('*').eq('id', taskB));
  await noRows('Исполнитель', 'прочитать историю чужой задачи', e1.client.from('task_history').select('*').eq('task_id', taskB));
  await noRows('Исполнитель', 'прочитать объект без своих задач', e1.client.from('objects').select('*').eq('id', objB));
  const ownObject = await e1.client.from('objects').select('id').eq('id', objA);
  record('Исполнитель', 'объект со своей задачей виден', ownObject.data?.length === 1);
  const ownHistory = await e1.client.from('task_history').select('id').eq('task_id', taskA);
  record('Исполнитель', 'история своей задачи видна', (ownHistory.data?.length ?? 0) >= 1);

  const profiles = await e1.client.from('profiles').select('id, role');
  const profileRows = profiles.data ?? [];
  record(
    'Исполнитель',
    'не видит список других исполнителей',
    profileRows.some((p) => p.id === e1.id) &&
      profileRows.some((p) => p.id === m1.id) &&
      !profileRows.some((p) => p.id === e2.id),
  );

  await refused('Исполнитель', 'сменить статус чужой задачи', changeStatus(e1, taskB, 'in_progress'));
  await noRows('Исполнитель', 'изменить чужую задачу напрямую', e1.client.from('tasks').update({ title: 'взлом' }).eq('id', taskB).select());
  const notFound = await changeStatus(e1, taskB, 'in_progress');
  record('Исполнитель', 'чужая задача выглядит как несуществующая', notFound.error?.message === 'Задача не найдена', notFound.error?.message);

  console.log('\n--- Исполнитель: своя задача в обход правил ---');
  await refused('Исполнитель', 'записать статус напрямую', e1.client.from('tasks').update({ status: 'accepted' }).eq('id', taskA));
  await noRows('Исполнитель', 'изменить название', e1.client.from('tasks').update({ title: 'взлом' }).eq('id', taskA).select());
  await noRows('Исполнитель', 'переназначить задачу на другого', e1.client.from('tasks').update({ assignee_id: e2.id }).eq('id', taskA).select());
  await refused('Исполнитель', 'записать deleted_at напрямую', e1.client.from('tasks').update({ deleted_at: new Date().toISOString() }).eq('id', taskA));
  const untouched = await readTask(taskA);
  record('Исполнитель', 'после всех попыток задача не изменилась', untouched.status === 'new' && untouched.title.startsWith('[check]') && untouched.assignee_id === e1.id && untouched.deleted_at === null);

  await refused('Исполнитель', 'создать задачу', e1.client.from('tasks').insert({ title: 'x', object_id: objA, assignee_id: e1.id }));
  // Ответ не должен зависеть от того, существует ли объект и кто указан исполнителем.
  const refusals = await Promise.all([
    e1.client.from('tasks').insert({ title: 'x', object_id: objA, assignee_id: e1.id }),
    e1.client.from('tasks').insert({ title: 'x', object_id: objA, assignee_id: m1.id }),
    e1.client.from('tasks').insert({ title: 'x', object_id: '00000000-0000-0000-0000-000000000000', assignee_id: e1.id }),
  ]);
  record(
    'Исполнитель',
    'отказ при создании задачи ничего не раскрывает о чужих данных',
    refusals.every((r) => r.error?.code === '42501' && r.error.message === refusals[0].error?.message),
    refusals.map((r) => r.error?.code).join(', '),
  );
  await refused('Исполнитель', 'создать объект', e1.client.from('objects').insert({ name: 'x', address: 'x' }));
  await noRows('Исполнитель', 'изменить объект', e1.client.from('objects').update({ name: 'взлом' }).eq('id', objA).select());
  await refused('Исполнитель', 'удалить задачу запросом DELETE', e1.client.from('tasks').delete().eq('id', taskA));
  await refused('Исполнитель', 'удалить задачу функцией', e1.client.rpc('delete_task', { p_task_id: taskA }));
  await refused('Исполнитель', 'удалить объект функцией', e1.client.rpc('delete_object', { p_object_id: objA }));

  console.log('\n--- Исполнитель: запрещённые переходы ---');
  for (const to of ['review', 'accepted', 'rework', 'new']) {
    await refused('Исполнитель', `new -> ${to}`, changeStatus(e1, taskA, to));
  }
  await allowed('Исполнитель', 'new -> in_progress (разрешено)', changeStatus(e1, taskA, 'in_progress'));
  for (const to of ['accepted', 'rework', 'new', 'in_progress']) {
    await refused('Исполнитель', `in_progress -> ${to}`, changeStatus(e1, taskA, to));
  }
  await allowed('Исполнитель', 'in_progress -> review (разрешено)', changeStatus(e1, taskA, 'review'));
  await refused('Исполнитель', 'принять свою задачу', changeStatus(e1, taskA, 'accepted'));
  await refused('Исполнитель', 'вернуть свою задачу с комментарием', changeStatus(e1, taskA, 'rework', 'сам себе'));
  await refused('Второй исп.', 'сменить статус задачи коллеги', changeStatus(e2, taskA, 'accepted'));

  console.log('\n--- Исполнитель: подделка роли и истории ---');
  await refused('Исполнитель', 'записать себе роль постановщика', e1.client.from('profiles').update({ role: 'manager' }).eq('id', e1.id));
  await allowed('Исполнитель', 'записать role: manager в свои метаданные (Auth это разрешает)', e1.client.auth.updateUser({ data: { role: 'manager' } }));
  await e1.client.auth.refreshSession();
  const stillExecutor = await e1.client.rpc('is_manager');
  record('Исполнитель', 'метаданные не дали роль постановщика', stillExecutor.data === false);
  await refused('Исполнитель', 'после этого создать объект', e1.client.from('objects').insert({ name: 'x', address: 'x' }));
  await e1.client.auth.updateUser({ data: { role: null } });

  await refused(
    'Исполнитель',
    'добавить запись в историю',
    e1.client.from('task_history').insert({ task_id: taskA, to_status: 'accepted', actor_id: m1.id, actor_name: 'Подделка' }),
  );
  await refused('Исполнитель', 'изменить запись истории', e1.client.from('task_history').update({ comment: 'взлом' }).eq('task_id', taskA));
  await refused('Исполнитель', 'удалить запись истории', e1.client.from('task_history').delete().eq('task_id', taskA));
  await refused(
    'Исполнитель',
    'передать в функцию чужого автора',
    e1.client.rpc('change_task_status', { p_task_id: taskC, p_to_status: 'in_progress', p_actor_id: m1.id }),
  );

  console.log('\n--- Постановщик: обход правил ---');
  const allTasks = await m1.client.from('tasks').select('id').in('id', [taskA, taskB]);
  record('Постановщик', 'видит задачи всех исполнителей', allTasks.data?.length === 2);
  await refused('Постановщик', 'записать статус напрямую', m1.client.from('tasks').update({ status: 'accepted' }).eq('id', taskC));
  await refused('Постановщик', 'подменить автора', m1.client.from('tasks').update({ author_id: m2.id }).eq('id', taskC));
  await refused('Постановщик', 'подменить дату создания', m1.client.from('tasks').update({ created_at: '2000-01-01' }).eq('id', taskC));
  await refused('Постановщик', 'создать задачу сразу принятой', m1.client.from('tasks').insert({ title: 'x', object_id: objA, assignee_id: e1.id, status: 'accepted' }));
  await refused('Постановщик', 'создать задачу с чужим автором', m1.client.from('tasks').insert({ title: 'x', object_id: objA, assignee_id: e1.id, author_id: m2.id }));
  await refused('Постановщик', 'назначить исполнителем постановщика', m1.client.from('tasks').insert({ title: 'x', object_id: objA, assignee_id: m2.id }));
  await refused('Постановщик', 'переназначить задачу на постановщика', m1.client.from('tasks').update({ assignee_id: m2.id }).eq('id', taskC));
  await refused('Постановщик', 'создать задачу в несуществующем объекте', m1.client.from('tasks').insert({ title: 'x', object_id: '00000000-0000-0000-0000-000000000000', assignee_id: e1.id }));
  await refused('Постановщик', 'создать задачу с пустым названием', m1.client.from('tasks').insert({ title: '   ', object_id: objA, assignee_id: e1.id }));
  await refused('Постановщик', 'создать задачу с названием из переводов строк', m1.client.from('tasks').insert({ title: ' \n\t ', object_id: objA, assignee_id: e1.id }));
  await refused('Постановщик', 'создать объект с адресом из пробелов', m1.client.from('objects').insert({ name: '[check] x', address: ' \n ' }));
  await refused('Постановщик', 'взять задачу в работу за исполнителя', changeStatus(m1, taskC, 'in_progress'));
  await refused('Постановщик', 'принять задачу, минуя проверку', changeStatus(m1, taskC, 'accepted'));
  await refused('Постановщик', 'изменить запись истории', m1.client.from('task_history').update({ comment: 'взлом' }).eq('task_id', taskC));
  await refused('Постановщик', 'удалить запись истории', m1.client.from('task_history').delete().eq('task_id', taskC));
  await refused('Постановщик', 'удалить задачу запросом DELETE', m1.client.from('tasks').delete().eq('id', taskC));
  await refused('Постановщик', 'удалить объект запросом DELETE', m1.client.from('objects').delete().eq('id', objA));
  await refused('Постановщик', 'удалить объект с задачами', m1.client.rpc('delete_object', { p_object_id: objA }));

  console.log('\n--- Правки и смена исполнителя (разрешено) ---');
  await allowed('Постановщик', 'изменить название и описание', m1.client.from('tasks').update({ title: '[check] Полный цикл, новое название', description: 'Обновлено' }).eq('id', taskC));
  await allowed('Постановщик', 'передать задачу другому исполнителю', m1.client.from('tasks').update({ assignee_id: e2.id }).eq('id', taskC));
  await noRows('Исполнитель', 'прежний исполнитель потерял доступ', e1.client.from('tasks').select('*').eq('id', taskC));
  await allowed('Постановщик', 'вернуть задачу первому исполнителю', m1.client.from('tasks').update({ assignee_id: e1.id }).eq('id', taskC));

  console.log('\n--- Одновременная правка ---');
  await refused('Постановщик', 'записать версию задачи напрямую', m1.client.from('tasks').update({ updated_at: '2000-01-01' }).eq('id', taskC));
  await refused('Постановщик', 'записать версию объекта напрямую', m1.client.from('objects').update({ updated_at: '2000-01-01' }).eq('id', objB));
  const opened = await readTask(taskC);
  await allowed('Постановщик', 'первая правка задачи проходит', m1.client.from('tasks').update({ description: 'Правка первого' }).eq('id', taskC).eq('updated_at', opened.updated_at));
  await noRows('Второй пост.', 'правка по устаревшей версии не проходит', m2.client.from('tasks').update({ description: 'Правка второго' }).eq('id', taskC).eq('updated_at', opened.updated_at).select());
  const edited = await readTask(taskC);
  record('Постановщик', 'первая правка не затёрта', edited.description === 'Правка первого' && edited.updated_at !== opened.updated_at, edited.description);
  await allowed('Второй пост.', 'правка по новой версии проходит', m2.client.from('tasks').update({ description: 'Правка второго' }).eq('id', taskC).eq('updated_at', edited.updated_at));
  const objectRead = await m1.client.from('objects').select('updated_at').eq('id', objB).single();
  await allowed('Постановщик', 'первая правка объекта проходит', m1.client.from('objects').update({ address: 'Новый адрес' }).eq('id', objB).eq('updated_at', objectRead.data?.updated_at));
  await noRows('Второй пост.', 'правка объекта по устаревшей версии не проходит', m2.client.from('objects').update({ address: 'Другой адрес' }).eq('id', objB).eq('updated_at', objectRead.data?.updated_at).select());

  console.log('\n--- Полный цикл ---');
  const beforeMove = await readTask(taskC);
  await allowed('Исполнитель', 'new -> in_progress', changeStatus(e1, taskC, 'in_progress'));
  const afterMove = await readTask(taskC);
  record('Исполнитель', 'смена статуса обновляет версию задачи', afterMove.updated_at !== beforeMove.updated_at);
  await allowed('Исполнитель', 'in_progress -> review', changeStatus(e1, taskC, 'review'));
  await refused('Постановщик', 'вернуть без комментария', changeStatus(m1, taskC, 'rework'));
  await refused('Постановщик', 'вернуть с комментарием из пробелов', changeStatus(m1, taskC, 'rework', '     '));
  await refused('Постановщик', 'вернуть с комментарием из переводов строк', changeStatus(m1, taskC, 'rework', '   \n\t\r\n '));
  await refused('Постановщик', 'вернуть с комментарием из неразрывных пробелов', changeStatus(m1, taskC, 'rework', '   '));
  const stillReview = await readTask(taskC);
  record('Постановщик', 'после отказа статус остался прежним', stillReview.status === 'review', stillReview.status);
  await allowed('Постановщик', 'review -> rework с комментарием', changeStatus(m1, taskC, 'rework', 'Переделать'));
  await refused('Постановщик', 'rework -> in_progress за исполнителя', changeStatus(m1, taskC, 'in_progress'));
  await allowed('Исполнитель', 'rework -> in_progress', changeStatus(e1, taskC, 'in_progress'));
  await allowed('Исполнитель', 'in_progress -> review', changeStatus(e1, taskC, 'review'));
  await allowed('Второй пост.', 'review -> accepted (не автор задачи)', changeStatus(m2, taskC, 'accepted'));

  const history = await e1.client
    .from('task_history')
    .select('from_status, to_status, comment, actor_id, actor_name, created_at')
    .eq('task_id', taskC)
    .order('id');
  const rows = history.data ?? [];
  const trail = rows.map((r) => `${r.from_status ?? '-'}>${r.to_status}`).join(' ');
  const expected = '->new new>in_progress in_progress>review review>rework rework>in_progress in_progress>review review>accepted';
  record('Исполнитель', 'история содержит все переходы по порядку', trail === expected, trail);
  const expectedActors = [m1.id, e1.id, e1.id, m1.id, e1.id, e1.id, m2.id];
  record('Исполнитель', 'в истории верно указано, кто действовал', rows.every((r, i) => r.actor_id === expectedActors[i] && r.actor_name && r.created_at));
  record('Исполнитель', 'комментарий возврата сохранён', rows[3]?.comment === 'Переделать');

  console.log('\n--- Принятая задача закрыта ---');
  for (const to of ['new', 'in_progress', 'review', 'rework']) {
    await refused('Постановщик', `accepted -> ${to}`, changeStatus(m1, taskC, to, 'попытка'));
  }
  await refused('Постановщик', 'изменить принятую задачу', m1.client.from('tasks').update({ title: 'взлом' }).eq('id', taskC));

  console.log('\n--- Одновременные действия ---');
  const raceTask = await newTask('Гонка', objA, e1);
  await changeStatus(e1, raceTask, 'in_progress');
  await changeStatus(e1, raceTask, 'review');
  const [first, second] = await Promise.all([
    changeStatus(m1, raceTask, 'accepted'),
    changeStatus(m2, raceTask, 'rework', 'Одновременный возврат'),
  ]);
  record('Два пост.', 'из двух одновременных решений прошло ровно одно', Boolean(first.error) !== Boolean(second.error));
  const raceHistory = await m1.client.from('task_history').select('id').eq('task_id', raceTask);
  record('Два пост.', 'в истории только один итог', raceHistory.data?.length === 4, `строк: ${raceHistory.data?.length}`);

  console.log('\n--- Мягкое удаление ---');
  await allowed('Постановщик', 'удалить задачу', m1.client.rpc('delete_task', { p_task_id: taskC }));
  await noRows('Постановщик', 'удалённая задача скрыта', m1.client.from('tasks').select('*').eq('id', taskC));
  const keptHistory = await m1.client.from('task_history').select('id').eq('task_id', taskC);
  record('Постановщик', 'история удалённой задачи сохранилась', keptHistory.data?.length === 7, `строк: ${keptHistory.data?.length}`);
  await noRows('Исполнитель', 'история удалённой задачи больше не видна', e1.client.from('task_history').select('*').eq('task_id', taskC));
  await refused('Постановщик', 'сменить статус удалённой задачи', changeStatus(m1, taskC, 'rework', 'x'));

  await allowed('Постановщик', 'удалить задачи объекта', m1.client.rpc('delete_task', { p_task_id: taskA }));
  await allowed('Постановщик', 'удалить вторую задачу объекта', m1.client.rpc('delete_task', { p_task_id: raceTask }));
  await noRows('Исполнитель', 'объект без задач перестал быть виден', e1.client.from('objects').select('*').eq('id', objA));
  await allowed('Постановщик', 'удалить опустевший объект', m1.client.rpc('delete_object', { p_object_id: objA }));
  await noRows('Постановщик', 'удалённый объект скрыт', m1.client.from('objects').select('*').eq('id', objA));
  await refused('Постановщик', 'создать задачу в удалённом объекте', m1.client.from('tasks').insert({ title: 'x', object_id: objA, assignee_id: e1.id }));
} catch (error) {
  record('Скрипт', 'выполнился без сбоя', false, error instanceof Error ? error.message : String(error));
} finally {
  await e1.client.auth.updateUser({ data: { role: null } });
  for (const id of taskIds) await m1.client.rpc('delete_task', { p_task_id: id });
  for (const id of objectIds) await m1.client.rpc('delete_object', { p_object_id: id });
}

const failed = results.filter((ok) => !ok).length;
console.log(`\nИтог: пройдено ${results.length - failed} из ${results.length}, провалено ${failed}.`);
process.exit(failed === 0 ? 0 : 1);
