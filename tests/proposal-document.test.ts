import { expect, it } from 'vitest';
import { createProposalDocument, ProposalDocumentError } from '../src/application/documents/create-proposal-document';
import {
  createCalculation, saveMeasurement, estimateCalculation, updateCalculationDiscount,
  updateOrderAdditionalWorks, updateCalculationDetails,
} from '../src/application/estimate/calculation-service';
import { estimateWindow } from '../src/application/estimate/estimate-window';
import { estimateBalcony } from '../src/application/estimate/estimate-balcony';
import { estimateFinish } from '../src/application/estimate/estimate-finish';
import type { MeasurementEstimate } from '../src/domain/measurement-estimate';
import type { Calculation } from '../src/domain/calculation';
import type { DocumentSettings } from '../src/domain/documents/document-settings';
import type { AdditionalWork } from '../src/domain/works/types';
import { demoFinishConfiguration } from '../src/domain/configuration/demo-finish-configuration';
import { input, blockInput, configuration, active, fixed } from './fixtures';

const date = '2026-10-02T07:00:00.000Z';
const metadata = { id: 'proposal-1', generatedAt: date };
const seller: DocumentSettings = { sellerName: 'Анна', sellerPhone: '+7 (913) 123-45-67' };
function order(...results: MeasurementEstimate[]): Calculation {
  return results.reduce((value, result) => saveMeasurement(value, result, date, 'add'), createCalculation('calculation', date));
}
function proposal(value: Calculation, settings = seller) {
  return createProposalDocument(value, estimateCalculation(value), settings, metadata);
}
function window(additionalWorks: readonly AdditionalWork[] = []) {
  return estimateWindow({ ...input, windowType: 'double', widthMm: 1400, transom: { heightMm: 300, openingType: 'fixed' },
    sections: [fixed(400, 'fixed'), active(1000, 'active', 'tilt_turn', 'right')], additionalWorks }, {
    ...configuration, profiles: configuration.profiles.map((p) => ({ ...p, installationRatePerM2: 500 })),
  });
}
function balcony(type: 'straight' | 'L' | 'U' = 'straight') {
  const positions = type === 'straight' ? ['facade'] as const : type === 'L' ? ['left', 'facade'] as const : ['left', 'facade', 'right'] as const;
  return estimateBalcony({
    id: 'balcony', room: 'Балкон', name: 'Остекление', balconyType: type, ...(type === 'L' ? { side: 'left' as const } : {}),
    material: 'pvc', profileId: 'pvc', lamination: 'one_side',
    planes: positions.map((position, i) => ({ id: position, name: position === 'facade' ? 'Фасад' : 'Боковая часть', position,
      widthMm: (i + 1) * 1000, heightMm: 2000, sectionCount: 2,
      sections: [active((i + 1) * 400, 'a'), fixed((i + 1) * 600, 'b')],
      levels: { mode: 'twoLevel', splitHeightMm: 800, lowerFill: 'sandwich' },
    })),
  }, configuration);
}
function finish() {
  return estimateFinish({ id: 'finish', room: 'Кухня', name: 'Отделка', widthMm: 1400, heightMm: 2100, depthMm: 250,
    selections: [{ finishType: 'slope', materialId: 'slope-advanced' }, { finishType: 'sill', materialId: 'sill-simple' }],
  }, demoFinishConfiguration);
}

it('prepares Window dimensions, names, opening labels and ready geometry with commercial prices', () => {
  const result = window();
  const document = proposal(order(result));
  expect(document).toMatchObject({ ...metadata, currency: 'RUB', seller, customer: {}, orderWorks: [],
    totals: { discountMode: 'none', discountAmountMinor: 0, finalTotalMinor: result.measurementTotalMinor } });
  const item = document.items[0]!;
  expect(item).toMatchObject({ id: input.id, kind: 'Window', name: input.name, room: input.room,
    description: 'Двустворчатое окно · ПВХ', dimensionsText: '1400 × 1500 мм',
    dimensions: [{ label: input.name, widthMm: 1400, heightMm: 1500 }], areaM2: result.geometry.totalAreaM2,
    materialLabel: 'ПВХ', profileName: 'Test', laminationLabel: 'Без ламинации',
    basePriceMinor: result.basePriceMinor, productPriceMinor: result.price.productPriceMinor,
    installationPriceMinor: 105000, measurementTotalMinor: result.measurementTotalMinor,
  });
  if (item.kind === 'WindowFinish') throw new Error('Expected glazing');
  expect(item.planes[0]!.sections.map((s) => [s.widthMm, s.heightMm])).toEqual([[400, 1200], [1000, 1200]]);
  expect(item.planes[0]!.sections[1]).toMatchObject({ openingLabel: 'Поворотно-откидное', hingeLabel: 'Петли справа', hardwareName: 'Test' });
  expect(item.planes[0]!.sections[1]!.symbols).toEqual(result.geometry.sections[1]!.symbols);
  expect(item.planes[0]!.transom).toMatchObject({ label: 'Глухая верхняя фрамуга', heightMm: 300 });
});

