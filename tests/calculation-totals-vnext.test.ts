// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { estimateCalculationVNext } from '../src/application/estimate/estimate-calculation-vnext';
import { estimateCalculationGlazingVNext } from '../src/application/estimate/estimate-glazing-vnext';
import { estimateCalculationFinishVNext } from '../src/application/estimate/estimate-finish-vnext';
import type { Calculation } from '../src/domain/calculation-vnext';
import { createStarterCalculatorSettings } from '../src/domain/configuration/vnext/settings';
import type { Measurement, WindowMeasurement, WindowFinishMeasurement, BalconyMeasurement } from '../src/domain/measurements/vnext';
import type { AdditionalWork } from '../src/domain/works/vnext';
import * as money from '../src/domain/money';

function window(id = 'window'): WindowMeasurement {
  return { kind: 'Window', id, name: 'Окно', room: 'Кухня', material: 'pvc', profileId: 'pvc-standard',
    colorId: 'white', extensions: false, connectors: false, additionalWorks: [], windowType: 'single',
    widthMm: 1000, heightMm: 1000, plane: { id: 'plane', sections: [{ id: 's', widthMm: 1000, openingType: 'fixed' }] } };
}
function finish(id = 'finish', manual?: number): WindowFinishMeasurement {
  return { kind: 'WindowFinish', id, name: 'Отделка', room: 'Кухня', widthMm: 1400, heightMm: 2100, depthMm: 210,
    side: 'interior', workType: 'interiorSlopesAndSill', selections: [{ element: 'slope', materialId: 'sandwich' },
      { element: 'sill', materialId: 'sill-standard' }], additionalWorks: [],
    priceState: manual === undefined ? { mode: 'automatic' } : { mode: 'manual', confirmation: 'confirmed', finalPriceMinor: manual } };
}
function work(id = 'work', unitPriceMinor = 499, quantity = 1): AdditionalWork {
  return { id, name: 'Работа', unitPriceMinor, quantity, unit: 'runningMeter', catalogId: 'catalog' };
}
function calculation(measurements: Measurement[] = []): Calculation {
  return { id: 'calc', schemaVersion: 4, createdAt: '2026-10-07T00:00:00Z', updatedAt: '2026-10-07T00:00:00Z',
    measurements, configuration: Object.fromEntries(measurements.map((m) => {
      const settings = createStarterCalculatorSettings();
      return [m.id, m.kind === 'WindowFinish' ? { kind: m.kind, configuration: settings.finish }
        : { kind: m.kind, configuration: settings.glazing }];
    })), commercialRoundingStepRub: 10, orderAdditionalWorks: [], discount: { mode: 'none' } };
}

