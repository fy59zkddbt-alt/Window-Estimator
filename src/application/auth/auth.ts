export interface AuthUser { id: string; email?: string }
export interface AuthProvider {
  restore(): Promise<AuthUser | null>;
  login(email: string, password: string): Promise<AuthUser>;
  register(email: string, password: string): Promise<{ needsEmailConfirmation: boolean }>;
  logout(): Promise<void>;
  subscribe(listener: (user: AuthUser | null) => void): () => void;
}
export interface AuthState {
  status: 'loading' | 'anonymous' | 'authenticated' | 'error';
  user?: AuthUser;
  error?: string;
  notice?: string;
}

/** Owns access to the app; contains no browser or provider-specific APIs. */
export class AuthController {
  state: AuthState = { status: 'loading' };
  private listeners = new Set<() => void>();
  private unsubscribe: (() => void) | undefined;
  private revision = 0;
  private operation = 0;
  private registering = false;
  constructor(private readonly provider: AuthProvider, private readonly prepareLocalData: (userId: string) => Promise<void>) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.state;
  private publish(state: AuthState) { this.state = state; this.listeners.forEach((listener) => listener()); }
  private message(reason: unknown) { return reason instanceof Error ? reason.message : 'Не удалось выполнить вход. Попробуйте ещё раз.'; }
  private async accept(user: AuthUser | null) {
    const revision = ++this.revision;
    if (!user) { this.publish({ status: 'anonymous' }); return; }
    if (this.state.status === 'authenticated' && this.state.user?.id === user.id) return;
    this.publish({ status: 'loading' });
    try {
      await this.prepareLocalData(user.id);
      if (revision === this.revision) this.publish({ status: 'authenticated', user });
    } catch (reason) {
      if (revision === this.revision) this.publish({ status: 'error', error: this.message(reason) });
    }
  }
  async start() {
    ++this.operation;
    this.unsubscribe?.();
    const revision = ++this.revision;
    this.publish({ status: 'loading' });
    this.unsubscribe = this.provider.subscribe((user) => {
      if (this.registering) return;
      // A signout also cancels an in-flight password login.
      if (!user) ++this.operation;
      void this.accept(user);
    });
    try {
      const user = await this.provider.restore();
      if (revision === this.revision) await this.accept(user);
    } catch (reason) {
      if (revision === this.revision) this.publish({ status: 'error', error: this.message(reason) });
    }
  }
  stop() { this.unsubscribe?.(); this.unsubscribe = undefined; ++this.revision; ++this.operation; }
  async login(email: string, password: string) {
    const operation = ++this.operation;
    this.publish({ status: 'loading' });
    try {
      const user = await this.provider.login(email.trim(), password);
      if (operation === this.operation) await this.accept(user);
    } catch (reason) { if (operation === this.operation) this.publish({ status: 'anonymous', error: this.message(reason) }); }
  }
  async register(email: string, password: string) {
    const operation = ++this.operation;
    this.registering = true; ++this.revision;
    this.publish({ status: 'loading' });
    try {
      const result = await this.provider.register(email.trim(), password);
      if (operation !== this.operation) return;
      this.publish({ status: 'anonymous', notice: result.needsEmailConfirmation
        ? 'Проверьте почту: если требуется подтверждение адреса, перейдите по ссылке, затем войдите.'
        : 'Регистрация завершена. Войдите с email и паролем.' });
    } catch (reason) { if (operation === this.operation) this.publish({ status: 'anonymous', error: this.message(reason) }); }
    finally { this.registering = false; }
  }
  async logout() {
    const operation = ++this.operation;
    ++this.revision;
    this.publish({ status: 'loading' });
    try { await this.provider.logout(); if (operation === this.operation) await this.accept(null); }
    catch (reason) { if (operation === this.operation) this.publish({ status: 'error', error: this.message(reason) }); }
  }
}
