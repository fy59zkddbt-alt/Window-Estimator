import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { createDefaultDocumentSettings, normalizeDocumentSettings, type DocumentSettings } from '../src/application/settings/document-settings';
import { EstimatorDatabase } from '../src/infrastructure/storage/database';
import { DexieDocumentSettingsRepository } from '../src/infrastructure/storage/dexie-document-settings-repository';
import { DexieCalculatorSettingsRepository } from '../src/infrastructure/storage/dexie-calculator-settings-repository';
import { createCalculation } from '../src/application/estimate/calculation-service';

const seller: DocumentSettings = { sellerName: 'Анна', sellerPhone: '+7 (913) 123-45-67' };

it('provides independent empty defaults, with no company block', () => {
  const empty = createDefaultDocumentSettings();
  expect(empty).toEqual({ sellerName: '', sellerPhone: '' });
  empty.sellerName = 'Изменено';
  expect(createDefaultDocumentSettings().sellerName).toBe('');
});

it.each([
  {}, { ...seller, sellerName: '' }, { ...seller, sellerName: '  ' },
  { ...seller, sellerPhone: '' }, { ...seller, sellerPhone: '  ' },
])('requires nonblank name and phone: %j', (value) => {
  expect(() => normalizeDocumentSettings(value)).toThrow();
});

it('allows absent or partial company details and trims text without requiring a company', () => {
  expect(normalizeDocumentSettings(seller)).toEqual(seller);
  expect(normalizeDocumentSettings({ ...seller, inn: '1234567890' })).toEqual({ ...seller, inn: '1234567890' });
  expect(normalizeDocumentSettings({ ...seller, sellerName: ' Анна ', companyName: ' ', email: '' })).toEqual(seller);
});

it.each([
  null, [], { ...seller, sellerName: 42 }, { ...seller, telegram: null },
  { ...seller, sellerPhone: 'abc' }, { ...seller, sellerPhone: '123' },
  { ...seller, sellerPhone: '1234567890123456' }, { ...seller, companyPhone: 'broken' },
  { ...seller, email: 'invalid' }, { ...seller, inn: '123' },
  { ...seller, website: 'javascript:alert(1)' }, { ...seller, website: 'https://' },
])('rejects malformed supplied fields: %j', (value) => {
  expect(() => normalizeDocumentSettings(value)).toThrow();
});

it('round-trips all optional fields and allows 12-digit INN', () => {
  const value = { ...seller, telegram: '@anna', whatsapp: '+79131234567', email: 'anna@example.com',
    companyName: 'Окна', inn: '123456789012', companyPhone: '8 383 123-45-67', website: 'https://example.com/contact' };
  expect(normalizeDocumentSettings(value)).toEqual(value);
});

it('loads empty state without writing and preserves other settings and calculations across reload', async () => {
  const name = 'document-settings-roundtrip';
  const db = new EstimatorDatabase(name);
  let reopened: EstimatorDatabase | undefined;
  try {
    const repo = new DexieDocumentSettingsRepository(db);
    expect(await repo.load()).toEqual(createDefaultDocumentSettings());
    expect(await db.settings.count()).toBe(0);
    await db.settings.put({ key: 'activeCalculationId', value: 'existing' });
    const calculation = createCalculation('existing', '2026-10-02T00:00:00.000Z');
    await db.calculations.put(calculation);
    const calculator = new DexieCalculatorSettingsRepository(db);
    const rates = await calculator.load();
    await calculator.save(rates);
    const value = { ...seller, companyName: 'Окна', inn: '1234567890' };
    await repo.save(value);
    value.companyName = 'Несохранённое';
    db.close();
    reopened = new EstimatorDatabase(name);
    const next = new DexieDocumentSettingsRepository(reopened);
    expect(await next.load()).toEqual({ ...seller, companyName: 'Окна', inn: '1234567890' });
    expect(reopened.verno).toBe(3);
    expect((await reopened.settings.get('activeCalculationId'))?.value).toBe('existing');
    expect(await new DexieCalculatorSettingsRepository(reopened).load()).toEqual(rates);
    expect(await reopened.calculations.toArray()).toEqual([calculation]);
    await next.save(seller);
    expect(await next.load()).toEqual(seller);
    await expect(next.save(createDefaultDocumentSettings())).rejects.toThrow();
    expect(await next.load()).toEqual(seller);
  } finally { reopened?.close(); await db.delete(); }
});

it('reports corrupted records without silently replacing them', async () => {
  const db = new EstimatorDatabase('document-settings-corrupt');
  try {
    const repo = new DexieDocumentSettingsRepository(db);
    for (const value of ['{bad', 'null', '{}', JSON.stringify({ ...seller, email: 7 })]) {
      await db.settings.put({ key: 'documentSettings', value });
      await expect(repo.load()).rejects.toThrow('повреждены');
      expect((await db.settings.get('documentSettings'))?.value).toBe(value);
    }
  } finally { await db.delete(); }
});
