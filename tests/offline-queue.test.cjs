const test = require('node:test');
const assert = require('node:assert/strict');

class MockOfflineQueue {
  constructor() {
    this.queue = [];
  }

  enqueue(type, pantryId, payload) {
    const item = {
      id: `mut_${Date.now()}_${Math.random()}`,
      type,
      pantryId,
      payload,
      retryCount: 0,
    };
    this.queue.push(item);
    return item.id;
  }

  getPendingCount() {
    return this.queue.length;
  }

  async processQueue(executor) {
    const remaining = [];
    let processed = 0;
    for (const item of this.queue) {
      const ok = await executor(item);
      if (ok) {
        processed++;
      } else {
        item.retryCount++;
        if (item.retryCount < 3) remaining.push(item);
      }
    }
    this.queue = remaining;
    return processed;
  }
}

test('offline queue enqueues mutations and preserves pending count', () => {
  const q = new MockOfflineQueue();
  assert.equal(q.getPendingCount(), 0);

  q.enqueue('ADD_ITEMS', 'pantry-1', { items: [{ name: 'Rice' }] });
  q.enqueue('DELETE_ITEMS', 'pantry-1', { ids: ['item-2'] });

  assert.equal(q.getPendingCount(), 2);
});

test('offline queue processes and clears successful items in FIFO order', async () => {
  const q = new MockOfflineQueue();
  q.enqueue('ADD_ITEMS', 'pantry-1', { items: [{ name: 'Beans' }] });
  q.enqueue('UPDATE_ITEM', 'pantry-1', { id: 'item-1', updates: { count: 10 } });

  const executed = [];
  const processed = await q.processQueue(async (item) => {
    executed.push(item.type);
    return true;
  });

  assert.equal(processed, 2);
  assert.equal(q.getPendingCount(), 0);
  assert.deepEqual(executed, ['ADD_ITEMS', 'UPDATE_ITEM']);
});

test('offline queue retains failed items for retry up to retry limit', async () => {
  const q = new MockOfflineQueue();
  q.enqueue('ADD_ITEMS', 'pantry-1', { items: [{ name: 'Oats' }] });

  // Simulate network failure
  const processed = await q.processQueue(async () => false);
  assert.equal(processed, 0);
  assert.equal(q.getPendingCount(), 1);
  assert.equal(q.queue[0].retryCount, 1);
});
