import { describe, expect, it } from 'vitest';
import { confirmExamplePrices, copyCalculatorSettings, createStarterCalculatorSettings } from '../src/domain/configuration/vnext/settings';
import { validateCalculatorSettings, validateFinishConfiguration } from '../src/domain/configuration/vnext/validate';
import type { CalculatorSettings, FinishConfiguration, FinishMaterialConfiguration, ProfileConfiguration } from '../src/domain/configuration/vnext/types';
import { copyAdditionalWorks, createAdditionalWorkSnapshot } from '../src/domain/works/vnext';
import { validateAluminiumPlane, validateAluminiumWindow, validateFinishMeasurement } from '../src/domain/measurements/vnext';
import type { AluminiumPlane, WindowFinishMeasurement, WindowMeasurement } from '../src/domain/measurements/vnext';
import { copyCalculation, copyMeasurementConfiguration } from '../src/domain/calculation-vnext';
import type { Calculation } from '../src/domain/calculation-vnext';

function pvc(settings: CalculatorSettings) {
  const profile = settings.glazing.profiles[0]!;
  if (profile.material !== 'pvc') throw new Error('Fixture');
  return profile;
}
function finish(): WindowFinishMeasurement {
  return { kind: 'WindowFinish', id: 'finish', name: 'Отделка', room: 'Кухня', widthMm: 1400, heightMm: 1500, depthMm: 210,
    side: 'interior', workType: 'interiorSlopes', selections: [{ element: 'slope', materialId: 'sandwich' }],
    additionalWorks: [], priceState: { mode: 'automatic' } };
}

