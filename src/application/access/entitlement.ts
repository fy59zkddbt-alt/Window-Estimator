import { decodeBillingSummary, type BillingSummary } from './billing';

export type AccessRestriction = 'device_limit_reached' | 'trial_already_used_on_device';
export interface Entitlement {
  userId: string;
  status: 'trial' | 'active' | 'expired' | 'blocked';
  serverNow: number;
  validUntil: number | null;
  reason?: AccessRestriction;
  billing?: BillingSummary;
}
export interface EntitlementProvider { check(): Promise<Entitlement> }
export class EntitlementUnavailable extends Error {}
export interface EntitlementCacheRecord {
  entitlement: Entitlement;
  receivedAt: number;
  observedAt: number;
}
export interface EntitlementCache {
  read(userId: string): EntitlementCacheRecord | null;
  write(userId: string, value: EntitlementCacheRecord): void;
  remove(userId: string): void;
}
export interface AccessClock { wallNow(): number; monotonicNow(): number }
export interface AccessState {
  status: 'checking' | 'allowed' | 'expired' | 'blocked' | 'unavailable' | AccessRestriction;
  now?: number;
  entitlement?: Entitlement;
  offline?: boolean;
}
const day = 86_400_000;
export function expiryWarning(validUntil: number | null, now: number) {
  if (validUntil === null || validUntil <= now || validUntil - now > 5 * day) return null;
  return { days: Math.ceil((validUntil - now) / day), urgent: validUntil - now <= day };
}
export function decodeEntitlement(value: unknown): Entitlement {
  if (!value || typeof value !== 'object') throw new Error('Invalid entitlement');
  const e = value as Entitlement;
  if (typeof e.userId !== 'string' || !e.userId || !['trial', 'active', 'expired', 'blocked'].includes(e.status)
    || !Number.isFinite(e.serverNow) || (e.validUntil !== null && !Number.isFinite(e.validUntil))
    || (['trial', 'active'].includes(e.status) && (e.validUntil === null || e.validUntil <= e.serverNow))) throw new Error('Invalid entitlement');
  if (e.reason !== undefined && e.reason !== null
    && (!['device_limit_reached', 'trial_already_used_on_device'].includes(e.reason) || e.status !== 'expired')) throw new Error('Invalid entitlement');
  return { userId: e.userId, status: e.status, serverNow: e.serverNow, validUntil: e.validUntil,
    ...(e.reason ? { reason: e.reason } : {}),
    ...(e.billing === undefined ? {} : { billing: decodeBillingSummary(e.billing) }) };
}

/** Server decides entitlement; local clocks measure elapsed grace, never create dates. */
export class AccessController {
  state: AccessState = { status: 'checking' };
  private listeners = new Set<() => void>();
  private revision = 0;
  private record: EntitlementCacheRecord | null = null;
  private anchor = 0;
  private elapsed = 0;
  constructor(private readonly userId: string, private readonly provider: EntitlementProvider,
    private readonly cache: EntitlementCache, private readonly clock: AccessClock) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.state;
  private publish(state: AccessState) { this.state = state; this.listeners.forEach((listener) => listener()); }
  stop() { ++this.revision; }
  async check() {
    const revision = ++this.revision;
    const requestedAt = this.clock.wallNow();
    const requestAnchor = this.clock.monotonicNow();
    try {
      const entitlement = decodeEntitlement(await this.provider.check());
      if (revision !== this.revision) return;
      if (entitlement.userId !== this.userId) throw new Error('Entitlement owner mismatch');
      // Count the entire round trip conservatively, so network latency cannot
      // keep the app open past a server deadline.
      this.record = { entitlement, receivedAt: requestedAt, observedAt: requestedAt };
      this.anchor = requestAnchor; this.elapsed = 0;
      // Cache failure must not turn an authoritative denial into cached permission.
      try { this.cache.write(this.userId, this.record); } catch {
        try { this.cache.remove(this.userId); } catch { /* online verdict still applies */ }
      }
      this.evaluate(false);
    } catch (reason) {
      if (revision !== this.revision) return;
      if (!(reason instanceof EntitlementUnavailable)) {
        this.record = null;
        try { this.cache.remove(this.userId); } catch { /* fail closed */ }
        this.publish({ status: 'unavailable' }); return;
      }
      if (!this.record) {
        try {
          const cached = this.cache.read(this.userId);
          if (cached && decodeEntitlement(cached.entitlement).userId === this.userId
            && Number.isFinite(cached.receivedAt) && Number.isFinite(cached.observedAt)
            && cached.observedAt >= cached.receivedAt) {
            this.record = cached; this.anchor = this.clock.monotonicNow();
            this.elapsed = Math.max(0, this.clock.wallNow() - cached.receivedAt);
          }
        } catch { /* invalid cache never grants access */ }
      }
      this.evaluate(true);
    }
  }
  tick() { if (this.record) this.evaluate(this.state.offline ?? false); }
  private evaluate(offline: boolean) {
    const record = this.record;
    if (!record) { this.publish({ status: 'unavailable' }); return; }
    const wall = this.clock.wallNow();
    if (wall < record.observedAt) { this.publish({ status: 'unavailable' }); return; }
    const elapsed = Math.max(wall - record.receivedAt, this.elapsed + this.clock.monotonicNow() - this.anchor);
    const now = record.entitlement.serverNow + elapsed;
    record.observedAt = wall;
    try { this.cache.write(this.userId, record); } catch { /* no persistent offline grant */ }
    const e = record.entitlement;
    const status = e.status === 'blocked' ? 'blocked' : e.reason ? e.reason : e.status === 'expired' || (e.validUntil !== null && now >= e.validUntil)
      ? 'expired' : elapsed >= day ? 'unavailable' : 'allowed';
    this.publish({ status, entitlement: e, now, offline });
  }
}
