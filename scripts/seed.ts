// Создаёт тестовых пользователей и демо-данные.
// Секретный ключ нужен только здесь и только на машине разработчика.
// Статусы проводятся через change_task_status под настоящими логинами,
// поэтому история в демо-данных настоящая.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { USERS_FILE, changeStatus, requireEnv, signIn, type Session, type TestUser } from './lib.ts';

const USERS: Omit<TestUser, 'password'>[] = [
  { key: 'manager1', email: 'manager1@stroy-crm.test', fullName: 'Анна Соколова', role: 'manager' },
  { key: 'manager2', email: 'manager2@stroy-crm.test', fullName: 'Игорь Белов', role: 'manager' },
  { key: 'executor1', email: 'executor1@stroy-crm.test', fullName: 'Пётр Иванов', role: 'executor' },
  { key: 'executor2', email: 'executor2@stroy-crm.test', fullName: 'Сергей Кузнецов', role: 'executor' },
];

const admin = createClient(requireEnv('VITE_SUPABASE_URL'), requireEnv('SUPABASE_SECRET_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function ensureUsers(): Promise<Record<string, TestUser>> {
  const saved: Record<string, TestUser> = existsSync(USERS_FILE)
    ? JSON.parse(readFileSync(USERS_FILE, 'utf8'))
    : {};
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 100 });
  if (error) throw error;

  const result: Record<string, TestUser> = {};
  for (const spec of USERS) {
    const password = saved[spec.key]?.password ?? `Stroy-${randomBytes(6).toString('hex')}`;
    let id = data.users.find((u) => u.email === spec.email)?.id;

    if (id) {
      const updated = await admin.auth.admin.updateUserById(id, { password });
      if (updated.error) throw updated.error;
    } else {
      const created = await admin.auth.admin.createUser({
        email: spec.email,
        password,
        email_confirm: true,
        user_metadata: { full_name: spec.fullName },
      });
      if (created.error) throw created.error;
      id = created.data.user.id;
    }

    const profile = await admin
      .from('profiles')
      .update({ role: spec.role, full_name: spec.fullName })
      .eq('id', id);
    if (profile.error) throw profile.error;

    result[spec.key] = { ...spec, password };
  }

  writeFileSync(USERS_FILE, JSON.stringify(result, null, 2));
  writeFileSync(
    'ACCESS.local.md',
    [
      '# Доступы к тестовому стенду',
      '',
      '| Роль | Имя | Email | Пароль |',
      '|---|---|---|---|',
      ...Object.values(result).map(
        (u) =>
          `| ${u.role === 'manager' ? 'Постановщик' : 'Исполнитель'} | ${u.fullName} | ${u.email} | ${u.password} |`,
      ),
      '',
    ].join('\n'),
  );
  return result;
}

type Step = [who: 'executor' | 'manager', status: string, comment?: string];

const REWORK_COMMENT = 'Шаг арматуры не соответствует проекту, переделайте участок у оси 3.';
const TAKE: Step[] = [['executor', 'in_progress']];
const SUBMIT: Step[] = [...TAKE, ['executor', 'review']];
const ACCEPT: Step[] = [...SUBMIT, ['manager', 'accepted']];
const RETURN: Step[] = [...SUBMIT, ['manager', 'rework', REWORK_COMMENT]];

async function seedData(users: Record<string, TestUser>) {
  const existing = await admin.from('objects').select('id').is('deleted_at', null).limit(1);
  if (existing.error) throw existing.error;
  if (existing.data.length > 0) {
    console.log('Демо-данные уже есть, пропускаю их создание.');
    return;
  }

  const manager1 = await signIn(users.manager1);
  const manager2 = await signIn(users.manager2);
  const executor1 = await signIn(users.executor1);
  const executor2 = await signIn(users.executor2);

  const createObject = async (name: string, address: string): Promise<string> => {
    const { data, error } = await manager1.client
      .from('objects')
      .insert({ name, address })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  };

  const housing = await createObject('ЖК «Северный», корпус 2', 'г. Москва, ул. Строителей, 12');
  const warehouse = await createObject('Склад «Восток»', 'г. Подольск, Промышленная ул., 5');
  const school = await createObject('Школа на 550 мест', 'г. Химки, Набережная ул., 3');

  // Первый исполнитель работает на ЖК и школе, второй на ЖК и складе:
  // у каждого есть объект, которого он не должен видеть.
  const tasks: [string, string, string, Session, Session, Session, Step[]][] = [
    ['Залить фундамент секции А', 'Бетон B25, приёмка арматуры до заливки.', housing, manager1, executor1, manager2, ACCEPT],
    ['Смонтировать опалубку второго этажа', 'Проверить геометрию перед сдачей.', housing, manager1, executor1, manager1, SUBMIT],
    ['Проверить армирование плиты', 'Сверить шаг арматуры с рабочей документацией.', housing, manager1, executor2, manager1, RETURN],
    ['Подвести временное электроснабжение', 'Щит на 63 А у въезда на площадку.', warehouse, manager2, executor2, manager2, TAKE],
    ['Разработать план вывоза грунта', 'Согласовать маршрут и график.', warehouse, manager1, executor2, manager1, []],
    ['Установить ограждение площадки', 'Высота не менее 2 метров, калитка у входа.', school, manager1, executor1, manager1, []],
    ['Заменить кровельные листы над спортзалом', 'Листы с дефектами заменить целиком.', school, manager1, executor1, manager1, [...RETURN, ['executor', 'in_progress']]],
    ['Утеплить фасад спортзала', 'Минеральная вата 150 мм.', school, manager2, executor1, manager2, SUBMIT],
  ];

  for (const [title, description, objectId, author, executor, reviewer, steps] of tasks) {
    const { data, error } = await author.client
      .from('tasks')
      .insert({ title, description, object_id: objectId, assignee_id: executor.id })
      .select('id')
      .single();
    if (error) throw error;

    for (const [who, status, comment] of steps) {
      const actor = who === 'executor' ? executor : reviewer;
      const moved = await changeStatus(actor, data.id, status, comment);
      if (moved.error) throw new Error(`${title} -> ${status}: ${moved.error.message}`);
    }
  }
  console.log(`Создано объектов: 3, задач: ${tasks.length}.`);
}

const users = await ensureUsers();
console.log(`Пользователи готовы: ${Object.keys(users).length}. Доступы записаны в ACCESS.local.md`);
await seedData(users);