describe('configuration vNext contracts', () => {
  it('creates independent complete starter Settings v2, with separate installation and activity relations', () => {
    const settings = createStarterCalculatorSettings();
    expect(settings.schemaVersion).toBe(2);
    expect(settings.commercialRoundingStepRub).toBe(100);
    expect(settings.glazing.installationRatesPerM2).toEqual({ pvc: 1000, aluminium: 800 });
    expect(pvc(settings).hardwareActivity.map((relation) => relation.activityPercent)).toEqual([20, 30]);
    expect(settings.glazing.profiles[1]).toMatchObject({ material: 'aluminium', activity: { slidingPercent: 15, swingPercent: 25 } });
    expect(pvc(settings)).not.toHaveProperty('activityPercent');
    expect(pvc(settings)).not.toHaveProperty('installationRatePerM2');
    pvc(settings).hardwareActivity[0]!.activityPercent = 99;
    settings.finish.materials[0]!.widthVariants[0]!.physicalWidthMm = 999;
    expect(pvc(createStarterCalculatorSettings()).hardwareActivity[0]!.activityPercent).toBe(20);
    expect(createStarterCalculatorSettings().finish.materials[0]!.widthVariants[0]!.physicalWidthMm).toBe(200);
  });

  it.each(['profiles', 'hardware', 'colors'] as const)('rejects duplicate or blank %s identities', (key) => {
    const settings = createStarterCalculatorSettings();
    const entries = settings.glazing[key];
    Object.assign(settings.glazing, { [key]: [...entries, entries[0]] });
    expect(() => validateCalculatorSettings(settings)).toThrow();
    Object.assign(settings.glazing, { [key]: entries });
    entries[0]!.id = ' ';
    expect(() => validateCalculatorSettings(settings)).toThrow();
  });

  it('rejects missing, duplicate or incompatible profile hardware relations', () => {
    const s = createStarterCalculatorSettings();
    pvc(s).hardwareActivity[0]!.hardwareId = 'missing';
    expect(() => validateCalculatorSettings(s)).toThrow();
    pvc(s).hardwareActivity[0]!.hardwareId = 'premium';
    expect(() => validateCalculatorSettings(s)).toThrow();
    pvc(s).hardwareActivity[0]!.hardwareId = 'standard';
    Object.assign(s.glazing.hardware[0]!, { material: 'aluminium' });
    expect(() => validateCalculatorSettings(s)).toThrow();
  });

  it.each(['pvcProfileId', 'aluminiumSystemId', 'hardwareId', 'colorId'] as const)('rejects missing and hidden default %s', (key) => {
    const s = createStarterCalculatorSettings();
    const id = s.defaults[key];
    s.defaults[key] = 'missing';
    expect(() => validateCalculatorSettings(s)).toThrow();
    s.defaults[key] = id;
    const entry = [...s.glazing.profiles, ...s.glazing.hardware, ...s.glazing.colors].find((item) => item.id === id)!;
    entry.status = 'hidden';
    expect(() => validateCalculatorSettings(s)).toThrow();
  });

  it('requires compatible defaults for profile, hardware and selected material/color', () => {
    const s = createStarterCalculatorSettings();
    pvc(s).hardwareActivity = [{ hardwareId: 'premium', activityPercent: 30 }];
    expect(() => validateCalculatorSettings(s)).toThrow();
    s.defaults.hardwareId = 'premium';
    expect(() => validateCalculatorSettings(s)).not.toThrow();
    s.defaults.material = 'aluminium'; s.defaults.colorId = 'laminated';
    expect(() => validateCalculatorSettings(s)).toThrow();
    s.defaults.colorId = 'white';
    expect(() => validateCalculatorSettings(s)).not.toThrow();
    s.defaults.pvcProfileId = s.defaults.aluminiumSystemId;
    expect(() => validateCalculatorSettings(s)).toThrow();
  });

  it('allows hidden nondefaults and retains hidden entries in independent snapshots', () => {
    const s = createStarterCalculatorSettings();
    s.glazing.hardware[1]!.status = 'hidden';
    expect(() => validateCalculatorSettings(s)).not.toThrow();
    s.glazing.profiles[0]!.status = 'hidden';
    const snapshot = copyMeasurementConfiguration({ kind: 'Window', configuration: s.glazing });
    expect(snapshot.configuration).toEqual(s.glazing);
    pvc(s).hardwareActivity[0]!.activityPercent = 200;
    s.glazing.colors[0]!.materials = ['aluminium'];
    s.glazing.installationRatesPerM2.pvc = 1;
    expect(snapshot.configuration).not.toEqual(s.glazing);
    expect(snapshot.configuration).toMatchObject({ profiles: [{ status: 'hidden', hardwareActivity: [{ activityPercent: 20 }, { activityPercent: 30 }] }, {}] });
  });

  it.each([-1, NaN, Infinity])('rejects invalid rates/percentages %s', (invalid) => {
    for (const mutate of [
      (s: CalculatorSettings) => { pvc(s).hardwareActivity[0]!.activityPercent = invalid; },
      (s: CalculatorSettings) => { s.glazing.installationRatesPerM2.aluminium = invalid; },
      (s: CalculatorSettings) => { pvc(s).connectorPercent = invalid; },
      (s: CalculatorSettings) => { pvc(s).extensionPercent = invalid; },
      (s: CalculatorSettings) => { pvc(s).colorRules[0]!.colorPercent = invalid; },
      (s: CalculatorSettings) => { pvc(s).productMarkupPercent = invalid; },
      (s: CalculatorSettings) => { const p = s.glazing.profiles[1]!; if (p.material === 'aluminium') p.activity.swingPercent = invalid; },
      (s: CalculatorSettings) => { s.finish.materials[0]!.installerRatePerRunningMeter = invalid; },
      (s: CalculatorSettings) => { s.finish.baseInstallerPayByWorkType.dripOnly = invalid; },
      (s: CalculatorSettings) => { s.finish.allowances.drip.depthMm = invalid; },
      (s: CalculatorSettings) => { s.finish.finishMarkupPercent = invalid; },
      (s: CalculatorSettings) => { s.finish.materials[0]!.widthVariants[0]!.purchaseCostPerRunningMeter = invalid; },
    ]) {
      const s = createStarterCalculatorSettings(); mutate(s);
      expect(() => validateCalculatorSettings(s)).toThrow();
    }
  });

  it('accepts zero rates and percentages above 100, validates version/rounding/status/metadata', () => {
    const s = createStarterCalculatorSettings();
    pvc(s).basePricePerM2 = 0; pvc(s).hardwareActivity[0]!.activityPercent = 150;
    s.finish.finishMarkupPercent = 200; s.glazing.installationRatesPerM2.pvc = 0;
    expect(() => validateCalculatorSettings(s)).not.toThrow();
    for (const patch of [{ schemaVersion: 1 }, { commercialRoundingStepRub: 25 }, { pricesConfirmed: 'yes' }, { example: { origin: 'unknown', containsExamplePrices: true } }]) {
      expect(() => validateCalculatorSettings(Object.assign(copyCalculatorSettings(s), patch))).toThrow();
    }
    Object.assign(s.glazing.hardware[0]!, { status: 'deleted' });
    expect(() => validateCalculatorSettings(s)).toThrow();
  });

  it('keeps example metadata independent from explicit confirmation; copying and price edits preserve confirmation', () => {
    const initial = createStarterCalculatorSettings();
    expect(initial.example).toEqual({ origin: 'starter', containsExamplePrices: true });
    expect(copyCalculatorSettings(initial).pricesConfirmed).toBe(false);
    const confirmed = confirmExamplePrices(initial);
    pvc(confirmed).basePricePerM2 = 123;
    expect(copyCalculatorSettings(confirmed).pricesConfirmed).toBe(true);
    expect(initial.pricesConfirmed).toBe(false);
    expect(createStarterCalculatorSettings().pricesConfirmed).toBe(false);
    const copy = copyCalculatorSettings(confirmed); copy.example.origin = 'custom';
    expect(confirmed.example.origin).toBe('starter');
  });
});

