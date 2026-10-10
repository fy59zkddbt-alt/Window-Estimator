import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createDefaultCalculatorSettings, copyCalculatorSettings as copyEnvelope } from '../src/domain/configuration/calculator-settings';
import type { CalculatorSettings as Envelope } from '../src/domain/configuration/calculator-settings';
import { createStarterCalculatorSettings } from '../src/domain/configuration/vnext/settings';
import { activateCalculatorSettings, ActiveCalculatorSettingsRepository } from '../src/application/settings/active-calculator-settings';
import { CloudSettingsSync, SettingsSyncError, type CloudSettingsRecord } from '../src/application/settings/cloud-settings';
import { createCalculation, measurementSnapshot, saveMeasurement, estimateCalculation, updateOrderAdditionalWorks,
  updateCalculationDiscount, confirmFixedFinalPrice, copyMeasurement, deleteMeasurement, updateCalculationDetails, estimateDraft } from '../src/application/estimate/active-calculation';
import { estimateCalculationVNext } from '../src/application/estimate/estimate-calculation-vnext';
import * as glazing from '../src/application/estimate/estimate-glazing-vnext';
import * as finishing from '../src/application/estimate/estimate-finish-vnext';
import { windowFromDraft, windowToDraft, finishFromDraft, finishToDraft, balconyFromDraft } from '../src/application/estimate/calculator-drafts';
import type { WindowMeasurement, WindowFinishMeasurement } from '../src/domain/measurements/vnext';
import type { Calculation } from '../src/domain/calculation-vnext';
import { EstimatorDatabase } from '../src/infrastructure/storage/database';
import { DexieCalculatorSettingsRepository } from '../src/infrastructure/storage/dexie-calculator-settings-repository';
import { ActiveDexieCalculationRepository, transitionCalculatorData } from '../src/infrastructure/storage/active-calculation-repository';
import { ownedKey, claimAnonymousData } from '../src/infrastructure/storage/local-ownership';
import { createCalculation as legacyCalculation } from '../src/application/estimate/calculation-service';

const date = '2026-10-10T00:00:00.000Z';
const databases: EstimatorDatabase[] = [];
function db() { const value = new EstimatorDatabase(`feature8-${crypto.randomUUID()}`); databases.push(value); return value; }
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(databases.splice(0).map((value) => value.delete())); });
function window(id = 'window'): WindowMeasurement {
  return { kind: 'Window', id, room: 'Кухня', name: 'Окно', material: 'pvc', profileId: 'pvc-standard', colorId: 'white',
    extensions: false, connectors: false, additionalWorks: [], windowType: 'single', widthMm: 1000, heightMm: 1000,
    plane: { id: `${id}:plane`, sections: [{ id: 's', widthMm: 1000, openingType: 'turn', hingeSide: 'left', hardwareId: 'standard' }] } };
}
function finish(id = 'finish'): WindowFinishMeasurement {
  return { kind: 'WindowFinish', id, room: 'Кухня', name: 'Отделка', widthMm: 1400, heightMm: 2100, depthMm: 210,
    side: 'interior', workType: 'interiorSlopesAndSill', selections: [{ element: 'slope', materialId: 'sandwich' },
      { element: 'sill', materialId: 'sill-standard' }], priceState: { mode: 'automatic' }, additionalWorks: [] };
}
function add(value: Calculation, measurement: WindowMeasurement | WindowFinishMeasurement) {
  return saveMeasurement(value, measurement, measurementSnapshot(value, measurement.kind), date, 'add');
}
function configured() {
  const value = createStarterCalculatorSettings();
  value.glazing.profiles[0]!.basePricePerM2 = 7234;
  value.pricesConfirmed = true; value.commercialRoundingStepRub = 10; return value;
}

