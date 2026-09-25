import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { estimateFinish, type WindowFinishInput } from '../src/application/estimate/estimate-finish';
import { isFinishCalculation } from '../src/application/estimate/calculation-repository';
import { demoFinishConfiguration as config } from '../src/domain/configuration/demo-finish-configuration';
import { normalizeFinishMaterial } from '../src/domain/configuration/normalize-finish';
import type { FinishMaterialConfiguration, FinishType } from '../src/domain/configuration/finish-types';
import { roundPurchaseLength } from '../src/domain/geometry/finish-geometry';
import { EstimatorDatabase } from '../src/infrastructure/storage/database';
import { DexieCalculationRepository } from '../src/infrastructure/storage/dexie-calculation-repository';
import { estimateWindow } from '../src/application/estimate/estimate-window';
import { blockInput, configuration } from './fixtures';

const input: WindowFinishInput = { id: 'finish', room: 'Кухня', name: 'Отделка', widthMm: 1400, heightMm: 1500, depthMm: 250,
  selections: [{ finishType: 'slope', materialId: 'slope-simple' }, { finishType: 'sill', materialId: 'sill-simple' }] };
const simple = config.materials[0]!;
const advanced = config.materials[2]!;
function calculate(material: FinishMaterialConfiguration, patch: Partial<WindowFinishInput> = {}) {
  return estimateFinish({ ...input, selections: [{ finishType: material.finishType, materialId: material.id }], ...patch }, { currency: 'RUB', materials: [material] });
}

