'use client';

import { useEffect, useState } from 'react';
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

type SelfInfo = { user_id: string; name: string; avatar_url: string | null };

interface RegistryEntry {
  channel: RealtimeChannel;
  subscribers: Set<(others: PresenceState[]) => void>;
  self: SelfInfo;
}

// Один и тот же топик (например "workspace-presence") может одновременно
// использоваться несколькими компонентами (шапка сайта + страница
// "Сотрудники" и т.д.). Supabase Realtime не разрешает второй раз вызывать
// .on()/.subscribe() на уже подписанном канале с тем же именем, поэтому
// держим ОДИН канал на топик и раздаём обновления всем подписчикам React.
const registry = new Map<string, RegistryEntry>();

/**
 * Подключается к Supabase Realtime Presence-каналу с заданным именем.
 * track() — обновить своё состояние (например, editing:true, typing:true).
 * others  — актуальный список presence-состояний всех участников, кроме себя.
 */
export function usePresence(channelName: string, self: SelfInfo | null) {
  const [others, setOthers] = useState<PresenceState[]>([]);

  useEffect(() => {
    if (!self || !channelName) return;
    const supabase = createClient();

    let entry = registry.get(channelName);
    if (!entry) {
      const channel = supabase.channel(channelName, { config: { presence: { key: self.user_id } } });
      entry = { channel, subscribers: new Set(), self };
      registry.set(channelName, entry);

      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState<PresenceState>();
          const all = Object.values(state).flat();
          const current = registry.get(channelName);
          if (!current) return;
          current.subscribers.forEach((cb) => cb(all.filter((p) => p.user_id !== current.self.user_id)));
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
    }

    const listener = (list: PresenceState[]) => setOthers(list);
    entry.subscribers.add(listener);

    return () => {
      const current = registry.get(channelName);
      if (!current) return;
      current.subscribers.delete(listener);
      if (current.subscribers.size === 0) {
        supabase.removeChannel(current.channel);
        registry.delete(channelName);
      }
    };
  }, [channelName, self?.user_id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function track(patch: Partial<PresenceState>) {
    const entry = registry.get(channelName);
    if (!entry || !self) return;
    await entry.channel.track({
      user_id: self.user_id,
      name: self.name,
      avatar_url: self.avatar_url,
      online_at: new Date().toISOString(),
      ...patch,
    } satisfies PresenceState);
  }

  return { others, track };
}