describe('Feature 8 active settings and protected cloud path', () => {
  it('activates configured v2 without overwriting catalogs or confirmation and ignores v1 prices', async () => {
    const database = db(); const cache = new DexieCalculatorSettingsRepository(database, 'A');
    const envelope = createDefaultCalculatorSettings(); envelope.settingsV2 = configured();
    envelope.glazing.profiles[0]!.basePricePerM2 = 999999;
    await cache.save(envelope);
    const active = new ActiveCalculatorSettingsRepository(cache);
    const loaded = await active.load();
    expect(loaded).toEqual(envelope.settingsV2);
    expect(activateCalculatorSettings(envelope)).toEqual(envelope);
    const calculation = add(createCalculation('new', date, loaded), window());
    const priced = estimateCalculation(calculation).measurements[0]!;
    if (priced.kind === 'WindowFinish') throw new Error('fixture');
    expect(priced.result.configuration.profiles[0]!.basePricePerM2).toBe(7234);
    expect((await cache.load()).glazing.profiles[0]!.basePricePerM2).toBe(999999);
  });
  it('initializes only absent v2 from starter, unconfirmed, independently and idempotently', async () => {
    const original = createDefaultCalculatorSettings();
    const upgraded = activateCalculatorSettings(original);
    expect(upgraded.settingsV2).toEqual(createStarterCalculatorSettings());
    expect(upgraded.settingsV2!.pricesConfirmed).toBe(false);
    expect(original.settingsV2).toBeUndefined();
    expect(activateCalculatorSettings(upgraded)).toEqual(upgraded);
    const repository = new ActiveCalculatorSettingsRepository(new DexieCalculatorSettingsRepository(db(), 'A'));
    expect(await repository.load()).toEqual(createStarterCalculatorSettings());
  });
  it('uses configured v2 even if retired v1 tariffs are invalid', async () => {
    const database = db(); const envelope = createDefaultCalculatorSettings(); envelope.settingsV2 = configured();
    envelope.glazing.profiles[0]!.basePricePerM2 = -999;
    await database.ownedSettings.put({ key: ownedKey('A', 'calculatorSettings'), value: JSON.stringify(envelope) });
    const active = new ActiveCalculatorSettingsRepository(new DexieCalculatorSettingsRepository(database, 'A', activateCalculatorSettings));
    expect(await active.load()).toEqual(envelope.settingsV2);
    expect(activateCalculatorSettings(envelope).settingsV2).toEqual(envelope.settingsV2);
  });
  it('saves and reloads via owner/revision checks; conflict/offline failures do not replace cache or settings', async () => {
    const database = db(); const cache = new DexieCalculatorSettingsRepository(database, 'A');
    const initial = createDefaultCalculatorSettings(); initial.settingsV2 = configured();
    let record: CloudSettingsRecord<Envelope> = { userId: 'A', revision: 7, value: initial };
    let online = true;
    const decode = (value: unknown) => activateCalculatorSettings(value as Envelope);
    const updates: number[] = [];
    const sync = new CloudSettingsSync('A', cache, {
      load: async () => record, create: async () => { throw new Error('existing record must not be created'); },
      update: async (value, revision) => {
        updates.push(revision);
        if (revision !== record.revision) throw new SettingsSyncError('settings_changed_elsewhere');
        record = { userId: 'A', revision: revision + 1, value: copyEnvelope(value) }; return record;
      },
    }, decode, () => online);
    const repository = new ActiveCalculatorSettingsRepository(sync);
    const settings = await repository.load(); expect(settings).toEqual(initial.settingsV2);
    settings.glazing.profiles[0]!.basePricePerM2 = 8000;
    await repository.save(settings); expect(updates).toEqual([7]);
    expect(await repository.reload()).toEqual(settings);
    const before = await cache.load(); record.revision++;
    await expect(repository.save(configured())).rejects.toMatchObject({ code: 'settings_changed_elsewhere' });
    expect(await cache.load()).toEqual(before);
    online = false; expect(await repository.load()).toEqual(settings);
    await expect(repository.save(configured())).rejects.toMatchObject({ code: 'offline' });
    expect(await cache.load()).toEqual(before);
    online = true; record = { ...record, userId: 'B' };
    await expect(repository.reload()).rejects.toMatchObject({ code: 'settings_owner_mismatch' });
    expect(await cache.load()).toEqual(before);
  });
  it('starter initialization is cached through the protected cloud read; no v1 price imports', async () => {
    const database = db(); const cache = new DexieCalculatorSettingsRepository(database, 'A');
    const envelope = createDefaultCalculatorSettings(); envelope.glazing.profiles[0]!.basePricePerM2 = 999999;
    const decode = (value: unknown) => activateCalculatorSettings(value as Envelope);
    const sync = new CloudSettingsSync('A', cache, { load: async () => ({ userId: 'A', revision: 1, value: envelope }),
      create: async () => { throw new Error('unexpected'); }, update: async () => { throw new Error('unexpected'); } }, decode, () => true);
    const repository = new ActiveCalculatorSettingsRepository(sync);
    expect((await repository.load()).glazing.profiles[0]!.basePricePerM2).toBe(5700);
    expect((await cache.load()).settingsV2?.pricesConfirmed).toBe(false);
    expect((await cache.load()).glazing).toEqual(envelope.glazing);
  });
  it('fails on corrupt explicitly stored v2 rather than falling back to v1 or replacing the original', async () => {
    const database = db(); const original = activateCalculatorSettings(createDefaultCalculatorSettings());
    original.settingsV2!.finish.finishMarkupPercent = -1;
    const raw = JSON.stringify(original); const key = ownedKey('A', 'calculatorSettings');
    await database.ownedSettings.put({ key, value: raw });
    await expect(new ActiveCalculatorSettingsRepository(new DexieCalculatorSettingsRepository(database, 'A')).load()).rejects.toThrow('повреждены');
    expect((await database.ownedSettings.get(key))!.value).toBe(raw);
  });
});

