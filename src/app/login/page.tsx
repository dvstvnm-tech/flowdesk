'use client';

import { createClient } from '@/lib/supabase/client';
import { useState } from 'react';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function signInWithGoogle() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      alert('Не удалось начать вход: ' + error.message);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <div className="w-[380px] bg-surface border border-border rounded-2xl p-8 shadow-lg">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent to-blue-400 flex items-center justify-center text-white font-extrabold">FD</div>
          <div className="font-extrabold text-lg">Flowdesk</div>
        </div>
        <h1 className="text-lg font-extrabold text-center mb-1">Вход в рабочее пространство</h1>
        <p className="text-xs text-muted text-center mb-6">Общая доска задач для всей команды</p>

        <button
          onClick={signInWithGoogle}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 border border-border rounded-lg py-2.5 font-semibold text-sm hover:bg-surface2 disabled:opacity-60"
        >
          <GoogleIcon />
          {loading ? 'Открываем окно входа…' : 'Войти через Google'}
        </button>

        <p className="text-[11px] text-muted text-center mt-6">
          При первом входе профиль создаётся автоматически.
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.53 5.53 0 01-2.4 3.63v3h3.87c2.27-2.09 3.57-5.17 3.57-8.82z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.08.72-2.46 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11A12 12 0 0012 24z" />
      <path fill="#FBBC05" d="M5.27 14.28A7.2 7.2 0 014.9 12c0-.79.14-1.56.37-2.28V6.61H1.27A12 12 0 000 12c0 1.94.46 3.77 1.27 5.39l4-3.11z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.27 6.61l4 3.11C6.22 6.86 8.87 4.75 12 4.75z" />
    </svg>
  );
}
