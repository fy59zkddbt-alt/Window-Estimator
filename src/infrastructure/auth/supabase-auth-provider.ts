import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { AuthProvider, AuthUser } from '../../application/auth/auth';
import type { AuthIdentityCache } from './auth-identity-cache';

function identity(user: User): AuthUser { return { id: user.id, ...(user.email ? { email: user.email } : {}) }; }
function authError(error: { code?: string | undefined; message: string }, operation: 'login' | 'register' | 'session' | 'logout'): Error {
  if (error.code === 'invalid_credentials') return new Error('Неверный email или пароль.');
  if (error.code === 'email_not_confirmed') return new Error('Подтвердите email по ссылке в письме, затем войдите.');
  if (error.code === 'weak_password') return new Error('Пароль слишком слабый. Используйте более длинный пароль.');
  if (error.code === 'over_request_rate_limit' || error.code === 'over_email_send_rate_limit') return new Error('Слишком много попыток. Попробуйте позже.');
  const messages = { login: 'Не удалось войти. Проверьте email, пароль и подключение к интернету.',
    register: 'Не удалось зарегистрироваться. Проверьте email, пароль и подключение к интернету.',
    session: 'Не удалось восстановить сессию. Проверьте подключение и повторите попытку.',
    logout: 'Не удалось выйти. Проверьте подключение и повторите попытку.' };
  return new Error(messages[operation]);
}

export class SupabaseAuthProvider implements AuthProvider {
  constructor(private readonly client: SupabaseClient, private readonly offlineIdentity?: AuthIdentityCache) {}
  private remember(user: AuthUser) {
    try { this.offlineIdentity?.write(user); } catch { /* online auth still works */ }
    return user;
  }
  private forget() { try { this.offlineIdentity?.clear(); } catch { /* no access without entitlement */ } }
  async restore() {
    const { data, error } = await this.client.auth.getSession();
    if (error) {
      // SDK may refuse an expired JWT during an offline cold start. A previously
      // known identity may reach AccessGate, which independently limits cached grace.
      if (error.name === 'AuthRetryableFetchError') {
        const cached = this.offlineIdentity?.read();
        if (cached) return cached;
      } else this.forget();
      throw authError(error, 'session');
    }
    if (!data.session) { this.forget(); return null; }
    return this.remember(identity(data.session.user));
  }
  async login(email: string, password: string) {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw authError(error, 'login');
    return this.remember(identity(data.user));
  }
  async register(email: string, password: string) {
    const { data, error } = await this.client.auth.signUp({ email, password });
    if (error) throw authError(error, 'register');
    // Explicit registration -> login flow, even when provider auto-signs-in.
    if (data.session) {
      const { error: logoutError } = await this.client.auth.signOut({ scope: 'local' });
      if (logoutError) throw authError(logoutError, 'logout');
    }
    return { needsEmailConfirmation: !data.session };
  }
  async logout() {
    const { error } = await this.client.auth.signOut({ scope: 'local' });
    if (error) throw authError(error, 'logout');
    this.forget();
  }
  subscribe(listener: (user: AuthUser | null) => void) {
    const { data } = this.client.auth.onAuthStateChange((event, session) => {
      // restore() handles a null initial session, including a retryable offline refresh.
      if (event === 'INITIAL_SESSION' && !session) return;
      if (!session) this.forget();
      listener(session ? this.remember(identity(session.user)) : null);
    });
    return () => data.subscription.unsubscribe();
  }
}

export function createSupabaseAuthProvider(url: string | undefined, key: string | undefined): AuthProvider {
  return new SupabaseAuthProvider(createSupabaseBrowserClient(url, key));
}

export function createSupabaseBrowserClient(url: string | undefined, key: string | undefined): SupabaseClient {
  // Only modern browser publishable keys are accepted; private/secret/role keys fail closed.
  if (!url || !key?.startsWith('sb_publishable_')) throw new Error('Auth не настроен: задайте URL Supabase и публичный publishable key.');
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))) {
    throw new Error('Supabase URL должен использовать HTTPS.');
  }
  return createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
}
