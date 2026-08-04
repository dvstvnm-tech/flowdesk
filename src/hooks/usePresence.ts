'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface PresenceState {
  user_id: string;
  name: string;
  avatar_url: string | null;
  editing?: boolean;
  typing?: boolean;
  online_at: string;
}

/**
 * Подключается к Supabase Realtime Presence-каналу с заданным именем.
 * Используется дважды:
 *  1) один общий канал "workspace-presence" — кто сейчас онлайн во всём приложении;
 *  2) канал "task-presence-{taskId}" на каждую открытую карточку задачи —
 *     кто её сейчас просматривает / редактирует / печатает комментарий.
 *
 * track() — обновить своё состояние (например, editing:true, typing:true).
 * others  — актуальный список presence-состояний всех участников, кроме себя.
 */
export function usePresence(channelName: string, self: { user_id: string; name: string; avatar_url: string | null } | null) {
  const supabase = createClient();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [others, setOthers] = useState<PresenceState[]>([]);

  useEffect(() => {
    if (!self || !channelName) return;

    const channel = supabase.channel(channelName, {
      config: { presence: { key: self.user_id } },
    });
    channelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceState>();
        const all = Object.values(state).flat();
        setOthers(all.filter((p) => p.user_id !== self.user_id));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: self.user_id,
            name: self.name,
            avatar_url: self.avatar_url,
            online_at: new Date().toISOString(),
          } satisfies PresenceState);
        }
      });

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [channelName, self?.user_id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function track(patch: Partial<PresenceState>) {
    if (!channelRef.current || !self) return;
    await channelRef.current.track({
      user_id: self.user_id,
      name: self.name,
      avatar_url: self.avatar_url,
      online_at: new Date().toISOString(),
      ...patch,
    } satisfies PresenceState);
  }

  return { others, track };
}
