import AsyncStorage from '@react-native-async-storage/async-storage';
import { log } from './log';
import { supabase } from './supabase';

const QUEUE_STORAGE_KEY = 'pantrylens.offline_queue.v1';

export type OfflineMutationType =
  | 'ADD_ITEMS'
  | 'UPDATE_ITEM'
  | 'DELETE_ITEMS'
  | 'RECORD_EXIT'
  | 'UPDATE_LOCATION'
  | 'COLLECT_BOXES';

export interface QueuedMutation {
  id: string;
  type: OfflineMutationType;
  pantryId: string;
  payload: any;
  createdAt: string;
  retryCount: number;
}

class OfflineQueueManager {
  private queue: QueuedMutation[] = [];
  private isProcessing = false;
  private listeners: ((pendingCount: number) => void)[] = [];

  constructor() {
    this.loadQueue();
  }

  private async loadQueue() {
    try {
      const data = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
      if (data) {
        this.queue = JSON.parse(data);
        this.notify();
      }
    } catch (err) {
      log.warn('offline', 'failed to load queued mutations', err);
    }
  }

  private async persistQueue() {
    try {
      await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(this.queue));
      this.notify();
    } catch (err) {
      log.warn('offline', 'failed to persist queue', err);
    }
  }

  public subscribe(listener: (pendingCount: number) => void) {
    this.listeners.push(listener);
    listener(this.queue.length);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(this.queue.length);
    }
  }

  public getPendingCount(): number {
    return this.queue.length;
  }

  public async enqueue(type: OfflineMutationType, pantryId: string, payload: any): Promise<string> {
    const id = `mut_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const mutation: QueuedMutation = {
      id,
      type,
      pantryId,
      payload,
      createdAt: new Date().toISOString(),
      retryCount: 0,
    };
    this.queue.push(mutation);
    await this.persistQueue();
    log.debug('offline', `Enqueued ${type} (${id}). Total pending: ${this.queue.length}`);
    return id;
  }

  public async processQueue(): Promise<{ processed: number; failed: number }> {
    if (this.isProcessing || this.queue.length === 0) {
      return { processed: 0, failed: 0 };
    }

    this.isProcessing = true;
    let processed = 0;
    let failed = 0;

    log.debug('offline', `Starting flush of ${this.queue.length} pending mutation(s)`);

    const remaining: QueuedMutation[] = [];

    for (const mutation of this.queue) {
      try {
        const success = await this.executeMutation(mutation);
        if (success) {
          processed++;
        } else {
          mutation.retryCount++;
          if (mutation.retryCount < 5) {
            remaining.push(mutation);
          }
          failed++;
        }
      } catch (err) {
        log.warn('offline', `Mutation ${mutation.id} (${mutation.type}) failed`, err);
        mutation.retryCount++;
        if (mutation.retryCount < 5) {
          remaining.push(mutation);
        }
        failed++;
      }
    }

    this.queue = remaining;
    await this.persistQueue();
    this.isProcessing = false;

    log.debug('offline', `Flush complete: ${processed} synced, ${failed} remaining/failed`);
    return { processed, failed };
  }

  private async executeMutation(mutation: QueuedMutation): Promise<boolean> {
    const { type, pantryId, payload } = mutation;

    switch (type) {
      case 'ADD_ITEMS': {
        const { error } = await supabase.from('inventory').insert(payload.items);
        return !error;
      }

      case 'UPDATE_ITEM': {
        const { data, error } = await supabase
          .from('inventory')
          .update(payload.updates)
          .eq('id', payload.id)
          .select('id');
        return !error && !!data && data.length > 0;
      }

      case 'DELETE_ITEMS': {
        const { data, error } = await supabase
          .from('inventory')
          .delete()
          .in('id', payload.ids)
          .select('id');
        return !error && !!data;
      }

      case 'RECORD_EXIT': {
        const { error } = await supabase.from('stock_exits').insert(payload.exits);
        return !error;
      }

      case 'UPDATE_LOCATION': {
        const { data, error } = await supabase
          .from('locations')
          .update(payload.updates)
          .eq('id', payload.id)
          .select('id');
        return !error && !!data;
      }

      case 'COLLECT_BOXES': {
        const { error } = await supabase.rpc('collect_boxes', {
          run_id: payload.runId,
          box_count: payload.count,
          expected_collected: payload.expectedCollected,
        });
        return !error;
      }

      default:
        return true;
    }
  }

  public async clear(): Promise<void> {
    this.queue = [];
    await AsyncStorage.removeItem(QUEUE_STORAGE_KEY);
    this.notify();
  }
}

export const offlineQueue = new OfflineQueueManager();
