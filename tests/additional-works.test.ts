import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { estimateWindow } from '../src/application/estimate/estimate-window';
import { estimateFinish } from '../src/application/estimate/estimate-finish';
import { createCalculation, saveMeasurement, estimateCalculation, copyMeasurement, deleteMeasurement, updateOrderAdditionalWorks } from '../src/application/estimate/calculation-service';
import { additionalWorksTotal, sumMinor } from '../src/application/estimate/additional-works';
import { createEditorState, changeWindowType } from '../src/application/estimate/window-editor';
import { EstimatorDatabase } from '../src/infrastructure/storage/database';
import { DexieCalculationRepository } from '../src/infrastructure/storage/dexie-calculation-repository';
import { demoFinishConfiguration } from '../src/domain/configuration/demo-finish-configuration';
import { input, configuration } from './fixtures';
import { date } from './order-fixtures';

const work = { id: 'dismantle', name: 'Демонтаж', priceMinor: 120050 };
const work2 = { id: 'seal', name: 'СТИЗ', priceMinor: 30000 };
const orderWork = { id: 'delivery', name: 'Доставка', priceMinor: 250000 };
const base = estimateWindow(input, configuration);
const window = estimateWindow({ ...input, additionalWorks: [work, work2] }, configuration);
const finish = estimateFinish({ id: 'finish', room: 'Кухня', name: 'Отделка', widthMm: 1400, heightMm: 1500, depthMm: 250,
  selections: [{ finishType: 'slope', materialId: 'slope-simple' }], additionalWorks: [work] }, demoFinishConfiguration);
function calculation() {
  const first = saveMeasurement(createCalculation('works-order', date), window, date, 'add');
  return updateOrderAdditionalWorks(saveMeasurement(first, finish, date, 'add'), [orderWork], date);
}

