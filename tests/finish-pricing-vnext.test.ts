// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createStarterCalculatorSettings } from '../src/domain/configuration/vnext/settings';
import type { FinishConfiguration, FinishWork } from '../src/domain/configuration/vnext/types';
import type { WindowFinishMeasurement } from '../src/domain/measurements/vnext';
import type { Calculation } from '../src/domain/calculation-vnext';
import { copyCalculation } from '../src/domain/calculation-vnext';
import { estimateCalculationFinishVNext, estimateFinishVNext, reviseFinishMeasurementVNext } from '../src/application/estimate/estimate-finish-vnext';
import { selectFinishWidthVariant } from '../src/domain/pricing/finish-pricing-vnext';

function configuration(): FinishConfiguration { return createStarterCalculatorSettings().finish; }
function measurement(): WindowFinishMeasurement {
  return { kind: 'WindowFinish', id: 'finish', room: 'Кухня', name: 'Отделка', widthMm: 1400, heightMm: 2100, depthMm: 210,
    side: 'interior', workType: 'interiorSlopesAndSill', selections: [{ element: 'slope', materialId: 'sandwich' },
      { element: 'sill', materialId: 'sill-standard' }], additionalWorks: [], priceState: { mode: 'automatic' } };
}
function automatic(input = measurement(), config = configuration(), step: 10 | 50 | 100 = 100) {
  const result = estimateFinishVNext(input, config, step);
  if (result.price.priceState.mode !== 'automatic' || !('costBasis' in result.price)) throw new Error('Expected automatic');
  return result as typeof result & { price: Extract<typeof result.price, { costBasis: number }> };
}

