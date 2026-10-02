import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { EstimatorDatabase } from '../src/infrastructure/storage/database';
import { claimAnonymousData } from '../src/infrastructure/storage/local-ownership';
import { DexieCalculationRepository } from '../src/infrastructure/storage/dexie-calculation-repository';
import { DexieCalculatorSettingsRepository } from '../src/infrastructure/storage/dexie-calculator-settings-repository';
import { DexieDocumentSettingsRepository } from '../src/infrastructure/storage/dexie-document-settings-repository';
import { createCalculation } from '../src/application/estimate/calculation-service';

it('isolates calculations, active selection and both settings by user, including colliding ids', async () => {
  const db = new EstimatorDatabase('auth-isolation');
  try {
    const a = new DexieCalculationRepository(db, 'A');
    const b = new DexieCalculationRepository(db, 'B');
    const calculation = createCalculation('same-id', '2026-10-02T00:00:00.000Z');
    await a.save(calculation);
    expect(await b.list()).toEqual([]);
    expect(await b.get(calculation.id)).toBeUndefined();
    expect(await b.getActiveId()).toBeUndefined();
    await expect(b.setActiveId(calculation.id)).rejects.toThrow();
    await b.save({ ...calculation, clientName: 'B' });
    expect((await a.get(calculation.id))?.clientName).toBeUndefined();
    const ratesA = new DexieCalculatorSettingsRepository(db, 'A');
    const ratesB = new DexieCalculatorSettingsRepository(db, 'B');
    const rates = await ratesA.load();
    rates.glazing.profiles[0]!.basePricePerM2 = 123;
    await ratesA.save(rates);
    expect((await ratesB.load()).glazing.profiles[0]!.basePricePerM2).not.toBe(123);
    const docsA = new DexieDocumentSettingsRepository(db, 'A');
    const docsB = new DexieDocumentSettingsRepository(db, 'B');
    await docsA.save({ sellerName: 'A', sellerPhone: '1234567890' });
    expect((await docsB.load()).sellerName).toBe('');
    db.close(); await db.open();
    expect((await docsA.load()).sellerName).toBe('A');
    expect((await ratesA.load()).glazing.profiles[0]!.basePricePerM2).toBe(123);
  } finally { await db.delete(); }
});

it('claims anonymous calculations/settings once for first user and preserves all originals', async () => {
  const db = new EstimatorDatabase('auth-claim');
  try {
    const anonymous = new DexieCalculationRepository(db);
    const calculation = createCalculation('legacy', '2026-10-02T00:00:00.000Z');
    await anonymous.save(calculation);
    const rates = new DexieCalculatorSettingsRepository(db);
    await rates.save(await rates.load());
    await new DexieDocumentSettingsRepository(db).save({ sellerName: 'Legacy', sellerPhone: '1234567890' });
    await Promise.all([claimAnonymousData(db, 'A'), claimAnonymousData(db, 'B')]);
    expect(await new DexieCalculationRepository(db, 'A').get('legacy')).toEqual(calculation);
    expect(await new DexieCalculationRepository(db, 'B').list()).toEqual([]);
    expect(await new DexieCalculationRepository(db, 'A').getActiveId()).toBe('legacy');
    expect(await new DexieCalculatorSettingsRepository(db, 'A').load()).toEqual(await rates.load());
    expect((await new DexieDocumentSettingsRepository(db, 'A').load()).sellerName).toBe('Legacy');
    expect((await new DexieDocumentSettingsRepository(db, 'B').load()).sellerName).toBe('');
    expect(await anonymous.get('legacy')).toEqual(calculation);
    expect(await db.settings.get('documentSettings')).toBeDefined();
    await claimAnonymousData(db, 'B');
    expect(await new DexieCalculationRepository(db, 'B').list()).toEqual([]);
  } finally { await db.delete(); }
});

it('rolls back a conflicting claim without deleting originals or marking migration complete', async () => {
  const db = new EstimatorDatabase('auth-conflict');
  try {
    const calculation = createCalculation('legacy', '2026-10-02T00:00:00.000Z');
    await new DexieCalculationRepository(db).save(calculation);
    await new DexieCalculationRepository(db, 'A').save({ ...calculation, clientName: 'Existing' });
    await expect(claimAnonymousData(db, 'A')).rejects.toThrow();
    expect(await db.settings.get('anonymousDataOwner')).toBeUndefined();
    expect(await db.calculations.get('legacy')).toEqual(calculation);
    expect((await new DexieCalculationRepository(db, 'A').get('legacy'))?.clientName).toBe('Existing');
  } finally { await db.delete(); }
});
it('a settings conflict rolls back calculation copies made earlier in the same claim', async () => {
  const db = new EstimatorDatabase('auth-settings-conflict');
  try {
    await new DexieCalculationRepository(db).save(createCalculation('legacy', '2026-10-02T00:00:00.000Z'));
    const legacy = new DexieDocumentSettingsRepository(db);
    await legacy.save({ sellerName: 'Legacy', sellerPhone: '1234567890' });
    const owned = new DexieDocumentSettingsRepository(db, 'A');
    await owned.save({ sellerName: 'Existing', sellerPhone: '1234567890' });
    await expect(claimAnonymousData(db, 'A')).rejects.toThrow('конфликт');
    expect(await new DexieCalculationRepository(db, 'A').list()).toEqual([]);
    expect(await db.settings.get('anonymousDataOwner')).toBeUndefined();
    expect((await legacy.load()).sellerName).toBe('Legacy');
    expect((await owned.load()).sellerName).toBe('Existing');
  } finally { await db.delete(); }
});
