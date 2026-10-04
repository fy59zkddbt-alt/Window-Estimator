import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { authCallbackUrl } from '../src/infrastructure/auth/app-origin';
import { SupabaseAuthProvider } from '../src/infrastructure/auth/supabase-auth-provider';

it.each(['https://estimator.pages.dev', 'https://abc.estimator.pages.dev',
  'https://app.zamerok.ru', 'http://localhost:5173', 'http://127.0.0.1:5173'])
('uses the actual origin for email confirmation: %s', async (origin) => {
  const signUp = vi.fn(async () => ({ data: { session: null }, error: null }));
  const provider = new SupabaseAuthProvider({ auth: { signUp } } as unknown as SupabaseClient,
    undefined, authCallbackUrl('', origin));
  await provider.register('user@example.com', 'password');
  expect(signUp).toHaveBeenCalledWith({ email: 'user@example.com', password: 'password',
    options: { emailRedirectTo: `${origin}/auth/callback` } });
});

it('supports an explicit public canonical origin', () => {
  expect(authCallbackUrl(' https://estimator.pages.dev/ ', 'http://localhost:5173'))
    .toBe('https://estimator.pages.dev/auth/callback');
});

it.each(['http://example.com', 'https://example.com/path', 'https://example.com?next=evil',
  'https://example.com#fragment', 'https://user:password@example.com', 'javascript:alert(1)', 'invalid'])
('rejects invalid app origin without falling back silently: %s', (origin) => {
  expect(() => authCallbackUrl(origin, 'http://localhost:5173')).toThrow();
});
