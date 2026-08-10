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

/**
 * Singleton-реестр каналов Realtime Presence.
 * Несколько компонентов на одной странице могут одновременно вызывать
 * usePresence() с одинаковым channelName (например 'workspace-presence' —
 * используется и в AppShell, и в EmployeesGrid, и на Доске одновременно).
 * Supabase не разрешает дважды подписываться на один и тот же канал,
 * поэтому здесь на каждое имя канала создаётся ОДИН supabase.channel(),
 * а все хуки-подписчики просто регистрируются/снимаются со счётчика (refCount).
 */
type Listener = (all: PresenceState[]) => void;
interface Entry {
  channel: RealtimeChannel;
  listeners: Set<Listener>;
  refCount: number;
}

const supabase = createClient();
const registry = new Map<string, Entry>();

function acquire(
  channelName: string,
  self: { user_id: string; name: string; avatar_url: string | null },
  onSync: Listener
): Entry {
  let entry = registry.get(channelName);
  if (!entry) {
    const channel = supabase.channel(channelName, { config: { presence: { key: self.user_id } } });
    entry = { channel, listeners: new Set(), refCount: 0 };
    registry.set(channelName, entry);

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceState>();
        const all = Object.values(state).flat();
        entry!.listeners.forEach((cb) => cb(all));
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
  entry.refCount += 1;
  entry.listeners.add(onSync);
  return entry;
}

function release(channelName: string, onSync: Listener) {
  const entry = registry.get(channelName);
  if (!entry) return;
  entry.listeners.delete(onSync);
  entry.refCount -= 1;
  if (entry.refCount <= 0) {
    supabase.removeChannel(entry.channel);
    registry.delete(channelName);
  }
}

export function usePresence(channelName: string, self: { user_id: string; name: string; avatar_url: string | null } | null) {
  const [others, setOthers] = useState<PresenceState[]>([]);

  useEffect(() => {
    if (!self || !channelName) return;
    const onSync: Listener = (all) => setOthers(all.filter((p) => p.user_id !== self.user_id));
    acquire(channelName, self, onSync);
    return () => release(channelName, onSync);
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
