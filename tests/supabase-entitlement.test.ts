import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseEntitlementProvider } from '../src/infrastructure/auth/supabase-entitlement-provider';
import { BrowserEntitlementCache } from '../src/infrastructure/auth/entitlement-cache';
import { EntitlementUnavailable } from '../src/application/access/entitlement';

function setup() {
  const rpc = vi.fn(async () => ({ data: { user_id: 'A', status: 'trial', server_now: '2026-10-03T00:00:00Z', valid_until: '2026-10-17T00:00:00Z' }, error: null as object | null, status: 200 }));
  return { rpc, provider: new SupabaseEntitlementProvider({ rpc } as unknown as SupabaseClient, () => true, () => "00000000-0000-4000-8000-000000000010") };
}
it('RPC supplies only device identity, never user, dates or status', async () => {
  const s = setup(); const e = await s.provider.check();
  expect(s.rpc).toHaveBeenCalledWith('get_entitlement', { p_device_id: '00000000-0000-4000-8000-000000000010' }); expect(e.serverNow).toBe(Date.parse('2026-10-03T00:00:00Z'));
});
it('only transport/offline errors permit cached grace', async () => {
  const s = setup(); s.rpc.mockResolvedValueOnce({ data: null!, error: {}, status: 0 });
  await expect(s.provider.check()).rejects.toBeInstanceOf(EntitlementUnavailable);
  s.rpc.mockResolvedValueOnce({ data: null!, error: {}, status: 403 });
  await expect(s.provider.check()).rejects.not.toBeInstanceOf(EntitlementUnavailable);
  s.rpc.mockResolvedValueOnce({ data: { user_id: 'A', status: 'trial', server_now: 'invalid', valid_until: 'invalid' }, error: null, status: 200 });
  await expect(s.provider.check()).rejects.toThrow('Invalid entitlement');
});
it('browser cache keeps accounts separate and does not touch calculations/settings', () => {
  const values = new Map<string, string>([['calculation', 'keep']]);
  const cache = new BrowserEntitlementCache({ getItem: (k) => values.get(k) ?? null, setItem: (k, v) => { values.set(k, v); }, removeItem: (k) => { values.delete(k); } }, "device-A");
  const record = { entitlement: { userId: 'A', status: 'trial' as const, serverNow: 1, validUntil: 100 }, receivedAt: 1, observedAt: 1 };
  cache.write('A', record); expect(cache.read('B')).toBeNull(); expect(cache.read('A')).toEqual(record);
  cache.remove('A'); expect(values.get('calculation')).toBe('keep');
});
