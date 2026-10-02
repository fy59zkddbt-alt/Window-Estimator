import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { estimateDiscount, setDiscount } from '../src/application/estimate/discount';
import { createCalculation, saveMeasurement, estimateCalculation, updateCalculationDiscount, confirmFixedFinalPrice, resetCalculationDiscount, deleteMeasurement, copyMeasurement, updateOrderAdditionalWorks, updateCalculationDetails } from '../src/application/estimate/calculation-service';
import { estimateWindow } from '../src/application/estimate/estimate-window';
import { input, configuration } from './fixtures';
import { date } from './order-fixtures';
import { EstimatorDatabase } from '../src/infrastructure/storage/database';
import { DexieCalculationRepository } from '../src/infrastructure/storage/dexie-calculation-repository';

const window = estimateWindow(input, configuration);
const base = saveMeasurement(createCalculation('discount', date), window, date, 'add');
const subtotal = estimateCalculation(base).subtotalMinor;
const fixed = () => updateCalculationDiscount(base, { mode: 'fixedFinalPrice', fixedFinalPriceMinor: subtotal - 10000 }, date);
it('no discount, including absent legacy state', () => {
  expect(estimateDiscount(undefined, 12345)).toMatchObject({ discountMode: 'none', discountAmountMinor: 0, finalTotalMinor: 12345, isFinalized: true });
  expect(estimateCalculation(base).finalTotalMinor).toBe(subtotal);
});
it.each([[0, 0, 12345], [100, 12345, 0], [10, 1235, 11110], [12.5, 1543, 10802]])('percent %s rounds once to Minor', (discountPercent, amount, total) => {
  expect(estimateDiscount({ mode: 'percent', discountPercent }, 12345)).toMatchObject({ discountAmountMinor: amount, finalTotalMinor: total, isFinalized: true });
});
it.each([-1, 100.01, NaN, Infinity])('rejects percent %s', (discountPercent) => {
  expect(() => updateCalculationDiscount(base, { mode: 'percent', discountPercent }, date)).toThrow();
});
it.each([0, subtotal, subtotal - 10000])('fixed price %s produces exact integer totals', (fixedFinalPriceMinor) => {
  const result = estimateCalculation(updateCalculationDiscount(base, { mode: 'fixedFinalPrice', fixedFinalPriceMinor }, date));
  expect(result.finalTotalMinor).toBe(fixedFinalPriceMinor);
  expect(result.discountAmountMinor).toBe(subtotal - fixedFinalPriceMinor);
  expect(result.fixedFinalPriceConfirmation).toBe('confirmed');
});
it.each([-1, 0.5, NaN, Infinity, subtotal + 1])('rejects invalid fixed price %s', (fixedFinalPriceMinor) => {
  expect(() => updateCalculationDiscount(base, { mode: 'fixedFinalPrice', fixedFinalPriceMinor }, date)).toThrow();
});
it.each(['add', 'edit', 'delete', 'copy', 'measurementWork', 'orderWork'] as const)('%s invalidates a fixed final price', (operation) => {
  const source = fixed();
  const value = operation === 'add' ? saveMeasurement(source, estimateWindow({ ...input, id: 'second' }, configuration), date, 'add')
    : operation === 'edit' ? saveMeasurement(source, estimateWindow({ ...input, heightMm: input.heightMm + 100 }, configuration), date, 'edit')
    : operation === 'delete' ? deleteMeasurement(source, input.id, date)
    : operation === 'copy' ? copyMeasurement(source, input.id, 'copy', date)
    : operation === 'measurementWork' ? saveMeasurement(source, estimateWindow({ ...input, additionalWorks: [{ id: 'work', name: 'Работа', priceMinor: 12345 }] }, configuration), date, 'edit')
    : updateOrderAdditionalWorks(source, [{ id: 'work', name: 'Доставка', priceMinor: 10000 }], date);
  const result = estimateCalculation(value);
  expect(result.fixedFinalPriceConfirmation).toBe('needsConfirmation');
  expect(result.fixedFinalPriceMinor).toBe(subtotal - 10000);
  expect(result.finalTotalMinor).toBeNull();
  expect(result.discountAmountMinor).toBeNull();
  expect(result.isFinalized).toBe(false);
  expect(estimateCalculation(source).isFinalized).toBe(true);
});
it('even same-price edits need confirmation, while client metadata does not', () => {
  const source = fixed();
  expect(estimateCalculation(saveMeasurement(source, estimateWindow({ ...input, name: 'Переименовано' }, configuration), date, 'edit')).isFinalized).toBe(false);
  expect(estimateCalculation(updateCalculationDetails(source, { clientName: 'Клиент' }, date)).isFinalized).toBe(true);
});
it('percent automatically follows changed subtotal', () => {
  const source = updateCalculationDiscount(base, { mode: 'percent', discountPercent: 10 }, date);
  const changed = copyMeasurement(source, input.id, 'copy', date);
  const result = estimateCalculation(changed);
  expect(result.subtotalMinor).toBe(subtotal * 2);
  expect(result.discountAmountMinor).toBe(Math.round(subtotal * 2 / 10));
  expect(result.isFinalized).toBe(true);
});
it('explicit confirmation retains target; reset removes discount', () => {
  const changed = copyMeasurement(fixed(), input.id, 'copy', date);
  const confirmed = confirmFixedFinalPrice(changed, date);
  expect(estimateCalculation(confirmed)).toMatchObject({ isFinalized: true, finalTotalMinor: subtotal - 10000, discountAmountMinor: subtotal + 10000 });
  expect(confirmed.discount).toMatchObject({ confirmedSubtotalMinor: subtotal * 2, confirmation: 'confirmed' });
  expect(estimateCalculation(resetCalculationDiscount(changed, date))).toMatchObject({ discountMode: 'none', finalTotalMinor: subtotal * 2, discountAmountMinor: 0 });
});
it('a target above the reduced subtotal remains pending and cannot be confirmed', () => {
  const changed = deleteMeasurement(fixed(), input.id, date);
  expect(estimateCalculation(changed)).toMatchObject({ subtotalMinor: 0, canConfirmFixedPrice: false, finalTotalMinor: null });
  expect(() => confirmFixedFinalPrice(changed, date)).toThrow('превышать');
  expect(estimateCalculation(resetCalculationDiscount(changed, date)).finalTotalMinor).toBe(0);
});
it('subtotal snapshot also invalidates direct stale data outside the UI', () => {
  const source = fixed();
  const changed = { ...source, orderAdditionalWorks: [{ id: 'added', name: 'Работа', priceMinor: 1000 }] };
  expect(estimateCalculation(changed).isFinalized).toBe(false);
  expect(source.discount).toMatchObject({ confirmation: 'confirmed' });
});
it('safe-range percent totals, including empty order', () => {
  expect(estimateDiscount({ mode: 'percent', discountPercent: 1.005 }, 10000).discountAmountMinor).toBe(101);
  expect(estimateDiscount({ mode: 'percent', discountPercent: 1e-7 }, 10000).discountAmountMinor).toBe(0);
  expect(estimateDiscount(setDiscount({ mode: 'percent', discountPercent: 100 }, Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER).finalTotalMinor).toBe(0);
  expect(estimateDiscount({ mode: 'percent', discountPercent: 50 }, 0).finalTotalMinor).toBe(0);
});
it('IndexedDB v3 persists confirmed, pending and percent states; old records normalize without rewrite', async () => {
  const db = new EstimatorDatabase('discount-states'); const repo = new DexieCalculationRepository(db);
  try {
    for (const state of [fixed(), copyMeasurement(fixed(), input.id, 'copy', date), deleteMeasurement(fixed(), input.id, date), updateCalculationDiscount(base, { mode: 'percent', discountPercent: 25 }, date)]) {
      await repo.save(state); db.close(); await db.open();
      expect(await repo.get(state.id)).toEqual(state);
      expect(estimateCalculation((await repo.get(state.id))!)).toEqual(estimateCalculation(state));
    }
    const { discount: _discount, ...legacy } = base;
    await db.table('calculations').put(legacy);
    const loaded = (await repo.get(legacy.id))!;
    expect(loaded.discount).toEqual({ mode: 'none' });
    expect(estimateCalculation(loaded).finalTotalMinor).toBe(subtotal);
    expect(await db.table('calculations').get(legacy.id)).toEqual(legacy);
    expect(db.verno).toBe(4);
  } finally { await db.delete(); }
});