describe('Calculation Totals v2', () => {
  it('consumes glazing product/installation separately and safely sums multiple snapshots', () => {
    const input = calculation([window(), window('second')]);
    const snapshot = input.configuration.second!;
    if (snapshot.kind === 'WindowFinish') throw new Error('fixture');
    snapshot.configuration.profiles[0]!.basePricePerM2 = 11000;
    const first = estimateCalculationGlazingVNext(input, 'window');
    const second = estimateCalculationGlazingVNext(input, 'second');
    const result = estimateCalculationVNext(input);
    expect(result.measurements[0]).toMatchObject({ measurementId: 'window', result: first, basePriceMinor: first.price.totalMinor,
      clientLines: [{ kind: 'glazingProduct', clientPriceMinor: 1200000 }, { kind: 'glazingInstallation', clientPriceMinor: 100000 }] });
    expect(result).toMatchObject({ pricingStatus: 'priced', subtotalMinor: first.price.totalMinor + second.price.totalMinor,
      finalTotalMinor: 2720000, isFinalized: true, unresolvedMeasurements: [] });
  });

  it('delegates Balcony and balconyBlock to the same glazing entry point', () => {
    const balcony: BalconyMeasurement = { kind: 'Balcony', id: 'balcony', room: 'Балкон', name: 'Остекление',
      material: 'aluminium', profileId: 'aluminium-example', colorId: 'white', connectors: true, extensions: true,
      additionalWorks: [], balconyType: 'straight', planes: [{ id: 'facade', position: 'facade', name: 'Фасад',
        widthMm: 2000, heightMm: 1500, sectionCount: 1, levels: { mode: 'oneLevel' }, mode: 'sliding',
        sections: [{ id: 's', widthMm: 2000, openingType: 'sliding' }] }] };
    const block: WindowMeasurement = { kind: 'Window', id: 'block', name: 'Блок', room: 'Кухня',
      material: 'pvc', profileId: 'pvc-standard', colorId: 'white', extensions: false, connectors: false,
      additionalWorks: [], windowType: 'balconyBlock', doorPosition: 'right', doorWidthMm: 700, doorHeightMm: 2200,
      windowHeightMm: 1500, plane: { id: 'plane', sections: [{ id: 's', widthMm: 1400, openingType: 'fixed' }] },
      door: { id: 'door', openingType: 'turn', hingeSide: 'left', hardwareId: 'standard' } };
    const input = calculation([balcony, block]);
    const result = estimateCalculationVNext(input);
    for (const m of result.measurements) expect(m.result).toEqual(estimateCalculationGlazingVNext(input, m.measurementId));
    expect(result.pricingStatus).toBe('priced');
  });

  it.each([10, 50, 100] as const)('consumes automatic finish and preserves manual cents/subtotal at step %s', (step) => {
    const input = calculation([finish(), finish('manual', 123456)]); input.commercialRoundingStepRub = step;
    const expected = estimateCalculationFinishVNext(input, 'finish');
    const result = estimateCalculationVNext(input);
    expect(result.measurements[0]!.result).toEqual(expected);
    expect(result.measurements[0]!.clientLines).toEqual([{ kind: 'finish', measurementId: 'finish', clientPriceMinor: expected.price.clientFinishPriceMinor }]);
    expect(result.measurements[1]!.measurementTotalMinor).toBe(123456);
    expect(result.subtotalMinor).toBe(expected.price.clientFinishPriceMinor! + 123456);
    expect(result.finalTotalMinor).toBe(result.subtotalMinor);
    expect(result.subtotalMinor! % 100).toBe(56);
  });

  it('calls commercial rounding only in engines, work lines and percentage final boundary', () => {
    // Rounding is idempotent on finalized step multiples; observe calls as well as numbers.
    const input = calculation([window(), finish(), finish('manual', 123456)]);
    const round = vi.spyOn(money, 'commercialRoundMinor');
    try {
      estimateCalculationVNext(input);
      expect(round).toHaveBeenCalledTimes(3); // Product, installation, automatic finish only.
      round.mockClear();
      input.orderAdditionalWorks = [work('one'), work('two')]; input.discount = { mode: 'percent', discountPercent: 7.25 };
      estimateCalculationVNext(input);
      expect(round).toHaveBeenCalledTimes(6);
    } finally { round.mockRestore(); }
  });

  it.each([10, 50, 100] as const)('rounds works per line, after decimal multiplication at step %s', (step) => {
    const m = finish('manual', 101); m.additionalWorks = [work('same-id', step * 50 - 1, 1.001)];
    const input = calculation([m]); input.commercialRoundingStepRub = step;
    input.orderAdditionalWorks = [work('same-id', step * 50 - 1, 1.001)];
    const result = estimateCalculationVNext(input);
    const before = step === 10 ? 499 : step === 50 ? 2501 : 5004;
    const client = step === 10 ? 0 : step * 100;
    expect(result.measurements[0]!.additionalWorkLines[0]).toMatchObject({ location: { scope: 'measurement', measurementId: 'manual' },
      work: m.additionalWorks[0], priceBeforeCommercialRoundingMinor: before, clientPriceMinor: client });
    expect(result.orderAdditionalWorkLines[0]).toMatchObject({ location: { scope: 'order' },
      priceBeforeCommercialRoundingMinor: before, clientPriceMinor: client });
    expect(result.subtotalMinor).toBe(101 + 2 * client);
  });

  it('rounds half a kopeck up BEFORE rounding the client line, without rounding unit price', () => {
    const input = calculation(); input.orderAdditionalWorks = [work('half', 999, 0.5)];
    expect(estimateCalculationVNext(input).orderAdditionalWorkLines[0]).toMatchObject({
      priceBeforeCommercialRoundingMinor: 500, clientPriceMinor: 1000 });
  });

  it.each([10, 50, 100] as const)('sums round(lines), not round(sum), at step %s', (step) => {
    const input = calculation(); input.commercialRoundingStepRub = step;
    input.orderAdditionalWorks = [work('a', step * 149), work('b', step * 149)];
    const result = estimateCalculationVNext(input);
    expect(result.orderAdditionalWorkLines.map((line) => line.clientPriceMinor)).toEqual([step * 100, step * 100]);
    expect(result.subtotalMinor).toBe(step * 200);
    expect(result.subtotalMinor).not.toBe(money.commercialRoundMinor(step * 298, step));
  });

  it.each(['piece', 'runningMeter', 'squareMeter', 'unit', undefined] as const)('unit %s is metadata only', (unit) => {
    const input = calculation(); const item = work('work', 333, 1.5);
    delete item.unit; if (unit !== undefined) item.unit = unit;
    input.orderAdditionalWorks = [item];
    expect(estimateCalculationVNext(input).orderAdditionalWorkLines[0]).toMatchObject({ work: item,
      priceBeforeCommercialRoundingMinor: 500, clientPriceMinor: 1000 });
  });

  it('sums mixed glazing, automatic/manual finish and both work locations, independently of catalog', () => {
    const w = window(); w.additionalWorks = [work('install-extra', 10001, 1.5)];
    const f = finish(); f.additionalWorks = [work('seal', 20001, 2.5)];
    const input = calculation([w, f, finish('manual', 123456)]);
    input.orderAdditionalWorks = [work('delivery', 9999, 1.5)];
    const result = estimateCalculationVNext(input);
    expect(result).toMatchObject({ measurementsSubtotalMinor: 2598456, orderWorksTotalMinor: 15000,
      subtotalMinor: 2613456, finalTotalMinor: 2613456 });
    expect(result.measurements.map((m) => m.measurementTotalMinor)).toEqual([1315000, 1160000, 123456]);
  });

  it.each([0, 7.25, 33.333, 100])('applies %s percent after subtotal and exposes final rounding adjustment', (percent) => {
    const input = calculation([finish('manual', 123456)]);
    input.orderAdditionalWorks = [work('delivery', 10000)]; input.discount = { mode: 'percent', discountPercent: percent };
    const result = estimateCalculationVNext(input);
    const amount = money.percentageMinor(133456, percent);
    expect(result.subtotalMinor).toBe(133456);
    expect(result.discountAmountMinor).toBe(amount);
    expect(result.rawDiscountedTotalMinor).toBe(133456 - amount);
    expect(result.finalTotalMinor).toBe(money.commercialRoundMinor(133456 - amount, 10));
    expect(result.finalTotalMinor).toBe(result.subtotalMinor! - amount + result.commercialRoundingAdjustmentMinor!);
    expect(result.measurements[0]!.measurementTotalMinor).toBe(123456);
  });

  it.each([[5, 10500, 11000], [5.01, 10499, 10000]] as const)('percentage boundary %s rounds final total half-up', (percent, raw, final) => {
    const input = calculation([finish('manual', 11053)]); input.discount = { mode: 'percent', discountPercent: percent };
    const result = estimateCalculationVNext(input);
    expect(result.rawDiscountedTotalMinor).toBe(raw); expect(result.finalTotalMinor).toBe(final);
  });

  it.each([10, 50, 100] as const)('preserves confirmed fixed final price exactly at step %s', (step) => {
    const input = calculation([finish('manual', 123456)]); input.commercialRoundingStepRub = step;
    input.discount = { mode: 'fixedFinalPrice', fixedFinalPriceMinor: 111111, confirmation: 'confirmed', confirmedSubtotalMinor: 123456 };
    expect(estimateCalculationVNext(input)).toMatchObject({ subtotalMinor: 123456, finalTotalMinor: 111111,
      discountAmountMinor: 12345, commercialRoundingAdjustmentMinor: 0, isFinalized: true });
  });

  it.each(['pending', 'stale', 'above-new-subtotal'] as const)('retains existing fixed confirmation semantics: %s', (scenario) => {
    const input = calculation([finish('manual', 123456)]);
    input.discount = { mode: 'fixedFinalPrice', fixedFinalPriceMinor: scenario === 'above-new-subtotal' ? 200000 : 111111,
      confirmation: scenario === 'pending' ? 'needsConfirmation' : 'confirmed', confirmedSubtotalMinor: scenario === 'pending' ? 123456 : 300000 };
    expect(estimateCalculationVNext(input)).toMatchObject({ pricingStatus: 'priced', subtotalMinor: 123456,
      finalTotalMinor: null, discountAmountMinor: null, fixedFinalPriceConfirmation: 'needsConfirmation',
      canConfirmFixedPrice: scenario !== 'above-new-subtotal', isFinalized: false });
  });

  it.each(['none', 'percent', 'fixedFinalPrice'] as const)('propagates clarification with %s discount and preserves known work lines', (mode) => {
    const unresolved = finish(); unresolved.depthMm = 420; unresolved.additionalWorks = [work('seal', 1000)];
    const input = calculation([window(), unresolved]); input.orderAdditionalWorks = [work('delivery', 2000)];
    input.discount = mode === 'percent' ? { mode, discountPercent: 20 } : mode === 'none' ? { mode }
      : { mode, fixedFinalPriceMinor: 100000, confirmation: 'confirmed', confirmedSubtotalMinor: 1303000 };
    const original = structuredClone(input); const result = estimateCalculationVNext(input);
    expect(result).toMatchObject({ pricingStatus: 'unresolved', subtotalMinor: null, measurementsSubtotalMinor: null,
      finalTotalMinor: null, discountAmountMinor: null, rawDiscountedTotalMinor: null, commercialRoundingAdjustmentMinor: null,
      isFinalized: false, canConfirmFixedPrice: false, unresolvedMeasurements: [{ measurementId: 'finish', code: 'priceRequiresClarification' }] });
    expect(result.unresolvedMeasurements[0]!.reason).toContain('420');
    expect(result.measurements[0]!.measurementTotalMinor).toBe(1300000);
    expect(result.measurements[1]).toMatchObject({ basePriceMinor: null, measurementTotalMinor: null, clientLines: [], additionalWorksTotalMinor: 1000 });
    expect(result.orderWorksTotalMinor).toBe(2000);
    if (mode === 'fixedFinalPrice') expect(result.fixedFinalPriceConfirmation).toBe('needsConfirmation');
    expect(input).toEqual(original);
  });

  it('identifies every unresolved finish, including manual confirmation', () => {
    const a = finish(); a.depthMm = 420;
    const b = finish('pending', 123456); b.priceState = { mode: 'manual', finalPriceMinor: 123456, confirmation: 'needsConfirmation' };
    const result = estimateCalculationVNext(calculation([a, b]));
    expect(result.unresolvedMeasurements.map((m) => [m.measurementId, m.code])).toEqual([
      ['finish', 'priceRequiresClarification'], ['pending', 'manualPriceNeedsConfirmation']]);
    expect(result.finalTotalMinor).toBeNull();
  });

  it('returns independent results and does not mutate snapshots or source measurements', () => {
    const w = window(); w.additionalWorks = [work()];
    const input = calculation([w, finish()]); input.orderAdditionalWorks = [work()];
    const original = structuredClone(input); const result = estimateCalculationVNext(input);
    expect(input).toEqual(original);
    result.measurements[0]!.result.measurement.name = 'Changed';
    result.orderAdditionalWorkLines[0]!.work.unitPriceMinor = 123;
    result.measurements[0]!.additionalWorkLines[0]!.work.name = 'Changed';
    const snapshot = result.measurements[0]!.result.configuration;
    if ('profiles' in snapshot) snapshot.profiles[0]!.basePricePerM2 = 1;
    expect(input).toEqual(original);
    expect(estimateCalculationVNext(input).subtotalMinor).toBe(result.subtotalMinor);
  });

  it('handles a valid empty calculation as a priced zero', () => {
    expect(estimateCalculationVNext(calculation())).toMatchObject({ pricingStatus: 'priced', subtotalMinor: 0, finalTotalMinor: 0, isFinalized: true });
  });

  it('rejects a confirmed fixed price above its matching subtotal', () => {
    const input = calculation([finish('manual', 123456)]);
    input.discount = { mode: 'fixedFinalPrice', fixedFinalPriceMinor: 123457, confirmedSubtotalMinor: 123456, confirmation: 'confirmed' };
    expect(() => estimateCalculationVNext(input)).toThrow();
  });

  it('checks the rounding step even for an empty calculation or manual-only price', () => {
    for (const input of [calculation(), calculation([finish('manual', 123456)])]) {
      Object.assign(input, { commercialRoundingStepRub: NaN });
      expect(() => estimateCalculationVNext(input)).toThrow();
    }
  });

  it('protects final percentage commercial rounding from overflow without rejecting exact manual totals', () => {
    const input = calculation([finish('manual', Number.MAX_SAFE_INTEGER)]);
    expect(estimateCalculationVNext(input).finalTotalMinor).toBe(Number.MAX_SAFE_INTEGER);
    input.discount = { mode: 'percent', discountPercent: 0 };
    expect(() => estimateCalculationVNext(input)).toThrow();
  });

  it.each([0, -1, NaN, Infinity])('rejects invalid quantity %s at both locations', (quantity) => {
    const w = window(); w.additionalWorks = [work('bad', 100, quantity)];
    expect(() => estimateCalculationVNext(calculation([w]))).toThrow();
    const input = calculation(); input.orderAdditionalWorks = [work('bad', 100, quantity)];
    expect(() => estimateCalculationVNext(input)).toThrow();
  });

  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid work money %s', (amount) => {
    const input = calculation(); input.orderAdditionalWorks = [work('bad', amount)];
    expect(() => estimateCalculationVNext(input)).toThrow();
  });

  it('rejects multiplication, line rounding, measurement and calculation sum overflow', () => {
    const input = calculation();
    for (const works of [[work('multiply', Number.MAX_SAFE_INTEGER, 2)], [work('round', Number.MAX_SAFE_INTEGER)],
      [work('sum1', 5000000000000000), work('sum2', 5000000000000000)]]) {
      input.orderAdditionalWorks = works; expect(() => estimateCalculationVNext(input)).toThrow();
    }
    const m = finish('large', Number.MAX_SAFE_INTEGER); m.additionalWorks = [work('extra', 1000)];
    expect(() => estimateCalculationVNext(calculation([m]))).toThrow();
    expect(() => estimateCalculationVNext(calculation([finish('a', 5000000000000000), finish('b', 5000000000000000)]))).toThrow();
    const unresolved = finish(); unresolved.depthMm = 420;
    const partial = calculation([unresolved, finish('max', Number.MAX_SAFE_INTEGER)]); partial.orderAdditionalWorks = [work('extra', 1000)];
    expect(() => estimateCalculationVNext(partial)).toThrow();
  });

  it.each(['unknownKind', 'missingSnapshot', 'extraSnapshot', 'wrongSnapshot', 'duplicate', 'emptyId', 'geometry',
    'schema', 'step', 'dates', 'missingWorks', 'duplicateWork', 'badUnit', 'badName', 'badCatalog'] as const)
    ('rejects malformed data deterministically: %s', (scenario) => {
      const input = calculation([window()]);
      if (scenario === 'unknownKind') Object.assign(input.measurements[0]!, { kind: 'Other' });
      if (scenario === 'missingSnapshot') input.configuration = {};
      if (scenario === 'extraSnapshot') input.configuration = { ...input.configuration, extra: input.configuration.window! };
      if (scenario === 'wrongSnapshot') input.configuration = { window: { kind: 'WindowFinish', configuration: createStarterCalculatorSettings().finish } };
      if (scenario === 'duplicate') input.measurements = [window(), window()];
      if (scenario === 'emptyId') Object.assign(input.measurements[0]!, { id: '' });
      if (scenario === 'geometry') Object.assign(input.measurements[0]!, { widthMm: NaN });
      if (scenario === 'schema') Object.assign(input, { schemaVersion: 3 });
      if (scenario === 'step') Object.assign(input, { commercialRoundingStepRub: 1 });
      if (scenario === 'dates') input.updatedAt = 'invalid';
      if (scenario === 'missingWorks') Object.assign(input, { orderAdditionalWorks: undefined });
      if (scenario === 'duplicateWork') input.orderAdditionalWorks = [work(), work()];
      if (scenario === 'badUnit') input.orderAdditionalWorks = [Object.assign(work(), { unit: 'other' }) as AdditionalWork];
      if (scenario === 'badName') input.orderAdditionalWorks = [{ ...work(), name: '' }];
      if (scenario === 'badCatalog') input.orderAdditionalWorks = [{ ...work(), catalogId: '' }];
      expect(() => estimateCalculationVNext(input)).toThrow();
    });

  it.each([undefined, null, { mode: 'other' }, { mode: 'percent', discountPercent: -1 }, { mode: 'percent', discountPercent: 101 },
    { mode: 'percent', discountPercent: NaN }, { mode: 'percent', discountPercent: Infinity },
    { mode: 'fixedFinalPrice', fixedFinalPriceMinor: -1, confirmedSubtotalMinor: 0, confirmation: 'confirmed' },
    { mode: 'fixedFinalPrice', fixedFinalPriceMinor: 1, confirmedSubtotalMinor: NaN, confirmation: 'confirmed' },
    { mode: 'fixedFinalPrice', fixedFinalPriceMinor: 1, confirmedSubtotalMinor: 0, confirmation: 'other' }])
    ('rejects malformed discount %j even with unresolved pricing', (discount) => {
      for (const depthMm of [210, 420]) {
        const m = finish(); m.depthMm = depthMm; const input = calculation([m]); Object.assign(input, { discount });
        expect(() => estimateCalculationVNext(input)).toThrow();
      }
    });
});
