import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { expect, it } from 'vitest';
import { createCalculation, saveMeasurement, copyMeasurement, deleteMeasurement, estimateCalculation, updateCalculationDetails } from '../src/application/estimate/calculation-service';
import { estimateWindow } from '../src/application/estimate/estimate-window';
import { estimateFinish } from '../src/application/estimate/estimate-finish';
import { estimateMeasurement } from '../src/application/estimate/estimate-measurement';
import { demoFinishConfiguration } from '../src/domain/configuration/demo-finish-configuration';
import { EstimatorDatabase } from '../src/infrastructure/storage/database';
import { DexieCalculationRepository } from '../src/infrastructure/storage/dexie-calculation-repository';
import { input, configuration } from './fixtures';
import { date } from './order-fixtures';

const later = '2026-09-25T11:00:00.000Z';
const window = estimateWindow(input, configuration);
const finish = estimateFinish({ id: 'finish', room: 'Кухня', name: 'Отделка', widthMm: 1400, heightMm: 1500, depthMm: 250, selections: [{ finishType: 'slope', materialId: 'slope-simple' }] }, demoFinishConfiguration);
function one() { return saveMeasurement(createCalculation('order', date), window, date, 'add'); }
function both() { return saveMeasurement(one(), finish, later, 'add'); }

