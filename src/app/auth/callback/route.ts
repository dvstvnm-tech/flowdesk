import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Google редиректит сюда с ?code=... после успешного входа.
// Supabase обменивает код на сессию; профиль создаётся автоматически
// триггером handle_new_user() в базе данных.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/board';

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