it('prepares balconyBlock with real area and ordered door/window geometry', () => {
  const item = proposal(order(estimateWindow(blockInput, configuration))).items[0]!;
  expect(item).toMatchObject({ kind: 'Window', description: 'Балконный блок · ПВХ' });
  if (item.kind === 'WindowFinish') throw new Error('Expected glazing');
  expect(item.areaM2).toBeCloseTo(3.64);
  expect(item.planes[0]!.bounds).toMatchObject({ widthMm: 2100, heightMm: 2200 });
  expect(item.planes[0]!.sections.map((s) => [s.label, s.xMm, s.widthMm, s.heightMm])).toEqual([
    ['Дверь', 0, 700, 2200], ['Секция 2', 700, 1400, 1500],
  ]);
  expect(item.dimensionsText).toContain('Дверь 700 × 2200 мм');
});

it.each(['straight', 'L', 'U'] as const)('prepares Balcony %s planes and lower sandwich tier from estimate', (type) => {
  const result = balcony(type);
  const item = proposal(order(result)).items[0]!;
  expect(item).toMatchObject({ kind: 'Balcony', areaM2: result.geometry.totalAreaM2,
    basePriceMinor: result.basePriceMinor, laminationLabel: 'Ламинация с одной стороны' });
  if (item.kind === 'WindowFinish') throw new Error('Expected glazing');
  expect(item.planes).toHaveLength(result.geometry.planes.length);
  item.planes.forEach((p, i) => {
    expect(p.bounds).toEqual(result.geometry.planes[i]!.bounds);
    expect(p.splitLine).toEqual(result.geometry.planes[i]!.splitLine);
    expect(p.sections.slice(2).map((s) => s.fillLabel)).toEqual(['Сэндвич-панель', 'Сэндвич-панель']);
    expect(p.sections[0]!.heightMm).toBe(1200);
  });
});

it('prepares aluminium sliding as a human-readable opening with existing symbol', () => {
  const original = balcony();
  const result = estimateBalcony({ ...original.measurement, material: 'aluminium', profileId: 'alu',
    planes: original.measurement.planes.map((p) => ({ ...p, sections: [{ id: 'slide', widthMm: p.widthMm, openingType: 'sliding' }], sectionCount: 1 })),
  }, { currency: 'RUB', profiles: [{ ...configuration.profiles[0]!, id: 'alu', material: 'aluminium' }], hardware: [] });
  const item = proposal(order(result)).items[0]!;
  if (item.kind === 'WindowFinish') throw new Error('Expected glazing');
  expect(item).toMatchObject({ materialLabel: 'Алюминий' });
  expect(item.planes[0]!.sections[0]).toMatchObject({ openingLabel: 'Раздвижное', symbols: result.geometry.planes[0]!.sections[0]!.symbols });
});

it('prepares WindowFinish using installed lengths and selected material names, without procurement internals', () => {
  const result = finish();
  const item = proposal(order(result)).items[0]!;
  expect(item).toMatchObject({ kind: 'WindowFinish', description: 'Откосы + Подоконник',
    dimensions: [{ label: 'Проём и глубина отделки', widthMm: 1400, heightMm: 2100, depthMm: 250 }],
    basePriceMinor: result.basePriceMinor, measurementTotalMinor: result.measurementTotalMinor,
    finishes: [
      { label: 'Откосы', materialName: 'Откосы — Advanced', installedLengthM: 5.6,
        pieces: [{ label: 'Верхний откос', installedLengthMm: 1400, depthMm: 250 },
          { label: 'Левый откос', installedLengthMm: 2100, depthMm: 250 }, { label: 'Правый откос', installedLengthMm: 2100, depthMm: 250 }] },
      { label: 'Подоконник', materialName: 'Подоконник — Simple', installedLengthM: 1.4 },
    ],
  });
  expect(item).not.toHaveProperty('areaM2');
});

