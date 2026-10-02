import type { DocumentSettingsRepository } from '../../application/settings/document-settings';
import { createDefaultDocumentSettings, normalizeDocumentSettings, type DocumentSettings } from '../../domain/documents/document-settings';
import type { EstimatorDatabase } from './database';
import { ownedKey } from './local-ownership';

const key = 'documentSettings';

export class DexieDocumentSettingsRepository implements DocumentSettingsRepository {
  constructor(private readonly database: EstimatorDatabase, private readonly userId?: string) {
    if (userId !== undefined) ownedKey(userId, '');
  }
  private get table() { return this.userId === undefined ? this.database.settings : this.database.ownedSettings; }
  private get storageKey() { return this.userId === undefined ? key : ownedKey(this.userId, key); }
  async load(): Promise<DocumentSettings> {
    const record = await this.table.get(this.storageKey);
    if (!record) return createDefaultDocumentSettings();
    try { return normalizeDocumentSettings(JSON.parse(record.value)); }
    catch { throw new Error('Сохранённые данные для КП повреждены. Исходная запись не изменена.'); }
  }
  async save(settings: DocumentSettings): Promise<void> {
    const value = normalizeDocumentSettings(settings);
    await this.table.put({ key: this.storageKey, value: JSON.stringify(value) });
  }
}