it('creates one-window Calculation with independent snapshots and no pricing implementation', () => {
  const value = one();
  expect(value.measurements).toEqual([window.measurement]);
  expect(value).toMatchObject({ id: 'order', createdAt: date, updatedAt: date, schemaVersion: 3, orderAdditionalWorks: [] });
  expect(value).not.toHaveProperty('price');
  expect(value.measurements[0]).not.toBe(window.measurement);
  expect(estimateCalculation(value).subtotalMinor).toBe(window.price.totalMinor);
});
it('adds WindowFinish, sums client prices in minor units and preserves first measurement', () => {
  const value = both();
  expect(value.measurements.map((m) => m.kind)).toEqual(['Window', 'WindowFinish']);
  expect(value.measurements[0]).toEqual(window.measurement);
  expect(value.createdAt).toBe(date); expect(value.updatedAt).toBe(later);
  expect(estimateCalculation(value).subtotalMinor).toBe(window.price.totalMinor + finish.price.totalMinor);
});
it('edits the same ID and snapshots only that measurement tariff', () => {
  const value = both();
  const changed = estimateWindow({ ...input, name: 'Edited' }, { ...configuration, profiles: configuration.profiles.map((p) => ({ ...p, basePricePerM2: 12345 })) });
  const result = saveMeasurement(value, changed, later, 'edit');
  expect(result.measurements).toHaveLength(2);
  expect(result.measurements[0]).toMatchObject({ id: input.id, name: 'Edited' });
  expect(result.measurements[1]).toEqual(value.measurements[1]);
  expect(result.configuration.finish).toEqual(value.configuration.finish);
  expect(value.measurements[0]!.name).toBe(input.name);
});
it.each(['Window', 'WindowFinish'])('copies %s with new ID and no shared nested parameters', (kind) => {
  const value = both();
  const original = value.measurements.find((m) => m.kind === kind)!;
  const copy = copyMeasurement(value, original.id, 'copy', later);
  const copied = copy.measurements[2]!;
  expect(copied).toEqual(original.kind === 'Window'
    ? { ...original, id: 'copy', plane: { ...original.plane, id: 'copy:plane' } }
    : { ...original, id: 'copy' });
  expect(copied).not.toBe(original);
  expect(copy.configuration.copy).not.toBe(copy.configuration[original.id]);
  if (copied.kind === 'Window') {
    copied.plane.sections[0]!.widthMm = 42;
    const source = copy.measurements[0]!;
    if (source.kind === 'Window') expect(source.plane.sections[0]!.widthMm).toBe(input.sections[0]!.widthMm);
  } else {
    if (copied.kind !== 'WindowFinish') throw new Error('Expected finish fixture');
    copied.selections[0]!.materialId = 'changed';
    const source = copy.measurements[1]!;
    if (source.kind === 'WindowFinish') expect(source.selections[0]!.materialId).toBe('slope-simple');
  }
  const tariff = copy.configuration.copy!;
  const originalTariff = copy.configuration[original.id]!;
  if (tariff.kind === 'Window' && originalTariff.kind === 'Window') {
    tariff.configuration.profiles[0]!.basePricePerM2 = 1;
    expect(originalTariff.configuration.profiles[0]!.basePricePerM2).toBe(configuration.profiles[0]!.basePricePerM2);
  } else if (tariff.kind === 'WindowFinish' && originalTariff.kind === 'WindowFinish') {
    tariff.configuration.materials[0]!.sizing.purchaseStepMm = 999;
    expect(originalTariff.configuration.materials[0]!.sizing.purchaseStepMm).toBe(0);
  }
});
it('deletes only selected measurement and its snapshot; empty subtotal is zero', () => {
  const result = deleteMeasurement(both(), input.id, later);
  expect(result.measurements).toEqual([finish.measurement]);
  expect(Object.keys(result.configuration)).toEqual(['finish']);
  expect(estimateCalculation(deleteMeasurement(result, 'finish', later)).subtotalMinor).toBe(0);
});
it('keeps client data on Calculation', () => {
  const result = updateCalculationDetails(both(), { clientName: 'Клиент', clientPhone: '123', objectAddress: 'Объект' }, later);
  expect(result.clientName).toBe('Клиент'); expect(result.measurements[0]).not.toHaveProperty('clientName');
});
it('rejects duplicate IDs, missing edit/delete targets and mismatched configuration', () => {
  expect(() => saveMeasurement(one(), window, date, 'add')).toThrow();
  expect(() => saveMeasurement(one(), finish, date, 'edit')).toThrow();
  expect(() => copyMeasurement(one(), input.id, input.id, date)).toThrow();
  expect(() => deleteMeasurement(one(), 'missing', date)).toThrow();
  expect(() => estimateMeasurement(window.measurement, { kind: 'WindowFinish', configuration: demoFinishConfiguration })).toThrow();
  expect(() => estimateCalculation({ ...one(), configuration: {} })).toThrow();
});
it('reloads the entire active Calculation with multiple measurements and keeps other orders', async () => {
  const db = new EstimatorDatabase('whole-order'); const repo = new DexieCalculationRepository(db);
  const value = both();
  try {
    await repo.save(value); await repo.save(createCalculation('another', later));
    await repo.setActiveId(value.id);
    db.close(); await db.open();
    const restored = await repo.get((await repo.getActiveId())!);
    expect(restored).toEqual(value);
    expect(estimateCalculation(restored!).subtotalMinor).toBe(window.price.totalMinor + finish.price.totalMinor);
    expect(await repo.list()).toHaveLength(2);
  } finally { await db.delete(); }
});
it('persists editing and removal while retaining the remaining measurement and client data', async () => {
  const db = new EstimatorDatabase('order-edit-delete'); const repo = new DexieCalculationRepository(db);
  try {
    const original = updateCalculationDetails(both(), { clientName: 'Client' }, later);
    const copied = copyMeasurement(original, input.id, 'copy', later);
    const edited = saveMeasurement(copied, estimateWindow({ ...input, id: 'copy', name: 'Edited copy' }, configuration), later, 'edit');
    const removed = deleteMeasurement(edited, input.id, later);
    await repo.save(removed); db.close(); await db.open();
    const loaded = (await repo.get('order'))!;
    expect(loaded.measurements.map((m) => m.id)).toEqual(['finish', 'copy']);
    expect(loaded.measurements[1]!.name).toBe('Edited copy');
    expect(loaded.clientName).toBe('Client');
    expect(estimateCalculation(loaded).subtotalMinor).toBe(finish.price.totalMinor + window.price.totalMinor);
  } finally { await db.delete(); }
});
it('migrates every v2 single record separately and preserves raw snapshots', async () => {
  const old = new Dexie('v2-orders'); old.version(2).stores({ calculations: 'id' });
  const db = new EstimatorDatabase('v2-orders'); const repo = new DexieCalculationRepository(db);
  try {
    await old.table('calculations').bulkPut([window, finish]); old.close();
    const items = await repo.list();
    expect(items).toHaveLength(2);
    expect(items.map((v) => v.id).sort()).toEqual([window.id, finish.id].sort());
    expect(items.every((v) => v.measurements.length === 1 && v.schemaVersion === 3)).toBe(true);
    expect(await db.table('legacyCalculations').get(window.id)).toEqual(window);
    expect(await db.table('legacyCalculations').get(finish.id)).toEqual(finish);
    expect(await repo.getActiveId()).toBeDefined();
  } finally { old.close(); await db.delete(); }
});
it('rolls back the entire v2 migration on a malformed record without losing valid records', async () => {
  const name = 'v2-broken-orders'; const old = new Dexie(name); old.version(2).stores({ calculations: 'id' });
  const db = new EstimatorDatabase(name);
  const broken = { ...finish, id: 'broken', measurement: { ...finish.measurement, id: 'broken', widthMm: 0 } };
  try {
    await old.table('calculations').bulkPut([window, broken]); old.close();
    await expect(db.open()).rejects.toThrow(); db.close();
    await old.open(); expect(old.verno).toBe(2);
    expect(await old.table('calculations').get(window.id)).toEqual(window);
    expect(await old.table('calculations').get('broken')).toEqual(broken);
  } finally { old.close(); db.close(); await Dexie.delete(name); }
});