it('preserves multiple item order, customer/object and both levels of additional works', () => {
  const works = [{ id: 'measurement-work', name: 'Демонтаж', priceMinor: 12345 }, { id: 'free', name: 'Консультация', priceMinor: 0 }];
  const w = estimateWindow({ ...input, additionalWorks: works }, configuration);
  let value = order(w, balcony(), finish());
  const orderWorks = [{ id: 'delivery', name: 'Доставка', priceMinor: 54321 }];
  value = updateOrderAdditionalWorks(value, orderWorks, date);
  const customer = { clientName: 'Иван', clientPhone: '1234567', objectAddress: 'ул. Ленина, 1' };
  value = updateCalculationDetails(value, customer, date);
  const document = proposal(value), estimate = estimateCalculation(value);
  expect(document.items.map((i) => i.kind)).toEqual(['Window', 'Balcony', 'WindowFinish']);
  expect(document.customer).toEqual(customer);
  expect(document.items[0]).toMatchObject({ additionalWorks: works, additionalWorksTotalMinor: 12345,
    basePriceMinor: w.basePriceMinor, measurementTotalMinor: w.basePriceMinor + 12345 });
  expect(document.orderWorks).toEqual(orderWorks);
  expect(document.totals).toMatchObject({ measurementsSubtotalMinor: estimate.measurementsSubtotalMinor,
    orderWorksTotalMinor: 54321, subtotalMinor: estimate.subtotalMinor, finalTotalMinor: estimate.finalTotalMinor });
});

it('copies percent discount from application including one-time decimal rounding and order works', () => {
  let value = updateOrderAdditionalWorks(order(window()), [{ id: 'work', name: 'Доставка', priceMinor: 1 }], date);
  value = updateCalculationDiscount(value, { mode: 'percent', discountPercent: 12.345 }, date);
  const estimate = estimateCalculation(value);
  expect(proposal(value).totals).toEqual({ measurementsSubtotalMinor: estimate.measurementsSubtotalMinor,
    orderWorksTotalMinor: estimate.orderWorksTotalMinor, subtotalMinor: estimate.subtotalMinor,
    discountMode: 'percent', discountPercent: 12.345, discountAmountMinor: estimate.discountAmountMinor, finalTotalMinor: estimate.finalTotalMinor });
});

it.each([0, 100000])('accepts confirmed fixed final price %s', (fixedFinalPriceMinor) => {
  const value = updateCalculationDiscount(order(window()), { mode: 'fixedFinalPrice', fixedFinalPriceMinor }, date);
  expect(proposal(value).totals).toMatchObject({ discountMode: 'fixedFinalPrice', finalTotalMinor: fixedFinalPriceMinor,
    discountAmountMinor: estimateCalculation(value).subtotalMinor - fixedFinalPriceMinor });
});

it('rejects needsConfirmation even when subtotal is unchanged', () => {
  const confirmed = updateCalculationDiscount(order(window()), { mode: 'fixedFinalPrice', fixedFinalPriceMinor: 100000 }, date);
  const pending = updateOrderAdditionalWorks(confirmed, [], date);
  expect(estimateCalculation(pending)).toMatchObject({ finalTotalMinor: null, isFinalized: false });
  expect(() => proposal(pending)).toThrow('Подтвердите итоговую фиксированную цену');
  expect(() => proposal(pending)).toThrow(ProposalDocumentError);
});

it('rejects fixed price with a stale confirmed subtotal even if supplied estimate claims confirmation', () => {
  const confirmed = updateCalculationDiscount(order(window()), { mode: 'fixedFinalPrice', fixedFinalPriceMinor: 100000 }, date);
  const estimate = estimateCalculation(confirmed);
  const changed = { ...confirmed, orderAdditionalWorks: [{ id: 'new', name: 'Новая работа', priceMinor: 100 }] };
  expect(() => createProposalDocument(changed, estimate, seller, metadata)).toThrow('Подтвердите');
});

it('takes all seller fields as a normalized detached snapshot and permits partial company details', () => {
  const settings = { ...seller, sellerName: ' Анна ', telegram: '@anna', whatsapp: '+79131234567', email: 'anna@example.com',
    companyName: 'Окна', inn: '123456789012', companyPhone: '8 383 123-45-67', website: 'https://example.com' };
  const document = proposal(order(window()), settings);
  expect(document.seller).toEqual({ ...settings, sellerName: 'Анна' });
  settings.sellerName = 'Другой продавец'; settings.companyName = 'Другая компания'; settings.email = 'other@example.com';
  expect(document.seller).toMatchObject({ sellerName: 'Анна', companyName: 'Окна', email: 'anna@example.com' });
  expect(proposal(order(window()), { ...seller, inn: '1234567890' }).seller).toEqual({ ...seller, inn: '1234567890' });
});

