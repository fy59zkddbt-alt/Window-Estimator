import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { estimateBalcony } from '../src/application/estimate/estimate-balcony';
import { balconyDraft, changeBalconyShape, initializePlaneWidth, changePlaneSectionCount, distributePlane, changeBalconyMaterial } from '../src/application/estimate/balcony-editor';
import { createBalcony, equalBalconySections, type BalconyInput } from '../src/domain/measurements/balcony/create-balcony';
import { demoConfiguration as config } from '../src/domain/configuration/demo-configuration';
import { getBalconyGeometry } from '../src/domain/geometry/balcony-geometry';
import { priceGlazing } from '../src/domain/pricing/glazing-pricing';
import { createCalculation, saveMeasurement, copyMeasurement, deleteMeasurement, estimateCalculation, updateOrderAdditionalWorks } from '../src/application/estimate/calculation-service';
import { estimateWindow } from '../src/application/estimate/estimate-window';
import { estimateFinish } from '../src/application/estimate/estimate-finish';
import { demoFinishConfiguration } from '../src/domain/configuration/demo-finish-configuration';
import { EstimatorDatabase } from '../src/infrastructure/storage/database';
import { DexieCalculationRepository } from '../src/infrastructure/storage/dexie-calculation-repository';
import { input as windowInput, configuration as windowConfig } from './fixtures';
import { date } from './order-fixtures';