describe('finish geometry and pricing', () => {
  it('purchases each slope separately: 1400/2100/2100 with step 250 requires 6000 mm', () => {
    const material = { ...advanced, sizing: { ...advanced.sizing, lengthAllowancePerPieceMm: 0, purchaseStepMm: 250 } };
    const result = calculate(material, { widthMm: 1400, heightMm: 2100 });
    const quantity = result.geometry.materials[0]!;
    expect(quantity.pieces.map((piece) => [piece.part, piece.purchaseLengthMm])).toEqual([
      ['top', 1500], ['left', 2250], ['right', 2250],
    ]);
    expect(quantity.purchaseLengthMm).toBe(6000);
    expect(quantity.actualInstalledLengthM).toBe(5.6);
    expect(result.price).toMatchObject({ materialPurchaseCost: 3000, materialSellingPrice: 3600, workPrice: 2240, totalMinor: 584000 });
  });
  it('applies allowance before each rounding without pooling leftovers', () => {
    const material = { ...simple, sizing: { ...simple.sizing, lengthAllowancePerPieceMm: 10, purchaseStepMm: 250 } };
    const quantity = calculate(material, { widthMm: 1500, heightMm: 1500 }).geometry.materials[0]!;
    expect(quantity.pieces.map((piece) => piece.purchaseLengthMm)).toEqual([1750, 1750, 1750]);
    expect(quantity.purchaseLengthMm).toBe(5250);
    expect(quantity.actualInstalledLengthM).toBe(4.5);
  });
  it('purchases the sill as one independent piece', () => {
    const material = { ...config.materials[1]!, sizing: { ...simple.sizing, lengthAllowancePerPieceMm: 100, purchaseStepMm: 250 } };
    const quantity = calculate(material).geometry.materials[0]!;
    expect(quantity.pieces).toHaveLength(1);
    expect(quantity.pieces[0]).toMatchObject({ part: 'sill', installedLengthMm: 1400, requiredLengthMm: 1500, purchaseLengthMm: 1500 });
    expect(quantity.purchaseLengthMm).toBe(1500);
  });
  it('keeps each exact required length when purchase step is zero', () => {
    const material = { ...simple, sizing: { ...simple.sizing, lengthAllowancePerPieceMm: 10 } };
    const quantity = calculate(material, { widthMm: 1400, heightMm: 2100 }).geometry.materials[0]!;
    expect(quantity.pieces.map((piece) => piece.purchaseLengthMm)).toEqual([1410, 2110, 2110]);
    expect(quantity.purchaseLengthMm).toBe(5630);
  });
  it.each([
    { types: ['slope'], slopes: 4.4, sill: 0, total: 440000 },
    { types: ['sill'], slopes: 0, sill: 1.4, total: 238000 },
    { types: ['slope', 'sill'], slopes: 4.4, sill: 1.4, total: 678000 },
  ])('calculates $types', ({ types, slopes, sill, total }) => {
    const result = estimateFinish({ ...input, selections: input.selections.filter((s) => types.includes(s.finishType)) }, config);
    expect(result.geometry.slopeLengthM).toBe(slopes);
    expect(result.geometry.sillLengthM).toBe(sill);
    expect(result.price.totalMinor).toBe(total);
  });
  it('returns three actual slope pieces and their required material dimensions', () => {
    const quantity = calculate(advanced).geometry.materials[0]!;
    expect(quantity.pieces.map((p) => [p.part, p.installedLengthMm, p.requiredLengthMm, p.requiredDepthMm])).toEqual([
      ['top', 1400, 1420, 260], ['left', 1500, 1520, 260], ['right', 1500, 1520, 260],
    ]);
    expect(quantity.pieces.map((piece) => piece.purchaseLengthMm)).toEqual([1500, 2000, 2000]);
    expect(quantity).toMatchObject({ actualInstalledLengthM: 4.4, requiredLengthMm: 4460, purchaseLengthMm: 5500 });
    expect(quantity.requiredAreaM2).toBeCloseTo(4.46 * 0.26);
  });
  it.each([[1401, 500, 1500], [1500, 500, 1500], [1401, 0, 1401], [0.1 + 0.2, 0.1, 0.3]])('rounds %s by %s', (length, step, expected) => {
    expect(roundPurchaseLength(length!, step!)).toBeCloseTo(expected!);
  });
  it('marks up purchased material while charging actual installed work without markup', () => {
    expect(calculate(advanced).price).toMatchObject({ materialPurchaseCost: 2750, materialMarkupAmount: 550, materialSellingPrice: 3300, totalMinor: 506000 });
    expect(calculate(advanced).price.workPrice).toBeCloseTo(1760);
    const changed = calculate({ ...advanced, pricing: { mode: 'advanced', materialPurchasePricePerM: 500, materialMarkupPercent: 100, workRatePerM: 400 } });
    expect(changed.price.materialSellingPrice).toBe(5500);
    expect(changed.price.workPrice).toBeCloseTo(1760);
    const biggerStep = calculate({ ...advanced, sizing: { ...advanced.sizing, purchaseStepMm: 6000 } });
    expect(biggerStep.price.workPrice).toBeCloseTo(1760);
    expect(biggerStep.price.materialPurchaseCost).toBe(9000);
  });
  it('selects inclusive depth bands by material depth including allowance', () => {
    expect(calculate(advanced, { depthMm: 290 }).price.lines[0]!.appliedPurchasePricePerM).toBe(500);
    expect(calculate(advanced, { depthMm: 291 }).price.lines[0]!.appliedPurchasePricePerM).toBe(800);
    expect(() => calculate(advanced, { depthMm: 591 })).toThrow();
  });
  it('normalizes equivalent Simple and Advanced to identical engine inputs and results', () => {
    const equivalent: FinishMaterialConfiguration = { ...simple, pricing: { mode: 'advanced', materialPurchasePricePerM: 600, materialMarkupPercent: 0, workRatePerM: 400 } };
    expect(normalizeFinishMaterial(simple)).toEqual(normalizeFinishMaterial(equivalent));
    expect(normalizeFinishMaterial(simple)).not.toHaveProperty('mode');
    expect(calculate(simple).price).toEqual(calculate(equivalent).price);
    const markedUp = { ...equivalent, pricing: { mode: 'advanced' as const, materialPurchasePricePerM: 500, materialMarkupPercent: 20, workRatePerM: 400 } };
    expect(calculate(markedUp).price.totalMinor).toBe(calculate(simple).price.totalMinor);
  });
  it('normalizes Simple depth coefficients and ranges into purchase rates with zero markup', () => {
    const material: FinishMaterialConfiguration = { ...simple, pricing: { mode: 'simple', materialSellingPricePerM: 600, workRatePerM: 400, depthCoefficient: 2, depthBands: [{ maxDepthMm: 300, coefficient: 1.5 }] } };
    expect(normalizeFinishMaterial(material)).toMatchObject({ purchasePricePerM: 1200, materialMarkupPercent: 0, depthBands: [{ maxDepthMm: 300, purchasePricePerM: 1800 }] });
    expect(calculate(material).price.materialSellingPrice).toBeCloseTo(7920);
  });
  it.each([0, -1, NaN, Infinity])('rejects invalid dimensions %s', (value) => {
    for (const key of ['widthMm', 'heightMm', 'depthMm'] as const) expect(() => calculate(simple, { [key]: value })).toThrow();
  });
  it('rejects missing, duplicate and mismatched selections', () => {
    expect(() => estimateFinish({ ...input, selections: [] }, config)).toThrow();
    expect(() => estimateFinish({ ...input, selections: [input.selections[0]!, input.selections[0]!] }, config)).toThrow();
    expect(() => calculate(simple, { selections: [{ finishType: 'sill', materialId: simple.id }] })).toThrow();
    expect(() => calculate(simple, { selections: [{ finishType: 'slope', materialId: 'missing' }] })).toThrow();
  });
  it.each(['lengthAllowancePerPieceMm', 'depthAllowanceMm', 'purchaseStepMm'] as const)('rejects negative %s', (key) => {
    expect(() => calculate({ ...simple, sizing: { ...simple.sizing, [key]: -1 } })).toThrow();
  });
  it('rejects invalid rates, unordered bands and numeric overflow', () => {
    expect(() => calculate({ ...simple, pricing: { mode: 'simple', materialSellingPricePerM: -1, workRatePerM: 400 } })).toThrow();
    expect(() => calculate({ ...simple, pricing: { mode: 'advanced', materialPurchasePricePerM: 1, materialMarkupPercent: 0, workRatePerM: NaN } })).toThrow();
    expect(() => calculate({ ...simple, pricing: { mode: 'simple', materialSellingPricePerM: 1, workRatePerM: 0, depthBands: [{ maxDepthMm: 300, coefficient: 1 }, { maxDepthMm: 200, coefficient: 1 }] } })).toThrow();
    expect(() => calculate(simple, { widthMm: Number.MAX_VALUE })).toThrow();
    expect(() => calculate({ ...simple, pricing: { mode: 'simple', materialSellingPricePerM: Number.MAX_SAFE_INTEGER, workRatePerM: 0 } })).toThrow();
  });
  it('keeps independent configuration and measurement snapshots', () => {
    const mutableInput = structuredClone(input);
    const mutableConfig = structuredClone(config);
    const result = estimateFinish(mutableInput, mutableConfig);
    mutableInput.room = 'Changed';
    mutableConfig.materials[0]!.sizing.purchaseStepMm = 10000;
    expect(result.measurement.room).toBe('Кухня');
    expect(result.configuration.materials[0]!.sizing.purchaseStepMm).toBe(0);
    expect(result.normalizedMaterials[0]!.sizing.purchaseStepMm).toBe(0);
  });
});

