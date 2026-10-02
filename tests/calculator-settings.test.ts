import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { expect, it } from 'vitest';
import { createDefaultCalculatorSettings, createSettingsSnapshot, validateCalculatorSettings } from '../src/application/settings/calculator-settings';
import { normalizeFinishMaterial } from '../src/domain/configuration/normalize-finish';
import { EstimatorDatabase } from '../src/infrastructure/storage/database';
import { DexieCalculatorSettingsRepository } from '../src/infrastructure/storage/dexie-calculator-settings-repository';
import { DexieCalculationRepository } from '../src/infrastructure/storage/dexie-calculation-repository';
import { estimateWindow } from '../src/application/estimate/estimate-window';
import { estimateFinish } from '../src/application/estimate/estimate-finish';
import { estimateBalcony } from '../src/application/estimate/estimate-balcony';
import { balconyDraft, initializePlaneWidth } from '../src/application/estimate/balcony-editor';
import { estimateCalculation, copyMeasurement } from '../src/application/estimate/calculation-service';
import { input } from './fixtures';
import { pack, date } from './order-fixtures';

it('returns independent valid defaults and normalizes both finish pricing modes', () => {
  const settings = createDefaultCalculatorSettings();
  validateCalculatorSettings(settings);
  expect(settings.glazing.profiles.map((p) => p.material)).toEqual(['pvc', 'aluminium']);
  expect(settings.glazing.profiles.every((p) => p.installationRatePerM2 === 0)).toBe(true);
  const simple = normalizeFinishMaterial(settings.finish.materials[0]!);
  const advanced = normalizeFinishMaterial(settings.finish.materials[2]!);
  expect(simple.purchasePricePerM).toBe(600);
  expect(simple.materialMarkupPercent).toBe(0);
  expect(advanced.purchasePricePerM).toBe(500);
  expect(advanced.materialMarkupPercent).toBe(20);
  settings.glazing.profiles[0]!.basePricePerM2 = 99;
  settings.finish.materials[2]!.sizing.purchaseStepMm = 99;
  expect(createDefaultCalculatorSettings().glazing.profiles[0]!.basePricePerM2).toBe(10000);
  expect(createDefaultCalculatorSettings().finish.materials[2]!.sizing.purchaseStepMm).toBe(500);
});

it.each([-1, NaN, Infinity])('rejects invalid rates, percentages and sizing: %s', (invalid) => {
  for (const key of ['basePricePerM2', 'activityPercent', 'laminateOneSidePercent', 'laminateTwoSidesPercent', 'productMarkupPercent', 'installationRatePerM2'] as const) {
    const settings = createDefaultCalculatorSettings();
    settings.glazing.profiles[0]![key] = invalid;
    expect(() => validateCalculatorSettings(settings)).toThrow();
  }
  for (const key of ['purchaseStepMm', 'lengthAllowancePerPieceMm', 'depthAllowanceMm'] as const) {
    const settings = createDefaultCalculatorSettings();
    settings.finish.materials[0]!.sizing[key] = invalid;
    expect(() => validateCalculatorSettings(settings)).toThrow();
  }
});

it('allows zero rates and percentages above 100, rejects empty/duplicate identities and missing categories', () => {
  const s = createDefaultCalculatorSettings();
  s.glazing.profiles[0]!.activityPercent = 150;
  s.glazing.profiles[0]!.basePricePerM2 = 0;
  expect(() => validateCalculatorSettings(s)).not.toThrow();
  expect(() => validateCalculatorSettings({ ...s, glazing: { ...s.glazing, profiles: [s.glazing.profiles[0]!] } })).toThrow();
  expect(() => validateCalculatorSettings({ ...s, finish: { ...s.finish, materials: s.finish.materials.filter((m) => m.finishType === 'slope') } })).toThrow();
  expect(() => validateCalculatorSettings({ ...s, glazing: { ...s.glazing, profiles: [...s.glazing.profiles, s.glazing.profiles[0]!] } })).toThrow();
  s.finish.materials[0]!.name = ' ';
  expect(() => validateCalculatorSettings(s)).toThrow();
  s.finish.materials[0]!.name = 'Valid';
  s.glazing.profiles[0]!.id = '';
  expect(() => validateCalculatorSettings(s)).toThrow();
});

it('persists settings, preserves active calculation and supports explicit restore defaults', async () => {
  const db = new EstimatorDatabase('calculator-settings-roundtrip');
  const repository = new DexieCalculatorSettingsRepository(db);
  try {
    expect(await repository.load()).toEqual(createDefaultCalculatorSettings());
    expect(await db.settings.count()).toBe(0);
    await db.settings.put({ key: 'activeCalculationId', value: 'existing' });
    const settings = await repository.load();
    settings.glazing.profiles[0]!.name = 'Мой профиль';
    settings.glazing.profiles[0]!.basePricePerM2 = 24000;
    settings.glazing.profiles[0]!.installationRatePerM2 = 750;
    await repository.save(settings);
    db.close(); await db.open();
    expect(await repository.load()).toEqual(settings);
    expect((await db.settings.get('activeCalculationId'))?.value).toBe('existing');
    await repository.save(createDefaultCalculatorSettings());
    expect(await repository.load()).toEqual(createDefaultCalculatorSettings());
  } finally { await db.delete(); }
});

