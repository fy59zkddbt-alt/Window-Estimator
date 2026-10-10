// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createPricingTestSettings as createStarterCalculatorSettings } from './fixtures/pricing-settings';
import type { CommercialRoundingStepRub, GlazingConfiguration } from '../src/domain/configuration/vnext/types';
import { priceInstalledGlazingVNext, type GlazingPricingInput } from '../src/domain/pricing/glazing-pricing-vnext';
import { estimateCalculationGlazingVNext, estimateGlazingVNext } from '../src/application/estimate/estimate-glazing-vnext';
import type { BalconyMeasurement, WindowMeasurement } from '../src/domain/measurements/vnext';
import type { Calculation } from '../src/domain/calculation-vnext';
import { commercialRoundMinor } from '../src/domain/money';

function configuration(): GlazingConfiguration { return createStarterCalculatorSettings().glazing; }
function pvc(config: GlazingConfiguration) {
  const profile = config.profiles[0]!;
  if (profile.material !== 'pvc') throw new Error('Fixture');
  return profile;
}
function aluminium(config: GlazingConfiguration) {
  const profile = config.profiles[1]!;
  if (profile.material !== 'aluminium') throw new Error('Fixture');
  return profile;
}
function input(overrides: Partial<GlazingPricingInput> = {}): GlazingPricingInput {
  return { material: 'pvc', profileId: 'pvc-standard', colorId: 'white', extensions: false, connectors: false,
    totalAreaM2: 2, activeAreas: [], ...overrides };
}
function window(): Extract<WindowMeasurement, { material: 'pvc'; windowType: 'double' | 'single' | 'triple' }> {
  return { kind: 'Window', id: 'window', room: 'Кухня', name: 'Окно', material: 'pvc', profileId: 'pvc-standard',
    colorId: 'white', extensions: false, connectors: false, additionalWorks: [], windowType: 'double',
    widthMm: 2000, heightMm: 2000, transom: { heightMm: 500, openingType: 'fixed' },
    plane: { id: 'plane', sections: [
      { id: 'left', widthMm: 750, openingType: 'turn', hingeSide: 'left', hardwareId: 'standard' },
      { id: 'right', widthMm: 1250, openingType: 'tilt_turn', hingeSide: 'right', hardwareId: 'premium' },
    ] } };
}
function balcony(): Extract<BalconyMeasurement, { material: 'pvc' }> {
  return { kind: 'Balcony', id: 'balcony', room: 'Балкон', name: 'Остекление', material: 'pvc', profileId: 'pvc-standard',
    colorId: 'white', extensions: false, connectors: false, additionalWorks: [], balconyType: 'straight',
    planes: [{ id: 'facade', name: 'Фасад', position: 'facade', widthMm: 2000, heightMm: 2000, sectionCount: 2,
      levels: { mode: 'twoLevel', splitHeightMm: 500, lowerFill: 'sandwich' },
      sections: [{ id: 'one', widthMm: 500, openingType: 'fixed' },
        { id: 'two', widthMm: 1500, openingType: 'turn', hingeSide: 'left', hardwareId: 'premium' }] }] };
}
function alWindow(mode: 'sliding' | 'swing'): Extract<WindowMeasurement, { material: 'aluminium' }> {
  return { kind: 'Window', id: 'al-window', room: 'Комната', name: 'Алюминий', material: 'aluminium', profileId: 'aluminium-example',
    colorId: 'white', extensions: false, connectors: false, additionalWorks: [], windowType: 'double', widthMm: 2000, heightMm: 1000,
    plane: mode === 'sliding' ? { id: 'plane', mode, sections: [{ id: 'fixed', widthMm: 1000, openingType: 'fixed' }, { id: 'active', widthMm: 1000, openingType: 'sliding' }] }
      : { id: 'plane', mode, sections: [{ id: 'fixed', widthMm: 1000, openingType: 'fixed' }, { id: 'active', widthMm: 1000, openingType: 'turn', hingeSide: 'right' }] } };
}

