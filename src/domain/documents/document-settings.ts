/** Global seller details; a future document owns its own snapshot. */
export interface DocumentSettings {
  sellerName: string;
  sellerPhone: string;
  telegram?: string;
  whatsapp?: string;
  email?: string;
  companyName?: string;
  inn?: string;
  companyPhone?: string;
  website?: string;
}

export const documentSettingsFields = [
  ['sellerName', 'Имя'], ['sellerPhone', 'Телефон'], ['telegram', 'Telegram'],
  ['whatsapp', 'WhatsApp'], ['email', 'Email'], ['companyName', 'Название компании'],
  ['inn', 'ИНН'], ['companyPhone', 'Телефон компании'], ['website', 'Сайт'],
] as const;

/** Empty editor state is intentionally incomplete and cannot be saved. */
export function createDefaultDocumentSettings(): DocumentSettings {
  return { sellerName: '', sellerPhone: '' };
}

/** Validate untrusted persisted data and return a detached, trimmed value. */
export function normalizeDocumentSettings(value: unknown): DocumentSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Проверьте данные для КП.');
  const input = value as Record<string, unknown>;
  const result = createDefaultDocumentSettings();
  for (const [key, label] of documentSettingsFields) {
    const required = key === 'sellerName' || key === 'sellerPhone';
    const field = input[key];
    if (field === undefined && !required) continue;
    if (typeof field !== 'string') throw new Error(`${label}: требуется текст.`);
    const text = field.trim();
    if (!text && required) throw new Error(`Заполните поле «${label}».`);
    if (text) result[key] = text;
  }
  for (const key of ['sellerPhone', 'companyPhone'] as const) {
    const phone = result[key];
    if (phone && (!/^\+?[\d\s()-]+$/.test(phone) || !/^\d{7,15}$/.test(phone.replace(/\D/g, '')))) {
      throw new Error('Телефон: укажите 7–15 цифр; разрешены + в начале, пробелы, скобки и дефисы.');
    }
  }
  if (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) throw new Error('Проверьте Email.');
  if (result.inn && !/^(\d{10}|\d{12})$/.test(result.inn)) throw new Error('ИНН должен содержать 10 или 12 цифр.');
  if (result.website && !/^https?:\/\/[^\s/?#:@]+(?::\d{1,5})?(?:[/?#][^\s]*)?$/i.test(result.website)) {
    throw new Error('Сайт: укажите полный адрес с http:// или https://.');
  }
  return result;
}