it('keeps saved window snapshots after rates change or their profile is removed; new windows use current rates', async () => {
  const db = new EstimatorDatabase('calculator-settings-snapshots');
  const settingsRepo = new DexieCalculatorSettingsRepository(db);
  const calculations = new DexieCalculationRepository(db);
  try {
    const settings = await settingsRepo.load();
    const snapshot = createSettingsSnapshot(settings);
    const old = estimateWindow(input, snapshot.glazing);
    await calculations.save(pack(old));
    settings.glazing.profiles[0]!.basePricePerM2 = 20000;
    settings.glazing.profiles[0]!.id = 'new-pvc';
    await settingsRepo.save(settings);
    const next = createSettingsSnapshot(await settingsRepo.load());
    expect(estimateWindow({ ...input, profileId: 'new-pvc' }, next.glazing).price.totalMinor).toBe(old.price.totalMinor * 2);
    const loaded = (await calculations.get(old.id))!;
    expect(estimateCalculation(loaded).subtotalMinor).toBe(old.price.totalMinor);
    const copied = copyMeasurement(loaded, old.id, 'copy', date);
    expect(estimateCalculation(copied).subtotalMinor).toBe(old.price.totalMinor * 2);
    expect(estimateWindow({ ...input, widthMm: 2000, sections: [{ ...input.sections[0]!, widthMm: 2000 }] }, old.configuration).price.totalMinor).toBe(old.price.totalMinor * 2);
    expect(snapshot.glazing.profiles[0]!.id).toBe('pvc');
    expect(snapshot.glazing.profiles[0]!.basePricePerM2).toBe(10000);
  } finally { await db.delete(); }
});

it('captures independent finish and balcony snapshots for old and new measurements', () => {
  const settings = createDefaultCalculatorSettings();
  const snapshot = createSettingsSnapshot(settings);
  const finishInput = { id: 'finish', room: 'Комната', name: 'Отделка', widthMm: 1400, heightMm: 1500, depthMm: 250,
    selections: [{ finishType: 'slope' as const, materialId: 'slope-simple' }] };
  const oldFinish = estimateFinish(finishInput, snapshot.finish);
  const draft = balconyDraft('balcony');
  const balconyInput = { ...draft, room: 'Балкон', name: 'Балкон', profileId: 'pvc', planes: [{ ...initializePlaneWidth(draft.planes[0]!, 1000), heightMm: 2000 }] };
  const oldBalcony = estimateBalcony(balconyInput, snapshot.glazing);
  settings.finish.materials[0]!.pricing = { mode: 'simple', materialSellingPricePerM: 1200, workRatePerM: 800 };
  settings.glazing.profiles[0]!.basePricePerM2 = 20000;
  const next = createSettingsSnapshot(settings);
  expect(estimateFinish(finishInput, next.finish).price.totalMinor).toBe(oldFinish.price.totalMinor * 2);
  expect(estimateBalcony(balconyInput, next.glazing).price.totalMinor).toBe(oldBalcony.price.totalMinor * 2);
  expect(estimateFinish(finishInput, oldFinish.configuration).price).toEqual(oldFinish.price);
  expect(estimateBalcony(balconyInput, oldBalcony.configuration).price).toEqual(oldBalcony.price);
  const originalBand = snapshot.finish.materials[2]!.pricing.depthBands![0]!;
  settings.finish.materials[2]!.pricing.depthBands![0]!.maxDepthMm = 999;
  expect(originalBand.maxDepthMm).toBe(300);
});

it('opens an existing v3 store without settings and does not rewrite calculation snapshots', async () => {
  const name = 'calculator-settings-legacy-v3';
  const old = new Dexie(name);
  old.version(3).stores({ calculations: 'id,updatedAt', settings: 'key', legacyCalculations: 'id' });
  const record = pack(estimateWindow(input, createDefaultCalculatorSettings().glazing));
  await old.table('calculations').put(record);
  await old.table('settings').put({ key: 'activeCalculationId', value: record.id });
  old.close();
  const db = new EstimatorDatabase(name);
  try {
    expect(await new DexieCalculatorSettingsRepository(db).load()).toEqual(createDefaultCalculatorSettings());
    expect(await db.calculations.get(record.id)).toEqual(record);
    expect(db.verno).toBe(4);
  } finally { await db.delete(); }
});

it('rejects corrupt stored settings and invalid saves without replacing the last valid record', async () => {
  const db = new EstimatorDatabase('calculator-settings-invalid');
  const repository = new DexieCalculatorSettingsRepository(db);
  try {
    const settings = createDefaultCalculatorSettings();
    await repository.save(settings);
    settings.glazing.profiles[0]!.basePricePerM2 = NaN;
    await expect(repository.save(settings)).rejects.toThrow();
    expect(await repository.load()).toEqual(createDefaultCalculatorSettings());
    for (const value of ['{bad', 'null', '{"schemaVersion":999}']) {
      await db.settings.put({ key: 'calculatorSettings', value });
      await expect(repository.load()).rejects.toThrow('повреждены');
      expect((await db.settings.get('calculatorSettings'))?.value).toBe(value);
    }
  } finally { await db.delete(); }
});
