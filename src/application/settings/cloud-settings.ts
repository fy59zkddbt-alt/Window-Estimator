export type SettingsSyncCode = 'settings_changed_elsewhere' | 'cloud_unavailable' | 'offline' | 'settings_owner_mismatch';
export class SettingsSyncError extends Error {
  constructor(public readonly code: SettingsSyncCode) {
    super({ settings_changed_elsewhere: 'Настройки изменены на другом устройстве. Загрузите актуальные настройки.',
      cloud_unavailable: 'Не удалось синхронизировать настройки. Проверьте подключение и повторите попытку.',
      offline: 'Для сохранения глобальных настроек требуется интернет.',
      settings_owner_mismatch: 'Настройки принадлежат другому пользователю.' }[code]);
  }
}
export interface CloudSettingsRecord<T> { userId: string; revision: number; value: T }
export interface CloudSettingsRepository<T> {
  load(): Promise<CloudSettingsRecord<T> | null>;
  create(value: T): Promise<CloudSettingsRecord<T>>;
  update(value: T, revision: number): Promise<CloudSettingsRecord<T>>;
}
export interface SettingsCache<T> { load(): Promise<T>; save(value: T): Promise<void> }

/** Session-scoped revision belongs to the loaded editor; no background merge or queue. */
export class CloudSettingsSync<T> {
  private revision: number | undefined;
  notice = '';
  private pendingLoad: Promise<T> | undefined;
  constructor(private readonly userId: string, private readonly cache: SettingsCache<T>,
    private readonly cloud: CloudSettingsRepository<T>, private readonly decode: (value: unknown) => T,
    private readonly online: () => boolean) {
    if (!userId.trim()) throw new SettingsSyncError('settings_owner_mismatch');
  }
  private async accept(record: CloudSettingsRecord<T>): Promise<T> {
    if (record.userId !== this.userId) throw new SettingsSyncError('settings_owner_mismatch');
    if (!Number.isSafeInteger(record.revision) || record.revision < 1) throw new Error('Повреждена версия cloud settings.');
    const value = this.decode(record.value);
    await this.cache.save(value);
    this.revision = record.revision; this.notice = '';
    return value;
  }
  async reload(): Promise<T> {
    if (this.pendingLoad) return this.pendingLoad;
    this.pendingLoad = this.refresh();
    try { return await this.pendingLoad; } finally { this.pendingLoad = undefined; }
  }
  private async refresh(): Promise<T> {
    if (!this.online()) throw new SettingsSyncError('offline');
    const record = await this.cloud.load();
    if (record) return this.accept(record);
    const local = await this.cache.load();
    try { return await this.accept(await this.cloud.create(local)); }
    catch (reason) {
      // Two devices may initialize simultaneously; the winner becomes authoritative.
      if (!(reason instanceof SettingsSyncError) || reason.code !== 'settings_changed_elsewhere') throw reason;
      const winner = await this.cloud.load();
      if (!winner) throw reason;
      return this.accept(winner);
    }
  }
  async load(): Promise<T> {
    try { return await this.reload(); }
    catch (reason) {
      if (!(reason instanceof SettingsSyncError) || !['offline', 'cloud_unavailable'].includes(reason.code)) throw reason;
      this.revision = undefined;
      this.notice = 'Cloud недоступен. Используется локальный cache; сохранение настроек требует загрузки из cloud.';
      return this.cache.load();
    }
  }
  async save(value: T): Promise<void> {
    if (!this.online()) throw new SettingsSyncError('offline');
    if (this.revision === undefined) throw new SettingsSyncError('cloud_unavailable');
    await this.accept(await this.cloud.update(this.decode(value), this.revision));
  }
}
