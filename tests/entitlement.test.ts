import { expect, it, vi } from 'vitest';
import { AccessController, EntitlementUnavailable, expiryWarning, type Entitlement, type EntitlementCacheRecord } from '../src/application/access/entitlement';

const day = 86_400_000;
const server = Date.parse('2026-10-03T00:00:00Z');
function setup(status: Entitlement['status'] = 'trial', remaining = 14 * day) {
  let local = 1000, monotonic = 0;
  const records = new Map<string, EntitlementCacheRecord>();
  const entitlement: Entitlement = { userId: 'A', status, serverNow: server, validUntil: server + remaining };
  const provider = { check: vi.fn(async () => entitlement) };
  const cache = { read: (id: string) => records.get(id) ?? null, write: (id: string, value: EntitlementCacheRecord) => { records.set(id, structuredClone(value)); }, remove: (id: string) => { records.delete(id); } };
  const clock = { wallNow: () => local, monotonicNow: () => monotonic };
  const controller = new AccessController('A', provider, cache, clock);
  return { controller, provider, cache, records, clock, advance: (ms: number) => { local += ms; monotonic += ms; }, wall: (ms: number) => { local = ms; } };
}
it.each(['trial', 'active'] as const)('%s permits app access using server time despite device date', async (status) => {
  const s = setup(status); await s.controller.check(); expect(s.controller.state.status).toBe('allowed');
  expect(s.controller.state.now).toBe(server);
});
it.each(['expired', 'blocked'] as const)('%s denies app access and cannot use a prior allowed cache', async (status) => {
  const s = setup(); await s.controller.check();
  s.provider.check.mockResolvedValue({ userId: 'A', status, serverNow: server, validUntil: server + day });
  await s.controller.check(); expect(s.controller.state.status).toBe(status);
  s.provider.check.mockRejectedValue(new EntitlementUnavailable()); await s.controller.check();
  expect(s.controller.state.status).toBe(status);
});
it.each(['device_limit_reached', 'trial_already_used_on_device'] as const)('%s replaces cached permission and remains denied offline', async (reason) => {
  const s = setup(); await s.controller.check();
  s.provider.check.mockResolvedValue({ userId: 'A', status: 'expired', reason, serverNow: server, validUntil: null });
  await s.controller.check(); expect(s.controller.state.status).toBe(reason);
  s.provider.check.mockRejectedValue(new EntitlementUnavailable()); await s.controller.check();
  expect(s.controller.state.status).toBe(reason);
  const restarted = new AccessController('A', s.provider, s.cache, s.clock);
  await restarted.check(); expect(restarted.state.status).toBe(reason);
});
it('unknown or contradictory server restriction fails closed', async () => {
  const s = setup(); await s.controller.check();
  s.provider.check.mockResolvedValue({ userId: 'A', status: 'active', reason: 'device_limit_reached', serverNow: server, validUntil: server + day });
  await s.controller.check(); expect(s.controller.state.status).toBe('unavailable');
  expect(s.records.size).toBe(0);
});
it('offline grace is strictly less than 24h, including repeated failures and new sessions', async () => {
  const s = setup(); await s.controller.check(); s.advance(day - 1);
  s.provider.check.mockRejectedValue(new EntitlementUnavailable()); await s.controller.check();
  expect(s.controller.state.status).toBe('allowed');
  const next = new AccessController('A', s.provider, s.cache, s.clock); await next.check();
  expect(next.state.status).toBe('allowed');
  s.advance(1); next.tick(); expect(next.state.status).toBe('unavailable');
});
it('offline grace ends at known validUntil and mounted app expires', async () => {
  const s = setup('trial', 1000); await s.controller.check(); s.advance(1000); s.controller.tick();
  expect(s.controller.state.status).toBe('expired');
});
it('cache cannot grant access to a different user', async () => {
  const s = setup(); await s.controller.check(); s.provider.check.mockRejectedValue(new EntitlementUnavailable());
  const b = new AccessController('B', s.provider, s.cache, s.clock); await b.check(); expect(b.state.status).toBe('unavailable');
  s.records.set('B', s.records.get('A')!); await b.check(); expect(b.state.status).toBe('unavailable');
});
it('authoritative errors invalidate offline permission', async () => {
  const s = setup(); await s.controller.check(); s.provider.check.mockRejectedValue(new Error('Email confirmation required'));
  await s.controller.check(); expect(s.controller.state.status).toBe('unavailable'); expect(s.records.size).toBe(0);
});
it('clock rollback fails closed and monotonic elapsed time cannot extend access', async () => {
  const s = setup(); await s.controller.check(); s.advance(day); s.wall(1000); s.controller.tick();
  expect(s.controller.state.status).toBe('unavailable');
  s.wall(999); s.provider.check.mockRejectedValue(new EntitlementUnavailable());
  const next = new AccessController('A', s.provider, s.cache, s.clock); await next.check(); expect(next.state.status).toBe('unavailable');
});
it('a late check after stop cannot reopen access', async () => {
  const s = setup(); let release!: (value: Entitlement) => void;
  s.provider.check.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
  const pending = s.controller.check(); s.controller.stop();
  release({ userId: 'A', status: 'trial', serverNow: server, validUntil: server + day }); await pending;
  expect(s.records.size).toBe(0); expect(s.controller.state.status).toBe('checking');
});
it('warning starts at five days, escalates at one day and handles expiry', () => {
  expect(expiryWarning(server + 5 * day + 1, server)).toBeNull();
  expect(expiryWarning(server + 5 * day, server)).toEqual({ days: 5, urgent: false });
  expect(expiryWarning(server + 2 * day, server)).toEqual({ days: 2, urgent: false });
  expect(expiryWarning(server + day, server)).toEqual({ days: 1, urgent: true });
  expect(expiryWarning(server, server)).toBeNull();
});
