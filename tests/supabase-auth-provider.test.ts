import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAuthProvider, SupabaseAuthProvider } from '../src/infrastructure/auth/supabase-auth-provider';

function setup() {
  const user = { id: 'A', email: 'a@example.com' };
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: { user } }, error: null })),
    signInWithPassword: vi.fn(async () => ({ data: { user }, error: null as null | { code: string; message: string } })),
    signUp: vi.fn(async () => ({ data: { session: { user } as object | null }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    onAuthStateChange: vi.fn(),
  };
  return { auth, provider: new SupabaseAuthProvider({ auth } as unknown as SupabaseClient) };
}
it('uses SDK password login, restore and local logout with no remote application data', async () => {
  const { auth, provider } = setup();
  expect(await provider.restore()).toEqual({ id: 'A', email: 'a@example.com' });
  expect(await provider.login('a@example.com', 'password')).toEqual({ id: 'A', email: 'a@example.com' });
  expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@example.com', password: 'password' });
  await provider.logout();
  expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
});
it('ends auto-created registration session and handles required email confirmation', async () => {
  const { auth, provider } = setup();
  expect(await provider.register('a@example.com', 'password')).toEqual({ needsEmailConfirmation: false });
  expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  auth.signUp.mockResolvedValueOnce({ data: { session: null }, error: null });
  expect(await provider.register('a@example.com', 'password')).toEqual({ needsEmailConfirmation: true });
  expect(auth.signOut).toHaveBeenCalledTimes(1);
});
it('maps provider errors without exposing raw messages', async () => {
  const { auth, provider } = setup();
  auth.signInWithPassword.mockResolvedValueOnce({ data: { user: { id: 'A', email: 'a@example.com' } }, error: { code: 'invalid_credentials', message: 'raw provider response' } });
  await expect(provider.login('a@example.com', 'bad')).rejects.toThrow('Неверный email или пароль.');
});
it.each([undefined, 'sb_secret_private', 'service-role-jwt'])('rejects missing/private keys before SDK construction: %s', (key) => {
  expect(() => createSupabaseAuthProvider('https://example.supabase.co', key)).toThrow();
});
