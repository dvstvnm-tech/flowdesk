'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { usePresence } from '@/hooks/usePresence';
import type { Notification, Profile } from '@/lib/database.types';
import { initials, fullName } from '@/lib/utils';

export default function AppShell({ profile, children }: { profile: Profile | null; children: React.ReactNode }) {
  const supabase = createClient();
  const router = useRouter();
  const pathname = usePathname();
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const { others: onlineUsers } = usePresence(
    'workspace-presence',
    profile ? { user_id: profile.id, name: fullName(profile), avatar_url: profile.avatar_url } : null
  );

  useEffect(() => {
    if (!profile) return;
    supabase.from('notifications').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(20)
      .then(({ data }) => setNotifications((data as Notification[]) ?? []));

    const channel = supabase
      .channel('notifications-' + profile.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` },
        (payload) => setNotifications((prev) => [payload.new as Notification, ...prev]))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const unread = notifications.filter((n) => !n.is_read).length;

  async function markAllRead() {
    if (!profile) return;
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', profile.id).eq('is_read', false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-[200px] flex-none bg-surface border-r border-border p-3 flex flex-col">
        <div className="flex items-center gap-2 px-2 pb-5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-blue-400 flex items-center justify-center text-white font-extrabold text-sm">FD</div>
          <div className="font-bold text-[15px]">Flowdesk</div>
        </div>

        <nav className="space-y-0.5">
          <SideLink href="/board" icon="🗂️" label="Доска" active={pathname === '/board'} />
          <SideLink href="/employees" icon="👥" label="Сотрудники" active={pathname.startsWith('/employees')} />
          <SideLink href="/settings" icon="⚙️" label="Настройки" active={pathname === '/settings'} />
        </nav>

        <div className="mt-auto border-t border-border pt-3">
          <div className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-surface2">
            <div className="relative">
              <Avatar profile={profile} size={30} />
              <span className="presence-dot absolute -bottom-0.5 -right-0.5" title="Онлайн" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold truncate">{profile ? fullName(profile) || 'Без имени' : '—'}</div>
              <div className="text-[11px] text-muted truncate">{roleLabel(profile?.role)}</div>
            </div>
            <button onClick={signOut} title="Выйти" className="text-muted hover:text-red text-xs px-1">⎋</button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-[58px] flex-none flex items-center gap-3 px-5 border-b border-border bg-surface relative z-30">
          <div className="text-sm text-muted flex items-center gap-1.5">
            <span className="presence-dot" /> {onlineUsers.length + 1} онлайн сейчас
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setNotifOpen((v) => !v)}
              className="relative w-[34px] h-[34px] rounded-lg flex items-center justify-center hover:bg-surface2 border border-transparent hover:border-border"
            >
              🔔
              {unread > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red border-2 border-surface" />}
            </button>
            {notifOpen && (
              <div className="absolute top-[54px] right-5 w-[340px] bg-surface border border-border rounded-xl shadow-lg overflow-hidden">
                <div className="p-3 border-b border-border font-bold text-[13.5px] flex justify-between items-center">
                  Уведомления
                  <button onClick={markAllRead} className="text-xs text-accent font-semibold">Прочитать всё</button>
                </div>
                <div className="max-h-[380px] overflow-y-auto">
                  {notifications.length === 0 && <div className="p-6 text-center text-muted text-xs">Нет новых уведомлений</div>}
                  {notifications.map((n) => (
                    <div key={n.id} className={`p-3 border-b border-border text-[12.5px] ${!n.is_read ? 'bg-accentSoft' : ''}`}>{n.text}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

function roleLabel(role?: string) {
  const map: Record<string, string> = { administrator: 'Администратор', manager: 'Руководитель', employee: 'Сотрудник', viewer: 'Наблюдатель' };
  return role ? map[role] ?? role : 'Роль не назначена';
}

function SideLink({ href, icon, label, active }: { href: string; icon: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13.5px] font-medium ${
        active ? 'bg-accentSoft text-accent' : 'text-text2 hover:bg-surface2 hover:text-text'
      }`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

export function Avatar({ profile, size = 26 }: { profile: Partial<Profile> | null | undefined; size?: number }) {
  const name = fullName(profile as Profile);
  if (profile?.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={profile.avatar_url} alt={name} width={size} height={size} className="rounded-full object-cover flex-none" />;
  }
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-bold flex-none"
      style={{ width: size, height: size, fontSize: size * 0.4, background: '#B4B9C2' }}
    >
      {initials(name)}
    </div>
  );
}