describe('Feature 8 Calculation creation, snapshots and canonical production estimates', () => {
  it('creates empty v4 with defaults, metadata slots, full independent settings and rounding snapshot', () => {
    const settings = configured(); const value = createCalculation('new', date, settings);
    expect(value).toMatchObject({ schemaVersion: 4, id: 'new', createdAt: date, updatedAt: date,
      measurements: [], orderAdditionalWorks: [], configuration: {}, discount: { mode: 'none' }, commercialRoundingStepRub: 10, settingsSnapshot: settings });
    expect(value.settingsSnapshot).not.toBe(settings);
    expect(value.settingsSnapshot!.glazing.profiles[0]).not.toBe(settings.glazing.profiles[0]);
    expect(updateCalculationDetails(value, { clientName: 'Иван', clientPhone: '123', objectAddress: 'Адрес' }, date)).toMatchObject({ clientName: 'Иван', clientPhone: '123', objectAddress: 'Адрес' });
  });
  it('old calculations and later additions retain creation snapshot; new calculations use changed settings', async () => {
    const settings = configured(); const old = add(createCalculation('old', date, settings), window());
    const before = estimateCalculation(old);
    const database = db(); const repository = new ActiveDexieCalculationRepository(database, 'A'); await repository.save(old);
    settings.glazing.profiles[0]!.basePricePerM2 = 15000; settings.finish.finishMarkupPercent = 80; settings.commercialRoundingStepRub = 100;
    const restored = (await repository.get('old'))!;
    expect(estimateCalculation(restored)).toEqual(before);
    const oldWithNewMeasurement = add(restored, window('later'));
    expect(estimateCalculation(oldWithNewMeasurement).measurements[1]!.basePriceMinor).toBe(before.measurements[0]!.basePriceMinor);
    const current = add(createCalculation('current', date, settings), window());
    expect(estimateCalculation(current).finalTotalMinor).not.toBe(before.finalTotalMinor);
    expect(current.commercialRoundingStepRub).toBe(100);
    expect(restored.commercialRoundingStepRub).toBe(10);
  });
  it('production aggregation directly uses Features 3, 4 and 5', () => {
    const glazingSpy = vi.spyOn(glazing, 'estimateCalculationGlazingVNext');
    const finishSpy = vi.spyOn(finishing, 'estimateCalculationFinishVNext');
    const value = add(add(createCalculation('mixed', date, configured()), window()), finish());
    glazingSpy.mockClear(); finishSpy.mockClear();
    expect(estimateCalculation).toBe(estimateCalculationVNext);
    const totals = estimateCalculation(value);
    expect(glazingSpy).toHaveBeenCalledOnce(); expect(finishSpy).toHaveBeenCalledOnce();
    expect(totals.measurements[0]!.result).toEqual(glazing.estimateCalculationGlazingVNext(value, 'window'));
    expect(totals.measurements[1]!.result).toEqual(finishing.estimateCalculationFinishVNext(value, 'finish'));
  });
  it.each([10, 50, 100] as const)('keeps work line and commercial boundaries, percent and exact fixed price at step %s', (step) => {
    const settings = configured(); settings.commercialRoundingStepRub = step;
    const manual = finish(); manual.priceState = { mode: 'manual', finalPriceMinor: 123456, confirmation: 'confirmed' };
    manual.additionalWorks = [{ id: 'work', name: 'Работа', unitPriceMinor: 2501, quantity: 2 }];
    let value = add(add(createCalculation('mixed', date, settings), window()), manual);
    value = updateOrderAdditionalWorks(value, [{ id: 'order', name: 'Доставка', unitPriceMinor: 501, quantity: 3 }], date);
    const totals = estimateCalculation(value);
    expect(totals).toEqual(estimateCalculationVNext(value));
    expect(totals.measurements[1]!.basePriceMinor).toBe(123456);
    expect(totals.measurements[1]!.additionalWorkLines[0]!.priceBeforeCommercialRoundingMinor).toBe(5002);
    expect(totals.orderAdditionalWorkLines[0]!.priceBeforeCommercialRoundingMinor).toBe(1503);
    expect(totals.subtotalMinor).toBe(totals.measurementsSubtotalMinor! + totals.orderWorksTotalMinor);
    const percent = estimateCalculation(updateCalculationDiscount(value, { mode: 'percent', discountPercent: 7.25 }, date));
    expect(percent).toEqual(estimateCalculationVNext(updateCalculationDiscount(value, { mode: 'percent', discountPercent: 7.25 }, date)));
    expect(percent.finalTotalMinor! % (step * 100)).toBe(0);
    value = updateCalculationDiscount(value, { mode: 'fixedFinalPrice', fixedFinalPriceMinor: 12345 }, date);
    expect(estimateCalculation(value).finalTotalMinor).toBe(12345);
    const invalidated = updateOrderAdditionalWorks(value, value.orderAdditionalWorks, date);
    expect(estimateCalculation(invalidated).finalTotalMinor).toBeNull();
    expect(estimateCalculation(confirmFixedFinalPrice(invalidated, date)).finalTotalMinor).toBe(12345);
  });
  it('unresolved finishing survives persistence and propagates null totals without v1 fallback', async () => {
    const measurement = finish(); measurement.depthMm = 999;
    const value = add(createCalculation('unresolved', date, configured()), measurement);
    expect(estimateCalculation(value)).toMatchObject({ pricingStatus: 'unresolved', subtotalMinor: null, finalTotalMinor: null, isFinalized: false });
    expect(() => updateCalculationDiscount(value, { mode: 'fixedFinalPrice', fixedFinalPriceMinor: 1 }, date)).toThrow('уточните');
    const repository = new ActiveDexieCalculationRepository(db(), 'A'); await repository.save(value);
    expect(estimateCalculation((await repository.get(value.id))!)).toEqual(estimateCalculation(value));
  });
  it('copy/edit/delete preserve independent snapshots, metadata, work quantities and fixed-price invalidation', () => {
    const original = window(); original.additionalWorks = [{ id: 'work', name: 'Работа', unitPriceMinor: 3000, quantity: 2 }];
    const value = updateCalculationDiscount(add(createCalculation('copy', date, configured()), original), { mode: 'fixedFinalPrice', fixedFinalPriceMinor: 10000 }, date);
    const copied = copyMeasurement(value, 'window', 'copy-window', date);
    expect(copied.measurements[1]!.additionalWorks[0]).toMatchObject({ quantity: 2, unitPriceMinor: 3000 });
    expect(copied.measurements[1]!.additionalWorks[0]!.id).not.toBe('work');
    expect(copied.configuration.window).not.toBe(copied.configuration['copy-window']);
    expect(estimateCalculation(copied).finalTotalMinor).toBeNull();
    expect(deleteMeasurement(copied, 'window', date).configuration.window).toBeUndefined();
    expect(estimateCalculation(updateCalculationDetails(value, { clientName: 'Иван' }, date)).finalTotalMinor).toBe(10000);
  });
  it('existing window/finish drafts bind to vNext without pricing or geometry operations in the adapter', () => {
    const settings = configured(); const measurement = window();
    const bound = windowFromDraft(windowToDraft(measurement, settings.glazing), settings.glazing, measurement.additionalWorks, measurement);
    expect(bound).toEqual(measurement);
    expect(estimateDraft(bound, { kind: 'Window', configuration: settings.glazing }, 10).basePriceMinor).toBe(glazing.estimateGlazingVNext(bound, settings.glazing, 10).price.totalMinor);
    const finishMeasurement = finish();
    expect(finishFromDraft(finishToDraft(finishMeasurement), [], finishMeasurement)).toMatchObject(finishMeasurement);
    const balcony = balconyFromDraft({ id: 'balcony', room: 'Балкон', name: 'Остекление', balconyType: 'straight', material: 'aluminium', profileId: 'aluminium-example', lamination: 'none', planes: [{ id: 'facade', name: 'Фасад', position: 'facade', widthMm: 1000, heightMm: 1000, sectionCount: 1, levels: { mode: 'oneLevel' }, sections: [{ id: 's', widthMm: 1000, openingType: 'sliding' }] }] }, settings.glazing, []);
    expect(estimateDraft(balcony, { kind: 'Balcony', configuration: settings.glazing }, 10).pricingStatus).toBe('priced');
    const source = readFileSync('src/application/estimate/calculator-drafts.ts', 'utf8');
    expect(source).not.toMatch(/from ['"].*(?:domain\/(?:geometry|pricing)|estimate-window)['"]/);
  });
});

describe('Feature 8 deterministic owner-scoped calculator cleanup', () => {
  it('removes only this owner’s legacy calculations and their active pointer once; everything unrelated survives', async () => {
    const database = db();
    const legacy = legacyCalculation('legacy', date);
    await database.calculations.put(legacy);
    await database.ownedCalculations.bulkPut(['A', 'B'].map((userId) => ({ key: ownedKey(userId, legacy.id), userId, calculation: legacy })));
    const values = ['calculatorSettings', 'documentSettings', 'account', 'cloudRevision', 'auth', 'session', 'subscription', 'trustedDevice'].map((id) => ({ key: ownedKey('A', id), value: `unchanged:${id}` }));
    await database.ownedSettings.bulkPut([...values, { key: ownedKey('A', 'activeCalculationId'), value: 'legacy' }]);
    await database.settings.put({ key: 'anonymousDataOwner', value: 'A' });
    const v4 = createCalculation('v4', date, configured());
    await database.ownedCalculations.put({ key: ownedKey('A', 'v4'), userId: 'A', calculation: v4 as unknown as ReturnType<typeof legacyCalculation> });
    const repository = new ActiveDexieCalculationRepository(database, 'A');
    expect((await repository.list()).map((item) => item.id)).toEqual(['v4']);
    expect(await repository.getActiveId()).toBeUndefined();
    expect(await database.ownedCalculations.get(ownedKey('B', 'legacy'))).toBeDefined();
    expect(await database.calculations.get('legacy')).toEqual(legacy);
    expect(await database.ownedSettings.bulkGet(values.map((value) => value.key))).toEqual(values);
    expect(await database.settings.get('anonymousDataOwner')).toEqual({ key: 'anonymousDataOwner', value: 'A' });
    const before = await database.ownedSettings.toArray(); await transitionCalculatorData(database, 'A');
    expect(await database.ownedSettings.toArray()).toEqual(before);
    expect((await repository.list()).map((item) => item.id)).toEqual(['v4']);
    // A late incompatible write is rejected, never causes another automatic cleanup.
    await database.ownedCalculations.put({ key: ownedKey('A', 'legacy'), userId: 'A', calculation: legacy });
    await expect(repository.list()).rejects.toThrow();
    expect(await database.ownedCalculations.get(ownedKey('A', 'legacy'))).toBeDefined();
  });
  it('rolls back every cleanup write and marker if any v4 record is malformed', async () => {
    const database = db(); const legacy = legacyCalculation('a-legacy', date);
    const broken = { ...createCalculation('z-broken', date, configured()), commercialRoundingStepRub: 1 };
    await database.ownedCalculations.bulkPut([
      { key: ownedKey('A', legacy.id), userId: 'A', calculation: legacy },
      { key: ownedKey('A', broken.id), userId: 'A', calculation: broken as unknown as typeof legacy },
    ]);
    await database.ownedSettings.put({ key: ownedKey('A', 'activeCalculationId'), value: legacy.id });
    const before = await database.ownedCalculations.toArray();
    await expect(transitionCalculatorData(database, 'A')).rejects.toThrow();
    expect(await database.ownedCalculations.toArray()).toEqual(before);
    expect(await database.ownedSettings.get(ownedKey('A', 'calculatorFoundation:v4'))).toBeUndefined();
    expect((await database.ownedSettings.get(ownedKey('A', 'activeCalculationId')))!.value).toBe(legacy.id);
  });
  it('runs after the existing anonymous ownership claim and does not modify its ownership semantics', async () => {
    const database = db(); await database.calculations.put(legacyCalculation('legacy', date));
    await database.settings.put({ key: 'calculatorSettings', value: JSON.stringify(activateCalculatorSettings(createDefaultCalculatorSettings())) });
    await claimAnonymousData(database, 'A');
    const settingsBefore = await database.settings.toArray();
    await transitionCalculatorData(database, 'A');
    expect(await database.settings.toArray()).toEqual(settingsBefore);
    await claimAnonymousData(database, 'B');
    expect(await new ActiveDexieCalculationRepository(database, 'B').list()).toEqual([]);
    expect(await database.calculations.count()).toBe(1);
  });
  it('save and active selection are atomic, owner isolated, and reload preserves v4 snapshots', async () => {
    const database = db(); const a = new ActiveDexieCalculationRepository(database, 'A'); const b = new ActiveDexieCalculationRepository(database, 'B');
    const value = add(createCalculation('same-id', date, configured()), window()); await a.save(value);
    expect(await a.getActiveId()).toBe('same-id'); expect(await a.get('same-id')).toEqual(value);
    expect(await b.get('same-id')).toBeUndefined(); expect(await b.list()).toEqual([]);
    const before = await a.get('same-id'); const invalid = { ...value, commercialRoundingStepRub: 1 };
    await expect(a.save(invalid as Calculation)).rejects.toThrow();
    expect(await a.get('same-id')).toEqual(before);
    const failActivePointer = () => { throw new Error('injected settings write failure'); };
    database.ownedSettings.hook('updating', failActivePointer);
    const changed = updateCalculationDetails(value, { clientName: 'Другое имя' }, date);
    try { await expect(a.save(changed)).rejects.toThrow('injected'); }
    finally { database.ownedSettings.hook('updating').unsubscribe(failActivePointer); }
    expect(await a.get('same-id')).toEqual(before);
    expect(await a.getActiveId()).toBe('same-id');
  });
  it('production uses only vNext entry points and adds no global destructive reset or protected-state writes', () => {
    const paths = ['src/application/estimate/active-calculation.ts', 'src/infrastructure/storage/active-calculation-repository.ts',
      'src/application/settings/active-calculator-settings.ts', 'src/application/estimate/calculator-drafts.ts', 'src/ui/App.tsx'];
    for (const path of paths) {
      const source = readFileSync(path, 'utf8');
      expect(source).not.toMatch(/database\.delete\(|localStorage\.clear\(|indexedDB\.deleteDatabase\(/);
      expect(source).not.toContain("from '../application/estimate/calculation-service'");
    }
    const main = readFileSync('src/main.tsx', 'utf8');
    expect(main).toContain('new ActiveDexieCalculationRepository(database, user.id)');
    expect(main).toContain('new ActiveCalculatorSettingsRepository(calculator)');
    expect(main).toContain('new CloudSettingsSync(user.id, calculatorCache');
  });
});
