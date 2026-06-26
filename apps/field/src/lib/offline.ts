// Offline queue using IndexedDB (via idb-keyval).
// Field workers may have poor connectivity. Pickup submissions
// are queued locally and synced when back online.
// Idempotency: each queued item has a client-generated lotUuid
// so retries don't create duplicate lots.

import { get as idbGet, set as idbSet, del as idbDel, keys as idbKeys } from 'idb-keyval';
import { createPickup } from './api';

const QUEUE_KEY = 'ff_offline_queue';

interface QueuedItem {
  lotUuid: string;
  payload: any;
  createdAt: string;
}

export async function queuePickup(payload: any & { lotUuid: string }) {
  const queue = (await idbGet<QueuedItem[]>(QUEUE_KEY)) ?? [];
  queue.push({ lotUuid: payload.lotUuid, payload, createdAt: new Date().toISOString() });
  await idbSet(QUEUE_KEY, queue);
}

export async function getQueueCount(): Promise<number> {
  const queue = (await idbGet<QueuedItem[]>(QUEUE_KEY)) ?? [];
  return queue.length;
}

export async function syncQueue(): Promise<{ synced: number; failed: number }> {
  const queue = (await idbGet<QueuedItem[]>(QUEUE_KEY)) ?? [];
  let synced = 0, failed = 0;
  const remaining: QueuedItem[] = [];

  for (const item of queue) {
    try {
      await createPickup(item.payload);
      synced++;
    } catch (err) {
      // If it's a conflict (already exists), treat as synced
      if (String(err).includes('409') || String(err).includes('already')) {
        synced++;
      } else {
        failed++;
        remaining.push(item);
      }
    }
  }

  await idbSet(QUEUE_KEY, remaining);
  return { synced, failed };
}

// Auto-sync when online
window.addEventListener('online', () => {
  syncQueue().then(({ synced, failed }) => {
    if (synced > 0) {
      console.log(`[FreshFold] Synced ${synced} offline pickups`);
      window.dispatchEvent(new CustomEvent('ff:synced', { detail: { synced, failed } }));
    }
  });
});