import type { AuthUser } from '../../application/auth/auth';

export interface AuthIdentityCache { read(): AuthUser | null; write(user: AuthUser): void; clear(): void }
/** Only an offline identity hint, never a token or authority to server APIs. */
export class BrowserAuthIdentityCache implements AuthIdentityCache {
  private readonly key = 'window-estimator:offline-identity:v1';
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {}
  read(): AuthUser | null {
    try {
      const raw = this.storage.getItem(this.key);
      const value = raw ? JSON.parse(raw) as AuthUser : null;
      return value && typeof value.id === 'string' && value.id.trim()
        ? { id: value.id, ...(typeof value.email === 'string' ? { email: value.email } : {}) } : null;
    } catch { return null; }
  }
  write(user: AuthUser) { this.storage.setItem(this.key, JSON.stringify(user)); }
  clear() { this.storage.removeItem(this.key); }
}