it('defaults missing measurement works to an empty list with unchanged price', () => {
  expect(base.measurement.additionalWorks).toEqual([]);
  expect(base.basePriceMinor).toBe(base.price.totalMinor);
  expect(base.additionalWorksTotalMinor).toBe(0);
  expect(base.measurementTotalMinor).toBe(base.price.totalMinor);
});
it('adds one and multiple works only at application level', () => {
  const single = estimateWindow({ ...input, additionalWorks: [work] }, configuration);
  expect(single.measurementTotalMinor).toBe(base.price.totalMinor + work.priceMinor);
  expect(window.measurementTotalMinor).toBe(base.price.totalMinor + 150050);
  expect(window.price).toEqual(base.price);
  expect(window.additionalWorksTotalMinor).toBe(150050);
  expect(finish.additionalWorksTotalMinor).toBe(120050);
  expect(finish.measurementTotalMinor).toBe(finish.price.totalMinor + 120050);
});
it('totals multiple measurements plus order work, without applying any markup to works', () => {
  const estimate = estimateCalculation(calculation());
  expect(estimate.measurementsSubtotalMinor).toBe(window.measurementTotalMinor + finish.measurementTotalMinor);
  expect(estimate.orderWorksTotalMinor).toBe(250000);
  expect(estimate.subtotalMinor).toBe(estimate.measurementsSubtotalMinor + 250000);
  expect(estimate.lines[0]!.totalMinor).toBe(window.measurementTotalMinor);
});
it.each([input.id, 'finish'])('copies %s works with fresh IDs and independent objects', (id) => {
  const source = calculation();
  const result = copyMeasurement(source, id, 'copy', date);
  const original = result.measurements.find((m) => m.id === id)!;
  const copied = result.measurements[2]!;
  expect(copied.additionalWorks.map((w) => w.id)).not.toEqual(original.additionalWorks.map((w) => w.id));
  expect(copied.additionalWorks.map(({ name, priceMinor }) => ({ name, priceMinor }))).toEqual(original.additionalWorks.map(({ name, priceMinor }) => ({ name, priceMinor })));
  copied.additionalWorks[0]!.priceMinor = 1;
  copied.additionalWorks[0]!.name = 'Changed';
  expect(original.additionalWorks[0]).toEqual(work);
  expect(source.measurements.find((m) => m.id === id)!.additionalWorks[0]).toEqual(work);
  expect(result.orderAdditionalWorks).toEqual([orderWork]);
});
it('deletes measurement and its works, preserving order works and remaining measurement', () => {
  const result = deleteMeasurement(calculation(), input.id, date);
  expect(result.measurements).toEqual([finish.measurement]);
  expect(result.orderAdditionalWorks).toEqual([orderWork]);
  expect(estimateCalculation(result).subtotalMinor).toBe(finish.measurementTotalMinor + orderWork.priceMinor);
});
it('edits and removes order works independently of measurements', () => {
  const source = calculation();
  const changed = updateOrderAdditionalWorks(source, [{ ...orderWork, priceMinor: 100 }], date);
  expect(changed.measurements).toEqual(source.measurements);
  expect(estimateCalculation(changed).orderWorksTotalMinor).toBe(100);
  expect(updateOrderAdditionalWorks(changed, [], date).orderAdditionalWorks).toEqual([]);
  expect(source.orderAdditionalWorks).toEqual([orderWork]);
});
it('keeps works when switching rectangular window and balcony-block drafts', () => {
  const initial = createEditorState({ ...input, additionalWorks: [work] });
  const block = changeWindowType(initial, 'balconyBlock');
  expect(block.input.additionalWorks).toEqual([work]);
  expect(changeWindowType(block, 'single').input.additionalWorks).toEqual([work]);
});
it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid price %s', (priceMinor) => {
  expect(() => additionalWorksTotal([{ ...work, priceMinor }])).toThrow();
});
it('rejects empty names, duplicate IDs and sum overflow, while allowing zero', () => {
  expect(() => additionalWorksTotal([{ ...work, name: ' ' }])).toThrow();
  expect(() => additionalWorksTotal([work, work])).toThrow();
  expect(() => sumMinor([Number.MAX_SAFE_INTEGER, 1])).toThrow();
  expect(() => estimateWindow({ ...input, additionalWorks: [{ ...work, priceMinor: Number.MAX_SAFE_INTEGER }] }, configuration)).toThrow();
  expect(additionalWorksTotal([{ ...work, priceMinor: 0 }])).toBe(0);
});
it('saves and reloads both levels and edited copied works in IndexedDB v3', async () => {
  const db = new EstimatorDatabase('works-save-load'); const repo = new DexieCalculationRepository(db);
  try {
    const result = copyMeasurement(calculation(), input.id, 'copy', date);
    result.measurements[2]!.additionalWorks[0]!.priceMinor = 123;
    await repo.save(result); db.close(); await db.open();
    const loaded = (await repo.get(result.id))!;
    expect(loaded).toEqual(result);
    expect(loaded.measurements[0]!.additionalWorks[0]!.priceMinor).toBe(work.priceMinor);
    expect(loaded.measurements[2]!.additionalWorks[0]!.priceMinor).toBe(123);
    expect(estimateCalculation(loaded).subtotalMinor).toBe(estimateCalculation(result).subtotalMinor);
    expect(db.verno).toBe(3);
  } finally { await db.delete(); }
});
it('loads legacy v3 records with missing works as empty arrays without rewriting the record', async () => {
  const db = new EstimatorDatabase('works-old-v3'); const repo = new DexieCalculationRepository(db);
  const source = calculation();
  const { orderAdditionalWorks: _orderWorks, ...rest } = source;
  const old = { ...rest, measurements: source.measurements.map(({ additionalWorks: _works, ...m }) => m) };
  try {
    await db.table('calculations').put(old); db.close(); await db.open();
    const loaded = (await repo.get(old.id))!;
    expect(loaded.orderAdditionalWorks).toEqual([]);
    expect(loaded.measurements.map((m) => m.additionalWorks)).toEqual([[], []]);
    expect(estimateCalculation(loaded).subtotalMinor).toBe(window.price.totalMinor + finish.price.totalMinor);
    expect(await db.table('calculations').get(old.id)).toEqual(old);
    await repo.save(loaded);
    expect(await repo.get(old.id)).toEqual(loaded);
  } finally { await db.delete(); }
});
