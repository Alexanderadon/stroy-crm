import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error('Не заданы VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY');
}

// Публичный ключ не секрет: он лишь указывает на проект. Что можно делать с данными,
// решает база по логину пользователя. Секретного ключа во фронтенде нет.
export const supabase = createClient<Database>(url, publishableKey);