describe('finishing contracts', () => {
  it('separates physical width, usable actual depth, reserve, allowances, material rates and work base pay', () => {
    const s = createStarterCalculatorSettings();
    expect(s.finish.materials[0]!.widthVariants[0]).toMatchObject({ physicalWidthMm: 200, maxUsableActualDepthMm: 220 });
    expect(s.finish.reservePercent).toBe(20);
    expect(Object.keys(s.finish.baseInstallerPayByWorkType)).toHaveLength(6);
    const copy = copyMeasurementConfiguration({ kind: 'WindowFinish', configuration: s.finish });
    s.finish.allowances.sill.lengthMm = 999;
    s.finish.baseInstallerPayByWorkType.sillOnly = 999;
    s.finish.materials[0]!.widthVariants[0]!.maxUsableActualDepthMm = 999;
    expect(copy.configuration).not.toEqual(s.finish);
  });

  it.each(['purchaseStepMm', 'purchaseStep', 'materialMarkupPercent', 'wastePercent'])('rejects old field %s at runtime and excludes it in types', (key) => {
    const f = createStarterCalculatorSettings().finish;
    expect(() => validateFinishConfiguration({ ...f, [key]: 10 })).toThrow();
    Object.assign(f.materials[0]!, { [key]: 10 });
    expect(() => validateFinishConfiguration(f)).toThrow();
    // Compile-time contract guards: these fields must never reappear in vNext.
    // @ts-expect-error purchase steps are absent
    const step: FinishConfiguration['purchaseStepMm'] = 1;
    // @ts-expect-error separate material markup is absent
    const markup: FinishMaterialConfiguration['materialMarkupPercent'] = 1;
    // @ts-expect-error per-profile installation is absent
    const installation: ProfileConfiguration['installationRatePerM2'] = 1;
    expect([step, markup, installation]).toEqual([1, 1, 1]);
  });

  it('rejects invalid finish widths, duplicate materials/variants, reserve and incompatible side/element', () => {
    for (const mutate of [
      (f: FinishConfiguration) => { Object.assign(f, { reservePercent: 21 }); },
      (f: FinishConfiguration) => { f.materials[0]!.widthVariants[0]!.physicalWidthMm = 0; },
      (f: FinishConfiguration) => { f.materials[0]!.widthVariants[0]!.maxUsableActualDepthMm = NaN; },
      (f: FinishConfiguration) => { f.materials = [...f.materials, f.materials[0]!]; },
      (f: FinishConfiguration) => { f.materials[0]!.widthVariants = [...f.materials[0]!.widthVariants, f.materials[0]!.widthVariants[0]!]; },
      (f: FinishConfiguration) => { f.materials[0]!.widthVariants = []; },
      (f: FinishConfiguration) => { f.materials[1]!.side = 'exterior'; },
    ]) { const f = createStarterCalculatorSettings().finish; mutate(f); expect(() => validateFinishConfiguration(f)).toThrow(); }
  });

  it('supports all six finish work contracts and rejects side/composition mismatches', () => {
    for (const [side, workType, elements] of [
      ['interior', 'interiorSlopes', ['slope']], ['interior', 'interiorSlopesAndSill', ['slope', 'sill']], ['interior', 'sillOnly', ['sill']],
      ['exterior', 'exteriorSlopes', ['slope']], ['exterior', 'exteriorSlopesAndDrip', ['slope', 'drip']], ['exterior', 'dripOnly', ['drip']],
    ] as const) {
      const value = Object.assign(finish(), { side, workType, selections: elements.map((element) => ({ element, materialId: 'material' })) });
      expect(() => validateFinishMeasurement(value)).not.toThrow();
    }
    expect(() => validateFinishMeasurement(Object.assign(finish(), { side: 'exterior' }))).toThrow();
    expect(() => validateFinishMeasurement({ ...finish(), selections: [] })).toThrow();
    expect(() => validateFinishMeasurement({ ...finish(), selections: [...finish().selections, ...finish().selections] })).toThrow();
  });

  it('allows automatic/unresolved/manual states without manufacturing a cost basis', () => {
    expect(() => validateFinishMeasurement(finish())).not.toThrow();
    expect(() => validateFinishMeasurement({ ...finish(), priceState: { mode: 'priceRequiresClarification', reason: 'Нет ширины для 420 мм' } })).not.toThrow();
    for (const confirmation of ['confirmed', 'needsConfirmation'] as const) {
      expect(() => validateFinishMeasurement({ ...finish(), priceState: { mode: 'manual', finalPriceMinor: 12345, confirmation } })).not.toThrow();
    }
    for (const price of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => validateFinishMeasurement({ ...finish(), priceState: { mode: 'manual', finalPriceMinor: price, confirmation: 'confirmed' } })).toThrow();
    }
    expect(() => validateFinishMeasurement({ ...finish(), priceState: { mode: 'priceRequiresClarification', reason: '' } })).toThrow();
  });
});

