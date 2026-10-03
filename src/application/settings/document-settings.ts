export { createDefaultDocumentSettings, normalizeDocumentSettings, documentSettingsFields } from '../../domain/documents/document-settings';
export type { DocumentSettings } from '../../domain/documents/document-settings';
import type { DocumentSettings } from '../../domain/documents/document-settings';

export interface DocumentSettingsRepository {
  reload?(): Promise<DocumentSettings>;
  readonly notice?: string;
  load(): Promise<DocumentSettings>;
  save(settings: DocumentSettings): Promise<void>;
}
