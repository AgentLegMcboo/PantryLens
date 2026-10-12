const test = require('node:test');
const assert = require('node:assert/strict');

// Implementations under test (mirrored from lib/expiry.ts for Node CJS runtime)
function todayISO(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function windowEndISO(days, now = new Date()) {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  end.setDate(end.getDate() + Math.max(0, Math.round(days)));
  return todayISO(end);
}

function isPastDate(expiration, today = todayISO()) {
  if (!expiration) return false;
  return expiration < today;
}

function isExpiringSoon(expiration, windowDays, now = new Date()) {
  if (!expiration) return false;
  return expiration <= windowEndISO(windowDays, now);
}

test('todayISO formats calendar date as YYYY-MM-DD', () => {
  const d = new Date(2026, 9, 12); // Oct 12, 2026
  assert.equal(todayISO(d), '2026-10-12');
});

test('windowEndISO adds days correctly across month boundaries', () => {
  const d = new Date(2026, 9, 25); // Oct 25, 2026
  const window30 = windowEndISO(30, d);
  assert.equal(window30, '2026-11-24');
});

test('isPastDate detects strictly expired items without flagging today', () => {
  const today = '2026-10-12';
  assert.equal(isPastDate('2026-10-11', today), true);
  assert.equal(isPastDate('2026-10-12', today), false);
  assert.equal(isPastDate('2026-10-13', today), false);
  assert.equal(isPastDate(null, today), false);
});

test('isExpiringSoon flags items within chosen warning window', () => {
  const now = new Date(2026, 9, 12); // Oct 12, 2026
  assert.equal(isExpiringSoon('2026-10-20', 14, now), true);
  assert.equal(isExpiringSoon('2026-11-01', 14, now), false);
  assert.equal(isExpiringSoon('2026-11-01', 30, now), true);
  assert.equal(isExpiringSoon('2027-01-01', 30, now), false);
  assert.equal(isExpiringSoon(null, 30, now), false);
});
