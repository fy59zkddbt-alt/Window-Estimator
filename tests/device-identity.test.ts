import { expect, it, vi } from 'vitest';
import { BrowserDeviceIdentity } from '../src/infrastructure/auth/device-identity';
import { SupabaseAuthProvider } from '../src/infrastructure/auth/supabase-auth-provider';
import { BrowserEntitlementCache } from '../src/infrastructure/auth/entitlement-cache';
import type { SupabaseClient } from '@supabase/supabase-js';

function storage() {
  const values = new Map<string, string>();
  return { values, getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); } };
}
const id = '00000000-0000-4000-8000-000000000010';
it('generates once per storage context and persists across reload, login and actual adapter logout', async () => {
  const local = storage(); const generate = vi.fn(() => id);
  expect(new BrowserDeviceIdentity(local, generate).getId()).toBe(id);
  const signOut = vi.fn(async () => ({ error: null }));
  const provider = new SupabaseAuthProvider({ auth: { signOut } } as unknown as SupabaseClient);
  await provider.logout();
  expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  expect(new BrowserDeviceIdentity(local, generate).getId()).toBe(id);
  expect(generate).toHaveBeenCalledTimes(1);
  expect(new BrowserDeviceIdentity(storage(), () => '00000000-0000-4000-8000-000000000011').getId()).not.toBe(id);
});
it('unavailable or corrupt identity storage fails closed instead of inventing another ID', () => {
  const local = storage(); local.values.set('window-estimator:device:v1', 'corrupt');
  expect(() => new BrowserDeviceIdentity(local).getId()).toThrow('Invalid stored device identity');
  expect(() => new BrowserDeviceIdentity({ getItem: () => null, setItem: () => { throw new Error('unavailable'); } }, () => id).getId()).toThrow('unavailable');
});
it('new device cannot reuse an old device or legacy entitlement cache', () => {
  const local = storage(); const cache = new BrowserEntitlementCache(local, id);
  const record = { entitlement: { userId: 'A', status: 'trial' as const, serverNow: 1, validUntil: 100 }, receivedAt: 1, observedAt: 1 };
  local.setItem('window-estimator:entitlement:v1:A', JSON.stringify(record));
  expect(cache.read('A')).toBeNull();
  cache.write('A', record);
  expect(new BrowserEntitlementCache(local, 'other-device').read('A')).toBeNull();
  expect(cache.read('A')).toEqual(record);
});
