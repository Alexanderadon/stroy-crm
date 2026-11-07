import { existsSync, readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const USERS_FILE = 'ACCESS.local.json';

export type TestUser = {
  key: string;
  email: string;
  password: string;
  fullName: string;
  role: 'manager' | 'executor';
};

export type Session = { client: SupabaseClient; id: string; user: TestUser };

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Не задана переменная ${name}. Заполните .env.local`);
  return value;
}

/** Клиент с публичным ключом: те же права, что у браузера. */
export function publicClient(): SupabaseClient {
  return createClient(requireEnv('VITE_SUPABASE_URL'), requireEnv('VITE_SUPABASE_PUBLISHABLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function loadUsers(): Record<string, TestUser> {
  if (!existsSync(USERS_FILE)) throw new Error('Нет тестовых пользователей. Сначала выполните npm run seed');
  return JSON.parse(readFileSync(USERS_FILE, 'utf8'));
}

export async function signIn(user: TestUser): Promise<Session> {
  const client = publicClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error || !data.user) throw new Error(`Не удалось войти как ${user.email}: ${error?.message}`);
  return { client, id: data.user.id, user };
}

export function changeStatus(session: Session, taskId: string, status: string, comment?: string) {
  return session.client.rpc('change_task_status', {
    p_task_id: taskId,
    p_to_status: status,
    p_comment: comment ?? null,
  });
}
