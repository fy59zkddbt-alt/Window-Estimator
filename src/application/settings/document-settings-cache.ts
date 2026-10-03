import { createDefaultDocumentSettings, normalizeDocumentSettings } from '../../domain/documents/document-settings';

/** Only the exact empty default is permitted as an unconfigured cloud/cache state. */
export function decodeDocumentSettingsCache(value: unknown) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const input = value as Record<string, unknown>;
    if (Object.keys(input).length === 2 && input.sellerName === '' && input.sellerPhone === '') return createDefaultDocumentSettings();
  }
  return normalizeDocumentSettings(value);
}