describe('glazing pricing v2', () => {
  it('prices PVC base only with zero rates/percentages accepted', () => {
    const config = configuration(); pvc(config).productMarkupPercent = 0;
    config.installationRatesPerM2.pvc = 0;
    const price = priceInstalledGlazingVNext(input(), config, 100);
    expect(price).toMatchObject({ baseAmount: 20000, activityAmount: 0, colorAmount: 0, extensionAmount: 0,
      connectorAmount: 0, subtotal: 20000, markupAmount: 0, productPriceMinor: 2000000, installationPriceMinor: 0, totalMinor: 2000000 });
    pvc(config).basePricePerM2 = 0;
    expect(priceInstalledGlazingVNext(input(), config, 100).totalMinor).toBe(0);
  });

  it('keeps every percentage additive from base and applies product markup once', () => {
    const config = configuration(); pvc(config).extensionPercent = 7; pvc(config).connectorPercent = 11;
    const price = priceInstalledGlazingVNext(input({ colorId: 'laminated', extensions: true, connectors: true,
      activeAreas: [{ material: 'pvc', hardwareId: 'standard', areaM2: 0.5 }, { material: 'pvc', hardwareId: 'premium', areaM2: 1 }] }), config, 10);
    expect(price).toMatchObject({ baseAmount: 20000, activityAmount: 4000, colorAmount: 4000,
      extensionAmount: 1400, connectorAmount: 2200, subtotal: 31600, markupAmount: 6320,
      productPriceBeforeCommercialRounding: 37920, productPriceBeforeCommercialRoundingMinor: 3792000,
      productPriceMinor: 3792000, installationPriceBeforeCommercialRounding: 2000, installationPriceMinor: 200000, totalMinor: 3992000 });
  });

  it.each([[false, false, 0, 0], [true, false, 1000, 0], [false, true, 0, 1000], [true, true, 1000, 1000]] as const)
    ('uses explicit extension/connector signals %s/%s', (extensions, connectors, extensionAmount, connectorAmount) => {
      expect(priceInstalledGlazingVNext(input({ extensions, connectors }), configuration(), 100))
        .toMatchObject({ extensionAmount, connectorAmount, installationPriceMinor: 200000 });
    });

  it('installation ignores all product percentages, including percentages above 100', () => {
    const config = configuration();
    const before = priceInstalledGlazingVNext(input(), config, 100);
    const p = pvc(config);
    p.productMarkupPercent = 200; p.colorRules[1]!.colorPercent = 150; p.extensionPercent = 300; p.connectorPercent = 400;
    p.hardwareActivity[0]!.activityPercent = 500;
    const after = priceInstalledGlazingVNext(input({ colorId: 'laminated', extensions: true, connectors: true,
      activeAreas: [{ material: 'pvc', hardwareId: 'standard', areaM2: 2 }] }), config, 100);
    expect(after.installationPriceBeforeCommercialRoundingMinor).toBe(before.installationPriceBeforeCommercialRoundingMinor);
    expect(after.installationPriceMinor).toBe(before.installationPriceMinor);
    expect(after.productPriceMinor).toBeGreaterThan(before.productPriceMinor);
  });

  it.each([10, 50, 100] as const)('separately rounds product/installation at step %s RUB', (step) => {
    const config = configuration(); pvc(config).basePricePerM2 = step * 1.49; pvc(config).productMarkupPercent = 0;
    config.installationRatesPerM2.pvc = step * 0.49;
    const result = priceInstalledGlazingVNext(input({ totalAreaM2: 1 }), config, step);
    expect(result.productPriceBeforeCommercialRoundingMinor).toBe(step * 149);
    expect(result.installationPriceBeforeCommercialRoundingMinor).toBe(step * 49);
    expect(result.productPriceMinor).toBe(step * 100);
    expect(result.installationPriceMinor).toBe(0);
    expect(result.totalMinor).toBe(result.productPriceMinor + result.installationPriceMinor);
    expect(result.totalMinor).not.toBe(commercialRoundMinor(result.productPriceBeforeCommercialRoundingMinor + result.installationPriceBeforeCommercialRoundingMinor, step));
    pvc(config).basePricePerM2 = step * 1.5; config.installationRatesPerM2.pvc = step * 0.5;
    const halves = priceInstalledGlazingVNext(input({ totalAreaM2: 1 }), config, step);
    expect(halves.productPriceMinor).toBe(step * 200);
    expect(halves.installationPriceMinor).toBe(step * 100);
    expect(halves.totalMinor).toBe(step * 300);
  });

  it('does not round fractional money components or markup before completing the product', () => {
    const config = configuration(); const p = pvc(config);
    p.basePricePerM2 = 0.004; p.extensionPercent = 50; p.connectorPercent = 50; p.productMarkupPercent = 50;
    const result = priceInstalledGlazingVNext(input({ totalAreaM2: 1, extensions: true, connectors: true }), config, 10);
    expect(result.baseAmount).toBeCloseTo(0.004, 12);
    expect(result.extensionAmount).toBeCloseTo(0.002, 12);
    expect(result.connectorAmount).toBeCloseTo(0.002, 12);
    expect(result.subtotal).toBeCloseTo(0.008, 12);
    expect(result.markupAmount).toBeCloseTo(0.004, 12);
    expect(result.productPriceBeforeCommercialRoundingMinor).toBe(1);
  });

  it('retains fractions across hardware entries and uses decimal half-up at the money boundary', () => {
    const config = configuration(); const p = pvc(config);
    p.basePricePerM2 = 1.005; p.productMarkupPercent = 0;
    expect(priceInstalledGlazingVNext(input({ totalAreaM2: 1 }), config, 10).productPriceBeforeCommercialRoundingMinor).toBe(101);
    p.basePricePerM2 = 0.01; p.hardwareActivity.forEach((relation) => { relation.activityPercent = 100; });
    const result = priceInstalledGlazingVNext(input({ totalAreaM2: 1, activeAreas: [
      { material: 'pvc', hardwareId: 'standard', areaM2: 0.25 }, { material: 'pvc', hardwareId: 'premium', areaM2: 0.25 },
    ] }), config, 10);
    expect(result.activityAmount).toBeCloseTo(0.005, 12);
    expect(result.productPriceBeforeCommercialRoundingMinor).toBe(2);
  });

  it.each([-1, NaN, Infinity])('rejects invalid rate/percentage %s', (invalid) => {
    for (const mutate of [
      (c: GlazingConfiguration) => { pvc(c).basePricePerM2 = invalid; },
      (c: GlazingConfiguration) => { pvc(c).productMarkupPercent = invalid; },
      (c: GlazingConfiguration) => { pvc(c).hardwareActivity[0]!.activityPercent = invalid; },
      (c: GlazingConfiguration) => { pvc(c).colorRules[0]!.colorPercent = invalid; },
      (c: GlazingConfiguration) => { pvc(c).extensionPercent = invalid; },
      (c: GlazingConfiguration) => { pvc(c).connectorPercent = invalid; },
      (c: GlazingConfiguration) => { aluminium(c).activity.swingPercent = invalid; },
      (c: GlazingConfiguration) => { c.installationRatesPerM2.pvc = invalid; },
    ]) { const config = configuration(); mutate(config); expect(() => priceInstalledGlazingVNext(input(), config, 100)).toThrow(); }
  });

  it.each(['profile', 'hardware', 'relation', 'color', 'colorRule', 'duplicateProfile', 'installation'] as const)
    ('rejects missing/incompatible/ambiguous configuration: %s', (missing) => {
      const config = configuration(); const args = input({ activeAreas: [{ material: 'pvc', hardwareId: 'standard', areaM2: 1 }] });
      if (missing === 'profile') args.profileId = 'aluminium-example';
      if (missing === 'hardware') args.activeAreas = [{ material: 'pvc', hardwareId: 'missing', areaM2: 1 }];
      if (missing === 'relation') pvc(config).hardwareActivity = [{ hardwareId: 'premium', activityPercent: 30 }];
      if (missing === 'color') args.colorId = 'missing';
      if (missing === 'colorRule') pvc(config).colorRules = [];
      if (missing === 'duplicateProfile') config.profiles = [...config.profiles, config.profiles[0]!];
      if (missing === 'installation') Object.assign(config.installationRatesPerM2, { pvc: undefined });
      expect(() => priceInstalledGlazingVNext(args, config, 100)).toThrow();
    });

  it.each([0, -1, NaN, Infinity])('rejects invalid total area %s', (totalAreaM2) => {
    expect(() => priceInstalledGlazingVNext(input({ totalAreaM2 }), configuration(), 100)).toThrow();
  });
  it('rejects invalid active areas, mechanisms, options and rounding steps', () => {
    for (const areaM2 of [0, -1, NaN, Infinity, 3]) expect(() => priceInstalledGlazingVNext(input({
      activeAreas: [{ material: 'pvc', hardwareId: 'standard', areaM2 }],
    }), configuration(), 100)).toThrow();
    expect(() => priceInstalledGlazingVNext(input({ activeAreas: [{ material: 'aluminium', mode: 'swing', areaM2: 1 }] }), configuration(), 100)).toThrow();
    expect(() => priceInstalledGlazingVNext(input({ extensions: undefined as unknown as boolean }), configuration(), 100)).toThrow();
    expect(() => priceInstalledGlazingVNext(input(), configuration(), 25 as CommercialRoundingStepRub)).toThrow();
    expect(() => priceInstalledGlazingVNext(input({ material: 'aluminium', profileId: 'aluminium-example',
      activeAreas: [{ material: 'aluminium', areaM2: 1, mode: 'invalid' as 'swing' }] }), configuration(), 100)).toThrow();
  });

  it('rejects product/installation overflow and unsafe sum of individually safe client lines', () => {
    const config = configuration(); const p = pvc(config); p.productMarkupPercent = 0;
    p.basePricePerM2 = Number.MAX_VALUE;
    expect(() => priceInstalledGlazingVNext(input(), config, 100)).toThrow();
    p.basePricePerM2 = 1; config.installationRatesPerM2.pvc = Number.MAX_VALUE;
    expect(() => priceInstalledGlazingVNext(input(), config, 100)).toThrow();
    p.basePricePerM2 = 5e13; config.installationRatesPerM2.pvc = 5e13;
    expect(() => priceInstalledGlazingVNext(input({ totalAreaM2: 1 }), config, 100)).toThrow();
    config.installationRatesPerM2.pvc = 0; p.basePricePerM2 = 90071992547409.9;
    // Safe before the commercial boundary, unsafe after rounding up to 10 RUB.
    expect(() => priceInstalledGlazingVNext(input({ totalAreaM2: 1 }), config, 10)).toThrow();
  });
});

