'use client';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/lib/database.types';
// Отдаёт текущий профиль (данные из public.profiles) и держит его
// в актуальном состоянии, если пользователь обновит его в другой вкладке.
export function useCurrentUser() {
  const supabase = createClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const channelName = useRef(`own-profile-changes-${Math.random().toString(36).slice(2)}`);
  useEffect(() => {
    let mounted = true;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (mounted) { setProfile(data as Profile); setLoading(false); }
    }
    load();
    const channel = supabase
      .channel(channelName.current)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
        setProfile((prev) => (prev && payload.new.id === prev.id ? (payload.new as Profile) : prev));
      })
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(channel); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return { profile, loading };
}