it.each(['simple', 'advanced'] as const)('persists %s finishing alongside a balcony block across reopen', async (mode) => {
  const db = new EstimatorDatabase(`finish-storage-${mode}`);
  const repository = new DexieCalculationRepository(db);
  const selections = (['slope', 'sill'] as FinishType[]).map((finishType) => ({ finishType, materialId: `${finishType}-${mode}` }));
  const result = estimateFinish({ ...input, selections }, config);
  const block = estimateWindow(blockInput, configuration);
  try {
    await repository.save(block);
    await repository.save(result);
    db.close();
    await db.open();
    const loaded = await repository.get(result.id);
    expect(loaded).toEqual(result);
    if (!loaded || !isFinishCalculation(loaded)) throw new Error('Expected finish');
    expect(estimateFinish(loaded.measurement, loaded.configuration)).toEqual(result);
    expect(await repository.get(block.id)).toEqual(block);
    expect(await db.calculations.count()).toBe(2);
  } finally { await db.delete(); }
});

it('loads a legacy finish snapshot, recalculates per piece and drops obsolete sizing on resave', async () => {
  const db = new EstimatorDatabase('finish-legacy-sizing');
  const repository = new DexieCalculationRepository(db);
  const current = calculate(advanced);
  // Historical input only: the removed parameter is not part of current configuration.
  const legacy = { ...current,
    configuration: { ...current.configuration, materials: current.configuration.materials.map((material) => ({
      ...material, sizing: { ...material.sizing, wastePercent: 5 },
    })) },
    geometry: { ...current.geometry, materials: current.geometry.materials.map((material) => ({
      ...material, purchaseLengthMm: 5000, purchaseLengthM: 5,
      pieces: material.pieces.map(({ purchaseLengthMm: _purchase, ...piece }) => piece),
    })) },
    price: { ...current.price, totalMinor: 476000 },
  };
  try {
    await db.table('calculations').put(legacy);
    db.close();
    await db.open();
    const loaded = await repository.get(current.id);
    if (!loaded || !isFinishCalculation(loaded)) throw new Error('Expected stored finish');
    const restored = estimateFinish(loaded.measurement, loaded.configuration);
    expect(restored).toEqual(current);
    expect(restored.price.totalMinor).toBe(506000);
    expect(restored.price.workPrice).toBeCloseTo(1760);
    await repository.save(restored);
    db.close();
    await db.open();
    expect(await repository.get(current.id)).toEqual(current);
    expect(await db.calculations.count()).toBe(1);
  } finally { await db.delete(); }
});