it('detaches all nested data from Calculation, tariff snapshots and supplied estimate', () => {
  const value = updateOrderAdditionalWorks(order(window([{ id: 'removal', name: 'Демонтаж', priceMinor: 321 }]), balcony(), finish()), [{ id: 'work', name: 'Доставка', priceMinor: 123 }], date);
  value.clientName = 'Иван';
  const estimate = estimateCalculation(value);
  const document = createProposalDocument(value, estimate, seller, metadata);
  const before = structuredClone(document);
  value.clientName = 'Другой клиент'; value.measurements[0]!.name = 'Другой замер';
  value.orderAdditionalWorks[0]!.priceMinor = 999;
  value.measurements[0]!.additionalWorks[0]!.name = 'Изменённая работа';
  const tariff = value.configuration[input.id]!;
  if (tariff.kind !== 'Window') throw new Error('Expected Window');
  tariff.configuration.profiles[0]!.name = 'Другой профиль'; tariff.configuration.profiles[0]!.basePricePerM2 = 999;
  const w = estimate.lines[0]!.result;
  w.measurement.additionalWorks[0]!.priceMinor = 999;
  if (!('bounds' in w.geometry)) throw new Error('Expected Window');
  w.geometry.bounds.widthMm = 99;
  w.geometry.sections[1]!.symbols[0]!.points[0]!.xMm = 99;
  const f = estimate.lines[2]!.result;
  if (!('normalizedMaterials' in f)) throw new Error('Expected Finish');
  f.normalizedMaterials[0]!.name = 'Другой материал'; f.geometry.materials[0]!.pieces[0]!.installedLengthMm = 99;
  expect(document).toEqual(before);
});

it('contains no internal pricing, sizing or source models anywhere in the DTO', () => {
  const document = proposal(order(window(), balcony(), finish()));
  const forbidden = new Set(['configuration', 'measurement', 'price', 'normalizedMaterials', 'hardwareId', 'profileId',
    'basePricePerM2', 'activityPercent', 'productMarkupPercent', 'materialMarkupPercent', 'purchasePricePerM',
    'materialPurchasePricePerM', 'purchaseLengthMm', 'requiredLengthMm', 'depthCoefficient', 'sizing', 'pricing']);
  function check(value: unknown) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) { expect(forbidden.has(key), key).toBe(false); check(child); }
  }
  check(document);
});

it('rejects stale measurement, tariffs, totals or geometry instead of issuing a misleading document', () => {
  const value = order(window()), estimate = estimateCalculation(value);
  const altered = structuredClone(value); altered.measurements[0]!.name = 'Изменено';
  expect(() => createProposalDocument(altered, estimate, seller, metadata)).toThrow('Смета не соответствует');
  const alteredTariffs = structuredClone(value), tariff = alteredTariffs.configuration[input.id]!;
  if (tariff.kind !== 'Window') throw new Error('Expected Window');
  tariff.configuration.profiles[0]!.basePricePerM2 += 1;
  expect(() => createProposalDocument(alteredTariffs, estimate, seller, metadata)).toThrow('Смета не соответствует');
  expect(() => createProposalDocument(value, { ...estimate, finalTotalMinor: 0 }, seller, metadata)).toThrow('Смета не соответствует');
  const geometryChanged = structuredClone(estimate), w = geometryChanged.lines[0]!.result;
  if (!('bounds' in w.geometry)) throw new Error('Expected Window');
  w.geometry.bounds.widthMm = 1;
  expect(() => createProposalDocument(value, geometryChanged, seller, metadata)).toThrow('Смета не соответствует');
});

it('validates seller settings, metadata and Calculation using existing validators', () => {
  const value = order(window()), estimate = estimateCalculation(value);
  expect(() => proposal(value, { sellerName: '', sellerPhone: '' })).toThrow('Заполните');
  expect(() => proposal(value, { ...seller, email: 'invalid' })).toThrow('Email');
  expect(() => createProposalDocument(value, estimate, seller, { ...metadata, id: ' ' })).toThrow('ID');
  expect(() => createProposalDocument(value, estimate, seller, { ...metadata, generatedAt: 'invalid' })).toThrow('дату');
  expect(() => createProposalDocument({ ...value, configuration: {} }, estimate, seller, metadata)).toThrow('тарифов');
});
