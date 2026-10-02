import { expect, it } from 'vitest';
import { estimateWindow } from '../src/application/estimate/estimate-window';
import { estimateBalcony } from '../src/application/estimate/estimate-balcony';
import { balconyDraft, initializePlaneWidth } from '../src/application/estimate/balcony-editor';
import { createDefaultCalculatorSettings, createSettingsSnapshot } from '../src/application/settings/calculator-settings';
import { estimateCalculation } from '../src/application/estimate/calculation-service';
import { input, configuration, active } from './fixtures';
import { pack } from './order-fixtures';

it('charges Window installation on total area separately from product markups and additional works', () => {
  const config = { ...configuration, profiles: configuration.profiles.map((p) => ({ ...p, productMarkupPercent: 15, installationRatePerM2: 750.01 })) };
  const window = { ...input, lamination: 'two_sides' as const, sections: [active(1000)], additionalWorks: [{ id: 'work', name: 'Доставка', priceMinor: 10000 }] };
  const result = estimateWindow(window, config);
  expect(result.price.productPriceMinor).toBe(2415000);
  expect(result.price.installationPriceMinor).toBe(112502); // 1.5 × 750.01 RUB, half up to kopecks
  expect(result.basePriceMinor).toBe(2527502);
  expect(result.additionalWorksTotalMinor).toBe(10000);
  expect(result.measurementTotalMinor).toBe(2537502);
  expect(estimateCalculation(pack(result)).subtotalMinor).toBe(2537502);
  expect(estimateWindow(input, configuration).price.installationPriceMinor).toBe(0);
  for (const rate of [-1, NaN, Infinity, Number.MAX_VALUE, Number.MAX_SAFE_INTEGER / 100]) {
    expect(() => estimateWindow(input, { ...config, profiles: config.profiles.map((p) => ({ ...p, installationRatePerM2: rate })) })).toThrow();
  }
});

it('charges Balcony installation on all planes including fixed lower filling', () => {
  const settings = createDefaultCalculatorSettings();
  settings.glazing.profiles[0]!.installationRatePerM2 = 800;
  const draft = balconyDraft('balcony');
  const plane = { ...initializePlaneWidth(draft.planes[0]!, 1000), heightMm: 2000,
    levels: { mode: 'twoLevel' as const, splitHeightMm: 500, lowerFill: 'sandwich' as const } };
  const balcony = { ...draft, room: 'Балкон', name: 'Балкон', profileId: 'pvc', balconyType: 'L' as const, side: 'left' as const,
    planes: [{ ...plane, id: 'left', position: 'left' as const, name: 'Слева' }, plane],
    additionalWorks: [{ id: 'work', name: 'Доставка', priceMinor: 5000 }] };
  const result = estimateBalcony(balcony, createSettingsSnapshot(settings).glazing);
  expect(result.geometry.totalAreaM2).toBe(4);
  expect(result.geometry.activeAreaM2).toBe(0);
  expect(result.price.productPriceMinor).toBe(4600000);
  expect(result.price.installationPriceMinor).toBe(320000);
  expect(result.basePriceMinor).toBe(4920000);
  expect(result.additionalWorksTotalMinor).toBe(5000);
  expect(result.measurementTotalMinor).toBe(4925000);
});

it('changes installation only for new measurement snapshots when the global rate changes', () => {
  const settings = createDefaultCalculatorSettings();
  settings.glazing.profiles[0]!.installationRatePerM2 = 1000;
  const old = estimateWindow(input, createSettingsSnapshot(settings).glazing);
  const calculation = pack(old);
  settings.glazing.profiles[0]!.installationRatePerM2 = 2000;
  const next = estimateWindow({ ...input, id: 'new-window' }, createSettingsSnapshot(settings).glazing);
  expect(old.price.installationPriceMinor).toBe(150000);
  expect(next.price.installationPriceMinor).toBe(300000);
  expect(next.price.productPriceMinor).toBe(old.price.productPriceMinor);
  expect(next.basePriceMinor - old.basePriceMinor).toBe(150000);
  expect(estimateWindow(input, old.configuration).price).toEqual(old.price);
  expect(estimateCalculation(calculation).subtotalMinor).toBe(old.basePriceMinor);
});
