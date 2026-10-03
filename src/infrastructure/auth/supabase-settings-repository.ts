import type { SupabaseClient } from '@supabase/supabase-js';
import { SettingsSyncError, type CloudSettingsRecord, type CloudSettingsRepository } from '../../application/settings/cloud-settings';

export class SupabaseSettingsRepository<T> implements CloudSettingsRepository<T> {
  constructor(private readonly client: SupabaseClient, private readonly userId: string,
    private readonly table: 'calculator_settings' | 'document_settings', private readonly decode: (value: unknown) => T) {
    if (!userId.trim()) throw new SettingsSyncError('settings_owner_mismatch');
  }
  private async authorize() {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw new SettingsSyncError('cloud_unavailable');
    if (data.session?.user.id !== this.userId) throw new SettingsSyncError('settings_owner_mismatch');
  }
  private record(row: { user_id: string; revision: number; payload: unknown }): CloudSettingsRecord<T> {
    if (row.user_id !== this.userId) throw new SettingsSyncError('settings_owner_mismatch');
    return { userId: row.user_id, revision: row.revision, value: this.decode(row.payload) };
  }
  async load() {
    await this.authorize();
    const { data, error } = await this.client.from(this.table).select('user_id,revision,payload').eq('user_id', this.userId).maybeSingle();
    if (error) throw new SettingsSyncError('cloud_unavailable');
    return data ? this.record(data) : null;
  }
  async create(value: T) {
    await this.authorize();
    const { data, error } = await this.client.from(this.table).insert({ user_id: this.userId, payload: value }).select('user_id,revision,payload').single();
    if (error?.code === '23505') throw new SettingsSyncError('settings_changed_elsewhere');
    if (error || !data) throw new SettingsSyncError('cloud_unavailable');
    return this.record(data);
  }
  async update(value: T, revision: number) {
    await this.authorize();
    // Compare-and-swap in a single SQL UPDATE; a separate SELECT is insufficient.
    const { data, error } = await this.client.from(this.table).update({ payload: value })
      .eq('user_id', this.userId).eq('revision', revision).select('user_id,revision,payload').maybeSingle();
    if (error) throw new SettingsSyncError('cloud_unavailable');
    if (!data) throw new SettingsSyncError('settings_changed_elsewhere');
    return this.record(data);
  }
}
