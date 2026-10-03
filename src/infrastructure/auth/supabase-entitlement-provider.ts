import type { SupabaseClient } from '@supabase/supabase-js';
import { decodeEntitlement, EntitlementUnavailable, type EntitlementProvider } from '../../application/access/entitlement';

export class SupabaseEntitlementProvider implements EntitlementProvider {
  constructor(private readonly client: SupabaseClient, private readonly online: () => boolean,
    private readonly deviceId: () => string) {}
  async check() {
    if (!this.online()) throw new EntitlementUnavailable();
    let result;
    const deviceId = this.deviceId();
    try { result = await this.client.rpc('get_entitlement', { p_device_id: deviceId }); }
    catch (reason) { if (reason instanceof TypeError) throw new EntitlementUnavailable(); throw reason; }
    if (result.error) {
      // SDK represents fetch failures as status 0; SQL/auth/HTTP errors fail closed.
      if (result.status === 0) throw new EntitlementUnavailable();
      throw new Error('Не удалось проверить доступ на сервере.');
    }
    const row = result.data;
    return decodeEntitlement({ userId: row?.user_id, status: row?.status, reason: row?.reason,
      serverNow: Date.parse(row?.server_now), validUntil: row?.valid_until === null ? null : Date.parse(row?.valid_until) });
  }
}