describe('aluminium modes and works', () => {
  it('binds balcony block door openings to the plane mechanism in types and runtime validation', () => {
    const sliding: Extract<WindowMeasurement, { material: 'aluminium' }> = {
      kind: 'Window', windowType: 'balconyBlock', id: 'block', room: 'Кухня', name: 'Блок', material: 'aluminium',
      profileId: 'aluminium-example', colorId: 'white', extensions: false, connectors: false, additionalWorks: [],
      plane: { id: 'plane', mode: 'sliding', sections: [{ id: 's', widthMm: 700, openingType: 'sliding' }] },
      door: { id: 'door', openingType: 'sliding' }, doorPosition: 'right', doorWidthMm: 700, doorHeightMm: 2200, windowHeightMm: 1500,
    };
    expect(() => validateAluminiumWindow(sliding)).not.toThrow();
    expect(() => validateAluminiumWindow({ ...sliding, door: { id: 'door', openingType: 'fixed' } })).not.toThrow();
    // @ts-expect-error A sliding plane cannot have a turn door
    const mixed: Extract<WindowMeasurement, { material: 'aluminium' }> = { ...sliding, door: { id: 'door', openingType: 'turn', hingeSide: 'left' } };
    expect(() => validateAluminiumWindow(mixed)).toThrow('механизмом');
    const swing: Extract<WindowMeasurement, { material: 'aluminium' }> = { ...sliding,
      plane: { id: 'plane', mode: 'swing', sections: [{ id: 's', widthMm: 700, openingType: 'turn', hingeSide: 'right' }] },
      door: { id: 'door', openingType: 'turn', hingeSide: 'left' },
    };
    expect(() => validateAluminiumWindow(swing)).not.toThrow();
    // @ts-expect-error A swing plane cannot have a sliding door
    const mixedSwing: Extract<WindowMeasurement, { material: 'aluminium' }> = { ...swing, door: { id: 'door', openingType: 'sliding' } };
    expect(() => validateAluminiumWindow(mixedSwing)).toThrow('механизмом');
    expect(() => validateAluminiumWindow({ ...sliding, door: { id: 's', openingType: 'fixed' } })).toThrow('уникальными');
    for (const door of [{ id: 'door', openingType: 'tilt_turn', hingeSide: 'left' },
      { id: 'door', openingType: 'sliding', hardwareId: 'standard' }]) {
      const corrupt = Object.assign({}, sliding, { door }) as Extract<WindowMeasurement, { material: 'aluminium' }>;
      expect(() => validateAluminiumWindow(corrupt)).toThrow();
    }
  });

  it('restricts aluminium openings by plane mode, rejects tilt_turn, mixed mode, hardware and invalid hinges', () => {
    const plane: AluminiumPlane = { id: 'p', mode: 'sliding', sections: [{ id: 's', widthMm: 700, openingType: 'sliding' }] };
    expect(() => validateAluminiumPlane(plane)).not.toThrow();
    expect(() => validateAluminiumPlane({ id: 'p', mode: 'swing', sections: [{ id: 's', widthMm: 700, openingType: 'turn', hingeSide: 'left' }] })).not.toThrow();
    for (const patch of [{ openingType: 'turn' }, { openingType: 'tilt_turn' }, { hingeSide: 'left' }, { hardwareId: 'standard' }, { widthMm: 0 }]) {
      const copy = { ...plane, sections: [Object.assign({ ...plane.sections[0]! }, patch)] } as AluminiumPlane;
      expect(() => validateAluminiumPlane(copy)).toThrow();
    }
    expect(() => validateAluminiumPlane({ ...plane, mode: 'swing' } as AluminiumPlane)).toThrow();
    expect(() => validateAluminiumPlane({ ...plane, sections: [...plane.sections, ...plane.sections] })).toThrow();
    // @ts-expect-error Aluminium has no tilt_turn contract
    const invalid: AluminiumPlane = { id: 'p', mode: 'swing', sections: [{ id: 's', widthMm: 1, openingType: 'tilt_turn', hingeSide: 'left' }] };
    expect(() => validateAluminiumPlane(invalid)).toThrow();
  });

  it('supports decimal quantities and presentation units; work snapshots survive catalog changes', () => {
    const entry = createStarterCalculatorSettings().additionalWorks[0]!;
    const work = createAdditionalWorkSnapshot(entry, 'work', 1.25);
    entry.unitPriceMinor = 99; entry.name = 'Новое имя'; entry.status = 'hidden';
    expect(work).toMatchObject({ name: 'Доставка', unitPriceMinor: 150000, quantity: 1.25, catalogId: 'delivery' });
    expect(() => createAdditionalWorkSnapshot(entry, 'next', 1)).toThrow();
    for (const quantity of [0, -1, NaN, Infinity]) expect(() => copyAdditionalWorks([{ ...work, quantity }])).toThrow();
    for (const unitPriceMinor of [-1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) expect(() => copyAdditionalWorks([{ ...work, unitPriceMinor }])).toThrow();
    expect(() => copyAdditionalWorks([{ ...work, unitPriceMinor: 0, quantity: 0.01 }])).not.toThrow();
    expect(() => copyAdditionalWorks([work, work])).toThrow();
    expect(() => copyAdditionalWorks([{ ...work, id: '' }])).toThrow();
    expect(() => copyAdditionalWorks([{ ...work, name: '' }])).toThrow();
    expect(() => copyAdditionalWorks([Object.assign({ ...work }, { unit: 'unknown' })])).toThrow();
  });
});

it('owns all nested Calculation v4 measurement/configuration/work snapshots independently', () => {
  const settings = createStarterCalculatorSettings();
  const measurement = finish();
  const work = createAdditionalWorkSnapshot(settings.additionalWorks[0]!, 'work', 2.5);
  const calculation: Calculation = { schemaVersion: 4, id: 'calc', name: 'Объект', createdAt: '2026-10-07T00:00:00Z', updatedAt: '2026-10-07T00:00:00Z',
    measurements: [measurement], configuration: { finish: { kind: 'WindowFinish', configuration: settings.finish } },
    commercialRoundingStepRub: 50, orderAdditionalWorks: [work], discount: { mode: 'percent', discountPercent: 5 } };
  const copy = copyCalculation(calculation);
  measurement.selections[0]!.materialId = 'changed'; work.quantity = 9;
  settings.finish.materials[0]!.widthVariants[0]!.purchaseCostPerRunningMeter = 999;
  calculation.discount = { mode: 'none' }; calculation.commercialRoundingStepRub = 10;
  expect(copy.measurements[0]).toMatchObject({ selections: [{ materialId: 'sandwich' }] });
  expect(copy.orderAdditionalWorks[0]!.quantity).toBe(2.5);
  expect(copy.configuration.finish!.configuration).toMatchObject({ materials: [{ widthVariants: [{ purchaseCostPerRunningMeter: 600 }, {}] }, {}, {}] });
  expect(copy.discount).toEqual({ mode: 'percent', discountPercent: 5 });
  expect(copy.commercialRoundingStepRub).toBe(50);
});