describe('Finishing Pricing v2', () => {
  it('calculates material, fixed reserve, base + installed labor, and one markup on the cost basis', () => {
    const { price, geometry } = automatic();
    // slope: 5.6m * 600; sill: (1.4 + 0.1)m * 700. Salary uses installed 5.6m and 1.4m.
    expect(price).toMatchObject({ materialCost: 4410, materialsWithReserve: 5292, installerSalary: 3960,
      costBasis: 9252, finishPriceBeforeCommercialRounding: 11102.4,
      finishPriceBeforeCommercialRoundingMinor: 1110240, clientFinishPriceMinor: 1110000,
      selectedVariants: [{ element: 'slope', materialId: 'sandwich', widthVariantId: '200' },
        { element: 'sill', materialId: 'sill-standard', widthVariantId: '300' }] });
    expect(geometry.elements[0]).toMatchObject({ installedLengthM: 5.6, calculatedMaterialQuantityM: 5.6 });
    expect(geometry.elements[1]).toMatchObject({ installedLengthM: 1.4, calculatedMaterialQuantityM: 1.5, requiredDepthMm: 260 });
  });

  it.each([[220, '200'], [220.000001, '300'], [320, '300']] as const)('uses inclusive actual depth %s', (depth, id) => {
    const input = measurement(); input.workType = 'interiorSlopes'; input.selections = [input.selections[0]!]; input.depthMm = depth;
    expect(automatic(input).price.selectedVariants[0]!.widthVariantId).toBe(id);
  });

  it('selects narrowest physical width deterministically without mutating catalog order or comparing costs', () => {
    const variants = [
      { id: 'wide', physicalWidthMm: 400, maxUsableActualDepthMm: 500, purchaseCostPerRunningMeter: 1 },
      { id: 'b', physicalWidthMm: 200, maxUsableActualDepthMm: 250, purchaseCostPerRunningMeter: 1 },
      { id: 'a', physicalWidthMm: 200, maxUsableActualDepthMm: 250, purchaseCostPerRunningMeter: 999 },
      { id: 'looser', physicalWidthMm: 200, maxUsableActualDepthMm: 300, purchaseCostPerRunningMeter: 1 },
    ];
    expect(selectFinishWidthVariant(variants, 210)?.id).toBe('a');
    expect(selectFinishWidthVariant([...variants].reverse(), 210)?.id).toBe('a');
    expect(variants[0]!.id).toBe('wide');
  });

  it('honors a qualifying explicit variant, refuses undersized and missing overrides', () => {
    const input = measurement(); input.selections = [{ element: 'slope', materialId: 'sandwich', widthVariantId: '300' }]; input.workType = 'interiorSlopes';
    expect(automatic(input).price.selectedVariants[0]!.widthVariantId).toBe('300');
    input.depthMm = 250; input.selections = [{ ...input.selections[0]!, widthVariantId: '200' }];
    expect(estimateFinishVNext(input, configuration(), 100).price.priceState.mode).toBe('priceRequiresClarification');
    input.selections = [{ ...input.selections[0]!, widthVariantId: 'missing' }];
    expect(estimateFinishVNext(input, configuration(), 100).price.clientFinishPriceMinor).toBeNull();
  });

  it('keeps too-deep measurement saveable without invented price or partial cost basis', () => {
    const input = measurement(); input.depthMm = 420;
    const result = estimateFinishVNext(input, configuration(), 100);
    expect(result.measurement.depthMm).toBe(420);
    expect(result.measurement.priceState).toEqual(result.price.priceState);
    expect(result.price).toEqual({ priceState: { mode: 'priceRequiresClarification',
      reason: 'Для глубины 420 мм нет подходящего варианта материала «Сэндвич-панель».' }, clientFinishPriceMinor: null });
    const copied = copyCalculation(calculation(result.measurement, result.configuration));
    expect(copied.measurements[0]).toEqual(result.measurement);
    expect(estimateCalculationFinishVNext(copied, 'finish').price).toEqual(result.price);
  });

  it('can resolve a previously unresolved state from a suitable new snapshot', () => {
    const input = measurement(); input.depthMm = 420;
    const result = estimateFinishVNext(input, configuration(), 100);
    const config = configuration();
    config.materials = config.materials.map((material) => ({ ...material, widthVariants: [...material.widthVariants,
      { id: '500', physicalWidthMm: 500, maxUsableActualDepthMm: 500, purchaseCostPerRunningMeter: 1100 }] }));
    expect(automatic(result.measurement, config).measurement.priceState.mode).toBe('automatic');
  });

  it('ignores depth allowance for selection and adds length allowance once to each physical piece', () => {
    const config = configuration(); config.allowances.slope = { lengthMm: 100, depthMm: 1000 };
    const { price, geometry } = automatic(measurement(), config);
    expect(price.selectedVariants[0]!.widthVariantId).toBe('200');
    expect(geometry.elements[0]).toMatchObject({ actualDepthMm: 210, requiredDepthMm: 1210,
      installedLengthM: 5.6, calculatedMaterialQuantityM: 5.9, pieces: [
        { part: 'top', installedLengthMm: 1400, requiredLengthMm: 1500 },
        { part: 'left', installedLengthMm: 2100, requiredLengthMm: 2200 },
        { part: 'right', installedLengthMm: 2100, requiredLengthMm: 2200 }] });
    expect(price.materialCost).toBe(4590);
    expect(price.installerSalary).toBe(3960);
  });

  it.each(['purchaseStepMm', 'purchaseStep', 'wastePercent', 'materialMarkupPercent'] as const)
    ('rejects legacy %s at configuration/material/variant boundaries', (key) => {
      for (const location of ['configuration', 'material', 'variant']) {
        const config = configuration();
        const target = location === 'configuration' ? config : location === 'material' ? config.materials[0]! : config.materials[0]!.widthVariants[0]!;
        Object.assign(target, { [key]: 250 });
        expect(() => estimateFinishVNext(measurement(), config, 100)).toThrow();
      }
    });

  it('uses exact cut quantity without arbitrary purchase rounding', () => {
    const input = measurement(); input.widthMm = 1400.5; input.heightMm = 2100.25;
    const result = automatic(input);
    expect(result.geometry.elements[0]!.calculatedMaterialQuantityM).toBe(5.601);
    expect(result.geometry.elements[1]!.calculatedMaterialQuantityM).toBe(1.5005);
    expect(result.price.materialCost).toBeCloseTo(4410.95, 10);
  });

  it.each([10, 50, 100] as const)('rounds only the final automatic price at snapshot step %s', (step) => {
    const config = configuration(); config.finishMarkupPercent = 0;
    config.materials = config.materials.map((material) => ({ ...material, installerRatePerRunningMeter: 0,
      widthVariants: material.widthVariants.map((variant) => ({ ...variant, purchaseCostPerRunningMeter: 0 })) }));
    config.baseInstallerPayByWorkType.interiorSlopesAndSill = 1249.994;
    const result = automatic(measurement(), config, step);
    expect(result.price).toMatchObject({ materialCost: 0, materialsWithReserve: 0, installerSalary: 1249.994,
      costBasis: 1249.994, finishPriceBeforeCommercialRounding: 1249.994, finishPriceBeforeCommercialRoundingMinor: 124999,
      clientFinishPriceMinor: step === 100 ? 120000 : 125000 });
    config.baseInstallerPayByWorkType.interiorSlopesAndSill = 1250;
    expect(automatic(measurement(), config, step).price.clientFinishPriceMinor).toBe(step === 100 ? 130000 : 125000);
  });

  it('does not round fractional kopecks per material before accumulation/reserve/markup', () => {
    const config = configuration(); config.finishMarkupPercent = 0;
    config.baseInstallerPayByWorkType.interiorSlopesAndSill = 0;
    config.allowances.sill.lengthMm = 0;
    config.materials = config.materials.map((material) => ({ ...material, installerRatePerRunningMeter: 0,
      widthVariants: material.widthVariants.map((variant) => ({ ...variant, purchaseCostPerRunningMeter: 0.003 })) }));
    const result = automatic(measurement(), config);
    expect(result.price.materialCost).toBeCloseTo(0.021, 14);
    expect(result.price.materialsWithReserve).toBeCloseTo(0.0252, 14);
    expect(result.price.finishPriceBeforeCommercialRoundingMinor).toBe(3);
  });

  it.each([10, 50, 100] as const)('returns manual price exactly at step %s without fabricated breakdown', (step) => {
    const input = measurement(); input.depthMm = 420;
    input.priceState = { mode: 'manual', confirmation: 'confirmed', finalPriceMinor: 123456 };
    const price = estimateFinishVNext(input, configuration(), step).price;
    expect(price).toEqual({ priceState: input.priceState, clientFinishPriceMinor: 123456 });
    expect(price).not.toHaveProperty('costBasis');
    expect(price).not.toHaveProperty('installerSalary');
  });

  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid manual price %s', (amount) => {
    const input = measurement(); input.priceState = { mode: 'manual', confirmation: 'confirmed', finalPriceMinor: amount };
    expect(() => estimateFinishVNext(input, configuration(), 100)).toThrow();
  });

  it('preserves pending manual confirmation and excludes it from trustworthy final price', () => {
    const input = measurement(); input.priceState = { mode: 'manual', confirmation: 'needsConfirmation', finalPriceMinor: 123456 };
    expect(estimateFinishVNext(input, configuration(), 100).price).toEqual({ priceState: input.priceState, clientFinishPriceMinor: null });
  });

  it('invalidates manual confirmation on geometry, material, work composition changes without mutation', () => {
    const previous = measurement(); previous.priceState = { mode: 'manual', confirmation: 'confirmed', finalPriceMinor: 100001 };
    const changes: WindowFinishMeasurement[] = [
      { ...previous, widthMm: 1500 }, { ...previous, heightMm: 2200 }, { ...previous, depthMm: 211 },
      { ...previous, selections: [{ ...previous.selections[0]! }, { element: 'sill', materialId: 'sill-premium' }] },
      { ...previous, side: 'interior', workType: 'sillOnly', selections: [previous.selections[1]!] },
      { ...previous, additionalWorks: [{ id: 'seal', name: 'Герметизация', unitPriceMinor: 100, quantity: 1 }] },
    ];
    for (const change of changes) expect(reviseFinishMeasurementVNext(previous, change).priceState)
      .toEqual({ ...previous.priceState, confirmation: 'needsConfirmation' });
    expect(reviseFinishMeasurementVNext(previous, { ...previous, room: 'Спальня', name: 'Новое имя' }).priceState).toEqual(previous.priceState);
    expect(reviseFinishMeasurementVNext(previous, { ...previous, selections: [...previous.selections].reverse() }).priceState).toEqual(previous.priceState);
    expect(previous.priceState.confirmation).toBe('confirmed');
  });

  it('keeps insulation and sealing as additional works outside finish cost', () => {
    const input = measurement(); input.additionalWorks = [
      { id: 'insulation', name: 'Утепление', unitPriceMinor: 900000, quantity: 2 },
      { id: 'seal', name: 'Герметизация', unitPriceMinor: 200000, quantity: 1.5 },
    ];
    expect(automatic(input).price).toEqual(automatic().price);
  });

  it.each([
    { side: 'interior', workType: 'interiorSlopes', elements: ['slope'], length: 5.6, base: 1000 },
    { side: 'interior', workType: 'interiorSlopesAndSill', elements: ['slope', 'sill'], length: 7, base: 1300 },
    { side: 'interior', workType: 'sillOnly', elements: ['sill'], length: 1.4, base: 500 },
    { side: 'exterior', workType: 'exteriorSlopes', elements: ['slope'], length: 5.6, base: 1000 },
    { side: 'exterior', workType: 'exteriorSlopesAndDrip', elements: ['slope', 'drip'], length: 7, base: 1300 },
    { side: 'exterior', workType: 'dripOnly', elements: ['drip'], length: 1.4, base: 500 },
  ] as const)('supports $workType using correct physical pieces and base pay', ({ side, workType, elements, length, base }) => {
    const config = configuration();
    config.materials = elements.map((element) => ({ id: element, name: element, status: 'active', side, element,
      installerRatePerRunningMeter: 100, widthVariants: [{ id: 'wide', physicalWidthMm: 300, maxUsableActualDepthMm: 300, purchaseCostPerRunningMeter: 0 }] }));
    const input = { ...measurement(), ...({ side, workType } as FinishWork), selections: elements.map((element) => ({ element, materialId: element })) };
    const result = automatic(input, config);
    expect(result.price.installerSalary).toBe(base + length * 100);
    expect(result.geometry.elements.map((element) => element.element)).toEqual(elements);
    if (elements.some((element) => element === 'drip')) expect(result.geometry.elements.at(-1)!.pieces[0]!.part).toBe('drip');
  });

  it('accepts hidden snapshot materials and preserves ownership independently of live settings', () => {
    const input = measurement(); const config = configuration(); config.materials[0]!.status = 'hidden';
    const stored = calculation(input, config);
    const result = estimateCalculationFinishVNext(stored, 'finish');
    config.materials[0]!.widthVariants[0]!.purchaseCostPerRunningMeter = 999999;
    input.depthMm = 999;
    expect(result.configuration.materials[0]!.widthVariants[0]!.purchaseCostPerRunningMeter).toBe(600);
    expect(result.measurement.depthMm).toBe(210);
    expect(result.commercialRoundingStepRub).toBe(50);
  });

  it('rejects invalid snapshots, identities, measurement composition and nonfinite/overflow arithmetic', () => {
    const config = configuration(); config.finishMarkupPercent = Number.MAX_VALUE;
    expect(() => automatic(measurement(), config)).toThrow();
    const enormous = measurement(); enormous.widthMm = Number.MAX_VALUE; enormous.heightMm = Number.MAX_VALUE;
    expect(() => automatic(enormous)).toThrow();
    for (const depth of [0, -1, NaN, Infinity]) expect(() => automatic({ ...measurement(), depthMm: depth })).toThrow();
    expect(() => automatic({ ...measurement(), selections: [measurement().selections[0]!] })).toThrow();
    expect(() => automatic({ ...measurement(), selections: [{ element: 'slope', materialId: 'missing' }, measurement().selections[1]!] })).toThrow();
    const stored = calculation(measurement(), configuration());
    expect(() => estimateCalculationFinishVNext(stored, 'missing')).toThrow();
    stored.measurements = [...stored.measurements, stored.measurements[0]!];
    expect(() => estimateCalculationFinishVNext(stored, 'finish')).toThrow();
  });
});

function calculation(input: WindowFinishMeasurement, config: FinishConfiguration): Calculation {
  return { schemaVersion: 4, id: 'calc', createdAt: '2026-10-07T00:00:00Z', updatedAt: '2026-10-07T00:00:00Z',
    measurements: [input], configuration: { [input.id]: { kind: 'WindowFinish', configuration: config } },
    orderAdditionalWorks: [], discount: { mode: 'none' }, commercialRoundingStepRub: 50 };
}
