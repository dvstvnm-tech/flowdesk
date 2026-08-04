import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/database.types';

// Клиент для использования в Server Components, Server Actions и Route Handlers.
// Работает с сессией через cookies, поэтому SSR-запросы уже приходят
// авторизованными и RLS применяется корректно на сервере.
export function createClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // set() вызван из Server Component без возможности записи —
            // безопасно игнорировать, middleware обновит сессию отдельно.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {
            // см. комментарий выше
          }
        },
      },
    }
  );
}