describe('vNext glazing estimate application / geometry', () => {
  it('resolves hardware for each lower PVC section and excludes fixed transom', () => {
    const result = estimateGlazingVNext(window(), configuration(), 100);
    expect(result.geometry).toMatchObject({ totalAreaM2: 4, activeAreaM2: 3 });
    expect(result.price.activityAmount).toBe(1125 * 2 + 1875 * 3);
    const fixed = window(); fixed.plane.sections = [{ id: 'left', widthMm: 750, openingType: 'fixed' }, fixed.plane.sections[1]!];
    expect(estimateGlazingVNext(fixed, configuration(), 100).price.activityAmount).toBe(5625);
  });
  it('prices only active upper balcony sections; lower sandwich uses the base total-area rate', () => {
    const result = estimateGlazingVNext(balcony(), configuration(), 100);
    expect(result.geometry).toMatchObject({ totalAreaM2: 4, activeAreaM2: 2.25, sandwichAreaM2: 1 });
    expect(result.price).toMatchObject({ baseAmount: 40000, activityAmount: 6750, installationPriceBeforeCommercialRounding: 4000 });
  });
  it('prices block windows/door by real areas and hardware, independent of door placement', () => {
    const block: Extract<WindowMeasurement, { material: 'pvc'; windowType: 'balconyBlock' }> = {
      kind: 'Window', id: 'block', room: 'Комната', name: 'Блок', material: 'pvc', profileId: 'pvc-standard', colorId: 'white',
      extensions: false, connectors: false, additionalWorks: [], windowType: 'balconyBlock', windowHeightMm: 1500,
      doorWidthMm: 700, doorHeightMm: 2200, doorPosition: 'left',
      door: { id: 'door', openingType: 'turn', hingeSide: 'left', hardwareId: 'premium' },
      plane: { id: 'plane', sections: [{ id: 'one', widthMm: 600, openingType: 'turn', hingeSide: 'right', hardwareId: 'standard' },
        { id: 'two', widthMm: 800, openingType: 'fixed' }] },
    };
    const result = estimateGlazingVNext(block, configuration(), 100);
    expect(result.geometry.totalAreaM2).toBeCloseTo(3.64, 12);
    expect(result.price.activityAmount).toBeCloseTo(6420, 10);
    for (const doorPosition of ['middle', 'right'] as const) expect(estimateGlazingVNext({ ...block, doorPosition }, configuration(), 100).price).toEqual(result.price);
    const one = { ...block, plane: { id: 'plane', sections: [{ id: 'one', widthMm: 1400, openingType: 'fixed' as const }] } };
    expect(estimateGlazingVNext(one, configuration(), 100).geometry.totalAreaM2).toBeCloseTo(3.64, 12);
    expect(() => estimateGlazingVNext({ ...one, doorPosition: 'middle' }, configuration(), 100)).toThrow();
  });
  it.each(['sliding', 'swing'] as const)('aluminium %s uses its system percentage without any PVC hardware catalog', (mode) => {
    const config = configuration(); config.hardware = []; config.profiles = [aluminium(config)];
    const result = estimateGlazingVNext(alWindow(mode), config, 100);
    expect(result.geometry).toMatchObject({ totalAreaM2: 2, activeAreaM2: 1 });
    expect(result.price).toMatchObject({ activityAmount: mode === 'sliding' ? 1200 : 2000,
      installationPriceBeforeCommercialRounding: 1600, installationPriceMinor: 160000 });
    expect(result.geometry).toHaveProperty('sections');
    if ('sections' in result.geometry) expect(result.geometry.sections[1]!.symbols[0]!.kind).toBe(mode === 'sliding' ? 'sliding' : 'turn');
  });
  it('supports different aluminium mechanisms on separate balcony planes and only upper activity', () => {
    const al: Extract<BalconyMeasurement, { material: 'aluminium' }> = {
      kind: 'Balcony', id: 'al-balcony', room: 'Балкон', name: 'L', material: 'aluminium', profileId: 'aluminium-example', colorId: 'white',
      extensions: false, connectors: false, additionalWorks: [], balconyType: 'L', side: 'right', planes: [
        { name: 'Фасад', position: 'facade', widthMm: 2000, heightMm: 2000, sectionCount: 2,
          levels: { mode: 'twoLevel', splitHeightMm: 1000, lowerFill: 'glass' }, ...alWindow('sliding').plane, id: 'facade' },
        { name: 'Справа', position: 'right', widthMm: 2000, heightMm: 1000, sectionCount: 2,
          levels: { mode: 'oneLevel' }, ...alWindow('swing').plane, id: 'right' },
      ],
    };
    expect(estimateGlazingVNext(al, configuration(), 100).price).toMatchObject({ baseAmount: 48000, activityAmount: 3200 });
  });
  it.each(['sliding', 'swing'] as const)('supports aluminium %s block doors under the same mechanism', (mode) => {
    const base = alWindow(mode);
    if (base.windowType === 'balconyBlock') throw new Error('Fixture');
    const block = { ...base, windowType: 'balconyBlock', widthMm: undefined, heightMm: undefined, doorPosition: 'right',
      windowHeightMm: 1000, doorWidthMm: 700, doorHeightMm: 2200,
      door: mode === 'sliding' ? { id: 'door', openingType: 'sliding' } : { id: 'door', openingType: 'turn', hingeSide: 'left' },
    } as WindowMeasurement;
    const result = estimateGlazingVNext(block, configuration(), 100);
    expect(result.geometry.totalAreaM2).toBeCloseTo(3.54, 12);
    expect(result.price.activityAmount).toBeCloseTo(2.54 * 8000 * (mode === 'sliding' ? 0.15 : 0.25), 10);
  });
  it.each(['sliding', 'swing'] as const)('rejects aluminium tilt_turn, mixed %s openings and PVC hardware', (mode) => {
    for (const invalid of [
      { openingType: 'tilt_turn', hingeSide: 'left' },
      mode === 'sliding' ? { openingType: 'turn', hingeSide: 'left' } : { openingType: 'sliding' },
      { openingType: mode === 'sliding' ? 'sliding' : 'turn', hingeSide: mode === 'swing' ? 'left' : undefined, hardwareId: 'standard' },
    ]) {
      const value = alWindow(mode); Object.assign(value.plane.sections[1]!, invalid);
      expect(() => estimateGlazingVNext(value, configuration(), 100)).toThrow();
    }
  });
  it('retains shape validation for windows and balconies; does not repair widths', () => {
    const wrongWidth = window(); wrongWidth.widthMm += 0.000001;
    expect(() => estimateGlazingVNext(wrongWidth, configuration(), 100)).toThrow();
    const wrongTransom = window(); wrongTransom.transom!.heightMm = wrongTransom.heightMm;
    expect(() => estimateGlazingVNext(wrongTransom, configuration(), 100)).toThrow();
    const wrongLevels = balcony(); wrongLevels.planes[0]!.levels = { mode: 'twoLevel', splitHeightMm: 2000, lowerFill: 'glass' };
    expect(() => estimateGlazingVNext(wrongLevels, configuration(), 100)).toThrow();
    const wrongPvc = window(); Object.assign(wrongPvc.plane.sections[0]!, { hardwareId: undefined });
    expect(() => estimateGlazingVNext(wrongPvc, configuration(), 100)).toThrow();
    const wrongFixed = window(); Object.assign(wrongFixed.plane.sections[0]!, { openingType: 'fixed' });
    expect(() => estimateGlazingVNext(wrongFixed, configuration(), 100)).toThrow();
  });
  it('uses hidden saved identities, makes independent snapshots and is JSON serializable', () => {
    const config = configuration(); config.profiles[0]!.status = 'hidden'; config.hardware.forEach((hardware) => { hardware.status = 'hidden'; });
    config.colors[0]!.status = 'hidden'; const measurement = window();
    const result = estimateGlazingVNext(measurement, config, 50);
    const original = JSON.parse(JSON.stringify(result));
    pvc(config).basePricePerM2 = 1; measurement.plane.sections[0]!.widthMm = 1;
    expect(result).toEqual(original);
    expect(estimateGlazingVNext(result.measurement, result.configuration, result.commercialRoundingStepRub).price).toEqual(result.price);
  });
  it('Calculation v4 entry point uses only that measurement snapshot and calculation rounding step', () => {
    const config = configuration(); pvc(config).basePricePerM2 = 10.4; pvc(config).productMarkupPercent = 0; config.installationRatesPerM2.pvc = 0;
    pvc(config).hardwareActivity.forEach((relation) => { relation.activityPercent = 0; });
    const measurement = window();
    const calculation: Calculation = { schemaVersion: 4, id: 'calculation', createdAt: '2026-10-07T00:00:00Z', updatedAt: '2026-10-07T00:00:00Z',
      measurements: [measurement], configuration: { [measurement.id]: { kind: 'Window', configuration: config } },
      orderAdditionalWorks: [], discount: { mode: 'none' }, commercialRoundingStepRub: 10 };
    expect(estimateCalculationGlazingVNext(calculation, measurement.id).price.productPriceMinor).toBe(4000);
    expect(estimateCalculationGlazingVNext({ ...calculation, commercialRoundingStepRub: 50 }, measurement.id).price.productPriceMinor).toBe(5000);
    expect(estimateCalculationGlazingVNext({ ...calculation, commercialRoundingStepRub: 100 }, measurement.id).price.productPriceMinor).toBe(0);
    expect(() => estimateCalculationGlazingVNext(calculation, 'missing')).toThrow();
    expect(() => estimateCalculationGlazingVNext({ ...calculation, configuration: {} }, measurement.id)).toThrow();
    expect(() => estimateCalculationGlazingVNext({ ...calculation, measurements: [measurement, measurement] }, measurement.id)).toThrow();
    expect(() => estimateCalculationGlazingVNext({ ...calculation, configuration: { [measurement.id]: { kind: 'Balcony', configuration: config } } }, measurement.id)).toThrow();
  });
});
