import type { DocumentSettingsRepository } from '../../application/settings/document-settings';
import { createDefaultDocumentSettings, normalizeDocumentSettings, type DocumentSettings } from '../../domain/documents/document-settings';
import type { EstimatorDatabase } from './database';

const key = 'documentSettings';

export class DexieDocumentSettingsRepository implements DocumentSettingsRepository {
  constructor(private readonly database: EstimatorDatabase) {}
  async load(): Promise<DocumentSettings> {
    const record = await this.database.settings.get(key);
    if (!record) return createDefaultDocumentSettings();
    try { return normalizeDocumentSettings(JSON.parse(record.value)); }
    catch { throw new Error('Сохранённые данные для КП повреждены. Исходная запись не изменена.'); }
  }
  async save(settings: DocumentSettings): Promise<void> {
    const value = normalizeDocumentSettings(settings);
    await this.database.settings.put({ key, value: JSON.stringify(value) });
  }
}
