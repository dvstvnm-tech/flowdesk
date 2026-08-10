import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/database.types';

// Клиент для использования в 'use client' компонентах (браузер).
// Читает публичные переменные окружения — безопасно для клиентского кода.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