function input(type: BalconyInput['balconyType'] = 'straight', side?: 'left' | 'right'): BalconyInput {
  const draft = changeBalconyShape(balconyDraft('balcony'), type, side);
  return { ...draft, room: 'Балкон', name: 'Остекление', profileId: 'pvc', planes: draft.planes.map((p, i) => ({ ...p, widthMm: (i + 1) * 1000, heightMm: 2000, sectionCount: 2, sections: equalBalconySections((i + 1) * 1000, 2) })) };
}
it.each([
  ['straight', undefined, ['facade'], 2], ['L', 'left', ['left', 'facade'], 6],
  ['L', 'right', ['facade', 'right'], 6], ['U', undefined, ['left', 'facade', 'right'], 12],
] as const)('%s %s uses real plane areas', (type, side, positions, area) => {
  const result = estimateBalcony(input(type, side), config);
  expect(result.measurement.kind).toBe('Balcony');
  expect(result.geometry.planes.map((p) => p.position)).toEqual(positions);
  expect(result.geometry.totalAreaM2).toBe(area);
  expect(result.geometry.activeAreaM2).toBe(0);
  expect(result.geometry.planes.map((p) => p.totalAreaM2)).toEqual(positions.map((_, i) => 2 * (i + 1)));
});
it.each([1, 2, 3, 4, 5, 6, 7, 8])('supports %s sections with equal initial widths', (count) => {
  const value = input(); const p = value.planes[0]!;
  const result = estimateBalcony({ ...value, planes: [{ ...p, sectionCount: count, sections: equalBalconySections(p.widthMm, count) }] }, config);
  expect(result.geometry.planes[0]!.sections).toHaveLength(count);
  expect(result.geometry.planes[0]!.sections[0]!.widthMm).toBe(1000 / count);
});
it.each([0, 9, 1.5])('rejects invalid section count %s', (count) => {
  expect(() => equalBalconySections(1000, count)).toThrow();
  const value = input();
  expect(() => estimateBalcony({ ...value, planes: [{ ...value.planes[0]!, sectionCount: count }] }, config)).toThrow();
});
it('rejects inconsistent widths without hidden correction; explicit distribution keeps openings', () => {
  const value = input(); const p = value.planes[0]!;
  const changed = initializePlaneWidth(p, 1500);
  expect(changed.sections).toEqual(p.sections);
  expect(() => estimateBalcony({ ...value, planes: [changed] }, config)).toThrow('Сумма ширин');
  const distributed = distributePlane({ ...changed, sections: [{ ...p.sections[0]!, openingType: 'tilt_turn', hingeSide: 'right', hardwareId: 'pvc-standard' }, p.sections[1]!] });
  expect(distributed.sections[0]).toMatchObject({ widthMm: 750, openingType: 'tilt_turn', hingeSide: 'right' });
  expect(estimateBalcony({ ...value, planes: [distributed] }, config).geometry.totalAreaM2).toBe(3);
});
it('PVC upper turn and tilt_turn are active; oneLevel has no lower tier', () => {
  const value = input(); const p = value.planes[0]!;
  const result = estimateBalcony({ ...value, planes: [{ ...p, sections: [
    { id: 'a', widthMm: 300, openingType: 'turn', hingeSide: 'left', hardwareId: 'pvc-standard' },
    { id: 'b', widthMm: 700, openingType: 'tilt_turn', hingeSide: 'right', hardwareId: 'pvc-standard' },
  ] }] }, config);
  expect(result.geometry.activeAreaM2).toBe(2);
  expect(result.geometry.sandwichAreaM2).toBe(0);
  expect(result.geometry.planes[0]!.splitLine).toBeUndefined();
  expect(result.geometry.planes[0]!.sections[1]!.symbols.map((s) => s.kind)).toContain('tilt');
});
it('aluminium sliding is active without hinges/hardware, PVC forbids sliding', () => {
  const value = input(); const p = value.planes[0]!;
  const planes = [{ ...p, sections: [{ id: 'slide', widthMm: 500, openingType: 'sliding' as const }, p.sections[1]!] }];
  const result = estimateBalcony({ ...value, material: 'aluminium', profileId: 'aluminium', planes }, config);
  expect(result.geometry.activeAreaM2).toBe(1);
  expect(result.geometry.planes[0]!.sections[0]!.symbols.map((s) => s.kind)).toEqual(['sliding']);
  expect(() => estimateBalcony({ ...value, planes }, config)).toThrow('PVC');
  expect(() => estimateBalcony({ ...value, material: 'aluminium', profileId: 'aluminium', planes: [{ ...p, sections: [{ id: 'bad', widthMm: 500, openingType: 'turn', hingeSide: 'left', hardwareId: 'pvc-standard' }, p.sections[1]!] }] }, config)).toThrow('Алюминий');
});
it.each(['glass', 'sandwich'] as const)('twoLevel %s inherits unequal widths and excludes lower area from active', (lowerFill) => {
  const value = input(); const p = value.planes[0]!;
  const result = estimateBalcony({ ...value, planes: [{ ...p, widthMm: 1500, levels: { mode: 'twoLevel', splitHeightMm: 800, lowerFill }, sections: [
    { id: 'a', widthMm: 500, openingType: 'tilt_turn', hingeSide: 'left', hardwareId: 'pvc-standard' },
    { id: 'b', widthMm: 1000, openingType: 'fixed' },
  ] }] }, config);
  expect(result.geometry.totalAreaM2).toBe(3);
  expect(result.geometry.activeAreaM2).toBeCloseTo(0.6);
  expect(result.geometry.sandwichAreaM2).toBeCloseTo(lowerFill === 'glass' ? 0 : 1.2);
  const geometry = result.geometry.planes[0]!;
  expect(geometry.splitLine).toEqual([{ xMm: 0, yMm: 1200 }, { xMm: 1500, yMm: 1200 }]);
  expect(geometry.sections.map((s) => [s.xMm, s.yMm, s.widthMm, s.heightMm])).toEqual([[0, 0, 500, 1200], [500, 0, 1000, 1200], [0, 1200, 500, 800], [500, 1200, 1000, 800]]);
  expect(geometry.sections.slice(2).every((s) => s.openingType === 'fixed' && s.symbols.length === 0)).toBe(true);
});
it.each([0, -1, 2000, 2001, Infinity, NaN])('rejects split height %s', (splitHeightMm) => {
  const value = input();
  expect(() => estimateBalcony({ ...value, planes: [{ ...value.planes[0]!, levels: { mode: 'twoLevel', splitHeightMm, lowerFill: 'glass' } }] }, config)).toThrow();
});
it('uses the existing glazing engine for either material; sandwich has no correction', () => {
  for (const material of ['pvc', 'aluminium'] as const) {
    const value = input(); const p = value.planes[0]!;
    const result = estimateBalcony({ ...value, material, profileId: material, lamination: 'two_sides', planes: [{ ...p, levels: { mode: 'twoLevel', splitHeightMm: 800, lowerFill: 'sandwich' } }] }, config);
    const product = priceGlazing(result.geometry, config.profiles.find((p) => p.id === material)!, 'two_sides');
    expect(result.price).toEqual({ ...product, productPriceMinor: product.totalMinor, installationPriceMinor: 0 });
    expect(result.basePriceMinor).toBe(2760000);
  }
});
it('rejects invalid layout, IDs, incompatible hardware, and numeric overflow', () => {
  expect(() => input('L')).toThrow();
  const value = input('U');
  expect(() => createBalcony({ ...value, planes: value.planes.slice(1) })).toThrow();
  expect(() => createBalcony({ ...value, planes: [value.planes[0]!, value.planes[0]!, value.planes[2]!] })).toThrow();
  expect(() => estimateBalcony({ ...input(), profileId: 'aluminium' }, config)).toThrow('профиль');
  const p = input().planes[0]!;
  expect(() => estimateBalcony({ ...input(), planes: [{ ...p, sections: [{ id: 'a', widthMm: 500, openingType: 'turn', hingeSide: 'left', hardwareId: 'aluminium-standard' }, p.sections[1]!] }] }, config)).toThrow('фурнитуру');
  expect(() => getBalconyGeometry(createBalcony({ ...input(), planes: [{ ...p, widthMm: 1e308, heightMm: 1e308, sections: equalBalconySections(1e308, 2) }] }))).toThrow();
});
it('editor creates blank planes, initial equal sections, and explicitly resets on count/material change', () => {
  const draft = balconyDraft('draft');
  expect(draft.planes[0]!.widthMm).toBeNaN();
  const plane = initializePlaneWidth(draft.planes[0]!, 1400);
  expect(plane.sections[0]!.widthMm).toBe(1400);
  expect(changePlaneSectionCount(plane, 2).sections.map((s) => s.widthMm)).toEqual([700, 700]);
  expect(changeBalconyShape(input(), 'U').planes[1]).toEqual(input().planes[0]);
  expect(changeBalconyMaterial(input(), 'aluminium').profileId).toBe('');
});
it('mixed Calculation, works, independent copy/edit/delete and IndexedDB reopen', async () => {
  const balcony = estimateBalcony({ ...input('U'), additionalWorks: [{ id: 'lift', name: 'Подъём', priceMinor: 12345 }] }, config);
  const window = estimateWindow(windowInput, windowConfig);
  const finish = estimateFinish({ id: 'finish', name: 'Отделка', room: 'Кухня', widthMm: 1400, heightMm: 1500, depthMm: 250, selections: [{ finishType: 'slope', materialId: 'slope-simple' }] }, demoFinishConfiguration);
  let calc = createCalculation('mixed-balcony', date);
  for (const result of [balcony, window, finish]) calc = saveMeasurement(calc, result, date, 'add');
  calc = updateOrderAdditionalWorks(calc, [{ id: 'delivery', name: 'Доставка', priceMinor: 50000 }], date);
  expect(estimateCalculation(calc).subtotalMinor).toBe(balcony.basePriceMinor + 12345 + window.measurementTotalMinor + finish.measurementTotalMinor + 50000);
  const copied = copyMeasurement(calc, balcony.id, 'copy-balcony', date);
  const clone = copied.measurements[3]!;
  if (clone.kind !== 'Balcony') throw new Error('Expected balcony');
  expect(clone.additionalWorks[0]!.id).not.toBe(balcony.measurement.additionalWorks[0]!.id);
  clone.planes[0]!.heightMm = 2500;
  clone.additionalWorks[0]!.priceMinor = 100;
  const edited = saveMeasurement(copied, estimateBalcony(clone, config), date, 'edit');
  expect(balcony.measurement.planes[0]!.heightMm).toBe(2000);
  expect(copied.measurements[0]).toEqual(balcony.measurement);
  expect(deleteMeasurement(edited, balcony.id, date).orderAdditionalWorks).toEqual(calc.orderAdditionalWorks);
  const db = new EstimatorDatabase('balcony-reopen'); const repo = new DexieCalculationRepository(db);
  try {
    await repo.save(edited); db.close(); await db.open();
    const restored = (await repo.get(edited.id))!;
    expect(restored).toEqual(edited);
    expect(estimateCalculation(restored)).toEqual(estimateCalculation(edited));
    expect(db.verno).toBe(3);
  } finally { await db.delete(); }
});
