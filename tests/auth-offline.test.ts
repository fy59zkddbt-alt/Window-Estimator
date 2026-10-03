import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseAuthProvider } from '../src/infrastructure/auth/supabase-auth-provider';
import { BrowserAuthIdentityCache } from '../src/infrastructure/auth/auth-identity-cache';
function setup() {
  const storage = new Map<string, string>();
  const cache = new BrowserAuthIdentityCache({ getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => { storage.set(k, v); }, removeItem: (k) => { storage.delete(k); } });
  cache.write({ id: 'A' });
  const auth = { getSession: vi.fn(async () => ({ data: { session: null }, error: { name: 'AuthRetryableFetchError', message: 'offline' } as { name: string; message: string } | null })), signOut: vi.fn(async () => ({ error: null })) };
  return { auth, cache, provider: new SupabaseAuthProvider({ auth } as unknown as SupabaseClient, cache) };
}
it('offline expired-token restore reaches the independent access check using only remembered identity', async () => {
  const s = setup(); expect(await s.provider.restore()).toEqual({ id: 'A' });
  s.cache.clear(); await expect(s.provider.restore()).rejects.toThrow('восстановить');
});
it('server rejection or absent SDK session cannot reuse offline identity', async () => {
  const s = setup(); s.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: { name: 'AuthApiError', message: 'revoked' } });
  await expect(s.provider.restore()).rejects.toThrow(); expect(s.cache.read()).toBeNull();
  s.cache.write({ id: 'A' }); s.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
  expect(await s.provider.restore()).toBeNull(); expect(s.cache.read()).toBeNull();
});
it('logout clears the offline identity so grace cannot bypass logout', async () => {
  const s = setup(); await s.provider.logout(); expect(s.cache.read()).toBeNull();
});
