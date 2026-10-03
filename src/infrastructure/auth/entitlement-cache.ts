import type { EntitlementCache, EntitlementCacheRecord } from '../../application/access/entitlement';

/** Separate from Calculation/settings storage; no entitlement operation deletes local work. */
export class BrowserEntitlementCache implements EntitlementCache {
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
    private readonly deviceId: string) {}
  private key(userId: string) { return `window-estimator:entitlement:v2:${encodeURIComponent(this.deviceId)}:${encodeURIComponent(userId)}`; }
  read(userId: string): EntitlementCacheRecord | null {
    const raw = this.storage.getItem(this.key(userId));
    return raw ? JSON.parse(raw) as EntitlementCacheRecord : null;
  }
  write(userId: string, value: EntitlementCacheRecord) { this.storage.setItem(this.key(userId), JSON.stringify(value)); }
  remove(userId: string) { this.storage.removeItem(this.key(userId)); }
}
