import { create } from 'zustand';
import { log } from './log';
import { supabase } from './supabase';

/**
 * Messages sent to everyone in the pantry ("We need protein and grains"),
 * shown on the Notifications page and counted on the bell.
 *
 * Kept apart from the main store: it's a small feed with its own live
 * subscription, and the bell needs it on every tab.
 */

export type TeamAlert = { id: string; message: string; created_at: string; created_by: string | null };

/** How far back the bell looks. Older asks are stale. */
const DAYS = 7;

let channel: ReturnType<typeof supabase.channel> | null = null;

type State = {
  pantryId: string | null;
  alerts: TeamAlert[];
  load: (pantryId: string) => void;
  send: (message: string) => Promise<void>;
};

export const useTeamAlerts = create<State>((set, get) => ({
  pantryId: null,
  alerts: [],
  load: (pantryId) => {
    if (get().pantryId === pantryId) return;
    set({ pantryId, alerts: [] });
    const since = new Date(Date.now() - DAYS * 86400000).toISOString();
    supabase
      .from('pantry_alerts')
      .select('id, message, created_at, created_by')
      .eq('pantry_id', pantryId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (error) log.warn('store', 'could not load team alerts', error);
        if (get().pantryId === pantryId && data) set({ alerts: data as TeamAlert[] });
      });

    if (channel) supabase.removeChannel(channel);
    channel = supabase
      .channel(`alerts:${pantryId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pantry_alerts', filter: `pantry_id=eq.${pantryId}` },
        (payload) => {
          const row = payload.new as TeamAlert;
          if (get().pantryId !== pantryId || get().alerts.some((a) => a.id === row.id)) return;
          set({ alerts: [row, ...get().alerts] });
        },
      )
      .subscribe();
  },
  send: async (message) => {
    const pantryId = get().pantryId;
    if (!pantryId) throw new Error('No pantry is loaded yet.');
    const { data, error } = await supabase
      .from('pantry_alerts')
      .insert({ pantry_id: pantryId, message: message.trim() })
      .select('id, message, created_at, created_by')
      .single();
    if (error) throw error;
    if (data && !get().alerts.some((a) => a.id === (data as TeamAlert).id)) {
      set({ alerts: [data as TeamAlert, ...get().alerts] });
    }
  },
}));
