import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { createCalculation, saveMeasurement, measurementSnapshot, updateCalculationDetails, deleteMeasurement, updateOrderAdditionalWorks,
  estimateCalculation, updateCalculationDiscount, confirmFixedFinalPrice } from '../src/application/estimate/active-calculation';
import { estimateCalculationVNext } from '../src/application/estimate/estimate-calculation-vnext';
import { newWindow, newBalcony, setWindowType, setWindowWidth, setPlaneWidth, readyMeasurement, changeShape } from '../src/application/estimate/glazing-editor-v2';
import { newFinishDraft, readyFinishMeasurement, finishSeedFromBalconyBlock } from '../src/application/estimate/finish-editor-v2';
import { createStarterCalculatorSettings } from '../src/domain/configuration/vnext/settings';
import { createAdditionalWorkSnapshot } from '../src/domain/works/vnext';
import type { Measurement, WindowFinishMeasurement, BalconyMeasurement } from '../src/domain/measurements/vnext';
import type { Calculation } from '../src/domain/calculation-vnext';
import { CalculationSummary, CalculationTotal, MeasurementCard, calculationMoney, calculationMoneyInput } from '../src/ui/CalculationSummary';
import { ActiveOrderWorksEditor, ActiveAdditionalWorksEditor } from '../src/ui/ActiveAdditionalWorksEditor';
import { DiscountEditor } from '../src/ui/DiscountEditor';
import { rubInputToMinor } from '../src/application/settings/settings-v2';
import { ActiveDexieCalculationRepository } from '../src/infrastructure/storage/active-calculation-repository';
import { EstimatorDatabase } from '../src/infrastructure/storage/database';

const date = '2026-10-10T00:00:00.000Z';
const settings = createStarterCalculatorSettings();
const fresh = () => createCalculation('calculation', date, settings);
function window(block = false) {
  const value = setWindowWidth(setWindowType(newWindow(block ? 'block' : 'window', settings.glazing), block ? 'balconyBlock' : 'double'), 1400);
  return readyMeasurement(value.windowType === 'balconyBlock' ? { ...value, name: 'Выход на лоджию', room: 'Кухня', doorPosition: 'right', doorWidthMm: 700, doorHeightMm: 2200, windowHeightMm: 1500 }
    : { ...value, name: 'Большое окно', room: 'Спальня', heightMm: 1500 });
}
function balcony() {
  const value = changeShape(newBalcony('balcony', settings.glazing), 'L', 'left');
  return readyMeasurement({ ...value, name: 'Лоджия', room: 'Гостиная', planes: value.planes.map((plane) => ({ ...setPlaneWidth(plane, 1800, 3), heightMm: 2100 })) } as BalconyMeasurement);
}
function finish(mode: 'automatic' | 'manual' | 'unresolved' | 'unconfirmed' = 'automatic'): WindowFinishMeasurement {
  return readyFinishMeasurement({ ...newFinishDraft('finish', settings.finish), name: 'Отделка кухни', room: 'Кухня', widthMm: 1400, heightMm: 1500,
    depthMm: mode === 'unresolved' ? 9999 : 210, priceState: mode === 'manual' || mode === 'unconfirmed'
      ? { mode: 'manual', finalPriceMinor: 123456, confirmation: mode === 'manual' ? 'confirmed' : 'needsConfirmation' } : { mode: 'automatic' } });
}
function add(value: Calculation, measurement: Measurement) { return saveMeasurement(value, measurement, measurementSnapshot(value, measurement.kind), date, 'add'); }
function all() { return [window(), balcony(), window(true), finish()].reduce(add, fresh()); }
const html = (value: Calculation) => renderToStaticMarkup(<CalculationSummary totals={estimateCalculation(value)} />);
const amount = (minor: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(minor / 100);
const databases: EstimatorDatabase[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map((db) => db.delete())); });

describe('Feature 11 active calculation creation and metadata', () => {
  it('creates empty canonical v4 with an independent active Settings v2 snapshot', () => {
    const input = createStarterCalculatorSettings(); const value = createCalculation('new', date, input);
    expect(value.schemaVersion).toBe(4); expect(value.measurements).toEqual([]); expect(value.configuration).toEqual({});
    expect(value.settingsSnapshot).toEqual(input); input.glazing.profiles[0]!.basePricePerM2 = 999999;
    expect(value.settingsSnapshot!.glazing.profiles[0]!.basePricePerM2).not.toBe(999999);
  });
  it('persists metadata with the existing owner-scoped repository and restores active identity', async () => {
    const db = new EstimatorDatabase(`feature11-${crypto.randomUUID()}`); databases.push(db);
    const owner = new ActiveDexieCalculationRepository(db, 'owner'); const other = new ActiveDexieCalculationRepository(db, 'other');
    const value = updateCalculationDetails(all(), { clientName: 'Анна', clientPhone: '+7 900 1234567', objectAddress: 'Ленина, 7' }, date);
    await owner.save(value); expect(await owner.get(value.id)).toEqual(value); expect(await owner.getActiveId()).toBe(value.id);
    expect(await other.list()).toEqual([]); expect(await other.get(value.id)).toBeUndefined();
  });
  it('metadata edits preserve measurement order, snapshots, works, name and fixed price confirmation', () => {
    const initial = updateCalculationDiscount({ ...all(), name: 'Существующий расчёт' }, { mode: 'fixedFinalPrice', fixedFinalPriceMinor: 123456 }, date);
    const before = structuredClone(initial);
    const value = updateCalculationDetails(initial, { clientName: 'Иван', clientPhone: '123', objectAddress: 'Дом 5' }, date);
    expect(value).toEqual({ ...before, clientName: 'Иван', clientPhone: '123', objectAddress: 'Дом 5' }); expect(initial).toEqual(before);
  });
  it('supports an empty optional client/object context', () => {
    const value = updateCalculationDetails(fresh(), { clientName: '', clientPhone: '', objectAddress: '' }, date);
    expect(value.measurements).toEqual([]); expect(value.clientName).toBe('');
  });
});

describe('Feature 11 measurement flow and card results', () => {
  it.each(['window', 'balcony', 'block', 'finish'])('adds and edits %s without replacing ID or order', (id) => {
    const value = all(); const original = value.measurements.find((item) => item.id === id)!;
    const edited = saveMeasurement(value, { ...original, name: 'Обновлённый замер' }, value.configuration[id]!, date, 'edit');
    expect(edited.measurements.map((item) => item.id)).toEqual(['window', 'balcony', 'block', 'finish']);
    expect(edited.measurements.find((item) => item.id === id)!.name).toBe('Обновлённый замер');
    expect(value.measurements.find((item) => item.id === id)!.name).toBe(original.name);
  });
  it.each(['window', 'balcony', 'block', 'finish'])('removes only %s and recalculates through Feature 5', (id) => {
    const value = all(); const next = deleteMeasurement(value, id, date);
    expect(next.measurements).toEqual(value.measurements.filter((item) => item.id !== id));
    expect(next.configuration[id]).toBeUndefined(); expect(estimateCalculation(next)).toEqual(estimateCalculationVNext(next));
    expect(estimateCalculation(next).subtotalMinor).toBeLessThan(estimateCalculation(value).subtotalMinor!);
  });
  it.each(['finish', 'block'])('does not cascade deletion of %s across Add Finish bridge', (id) => {
    const block = window(true); const seed = finishSeedFromBalconyBlock(block);
    const separate = readyFinishMeasurement({ ...newFinishDraft('finish', settings.finish, seed), depthMm: 210 });
    const value = add(add(fresh(), block), separate); const next = deleteMeasurement(value, id, date);
    expect(next.measurements.map((item) => item.id)).toEqual([id === 'finish' ? 'block' : 'finish']);
  });
  it.each(['window', 'balcony', 'block', 'finish'])('%s card renders canonical total without global settings', (id) => {
    const line = estimateCalculation(all()).measurements.find((item) => item.measurementId === id)!;
    const markup = renderToStaticMarkup(<MeasurementCard line={line} />);
    expect(markup).toContain(amount(line.measurementTotalMinor!)); expect(markup).toContain(line.result.measurement.name);
    if (id === 'window') { expect(markup).toContain('1400 × 1500 мм'); expect(markup).toContain('VEKA Softline 70'); }
    if (id === 'balcony') { expect(markup).toContain('Г-образный'); expect(markup).toContain('ПВХ'); }
    if (id === 'block') { expect(markup).toContain('Балконный блок'); expect(markup).toContain('Дверь 700 × 2200'); }
    if (id === 'finish') expect(markup).toContain('Цена рассчитана автоматически');
  });
  it.each(['manual', 'unresolved', 'unconfirmed'] as const)('renders %s finish state faithfully', (mode) => {
    const line = estimateCalculation(add(fresh(), finish(mode))).measurements[0]!;
    const markup = renderToStaticMarkup(<MeasurementCard line={line} />);
    if (mode === 'manual') { expect(markup).toContain('Цена задана вручную'); expect(markup).toContain(amount(123456)); }
    else { expect(markup).toContain('Нужно уточнить цену отделки'); expect(markup).not.toContain('card-price'); }
  });
});

describe('Feature 11 order Additional Works', () => {
  it('uses an independent configured work snapshot, decimal quantity and canonical client line', () => {
    const entry = structuredClone(settings.additionalWorks[0]!); const work = createAdditionalWorkSnapshot(entry, 'delivery', 1.25);
    const value = updateOrderAdditionalWorks(all(), [work], date); entry.unitPriceMinor = 999999;
    const totals = estimateCalculation(value); const line = totals.orderAdditionalWorkLines[0]!;
    expect(line.work).toEqual(work); expect(line.location).toEqual({ scope: 'order' });
    const markup = html(value); expect(markup).toContain(amount(line.clientPriceMinor)); expect(markup).toContain('1.25 ед.');
    const edited = updateOrderAdditionalWorks(value, [{ ...work, quantity: 2.5 }], date);
    expect(estimateCalculation(edited).orderWorksTotalMinor).not.toBe(totals.orderWorksTotalMinor);
    const removed = updateOrderAdditionalWorks(edited, [], date); expect(estimateCalculation(removed).orderWorksTotalMinor).toBe(0);
  });
  it('keeps measurement and order works distinct even with equal local IDs', () => {
    const work = createAdditionalWorkSnapshot(settings.additionalWorks[0]!, 'same', 1);
    const measurement = { ...window(), additionalWorks: [{ ...work, name: 'Работа окна' }] };
    const value = updateOrderAdditionalWorks(add(fresh(), measurement), [{ ...work, name: 'Работа заказа' }], date);
    const totals = estimateCalculation(value); expect(totals.measurements[0]!.additionalWorkLines[0]!.location).toEqual({ scope: 'measurement', measurementId: 'window' });
    expect(totals.orderAdditionalWorkLines[0]!.location).toEqual({ scope: 'order' });
    const markup = html(value); expect(markup).toContain('Работы этого замера'); expect(markup).toContain('Работа окна'); expect(markup).toContain('Работа заказа');
  });
  it.each([0, -1, NaN, Infinity])('rejects invalid quantity %s', (quantity) => {
    expect(() => updateOrderAdditionalWorks(fresh(), [{ id: 'work', name: 'Доставка', unitPriceMinor: 100, quantity }], date)).toThrow();
  });
  it('offers configured active works and custom work without adding hidden catalog entries', () => {
    const markup = renderToStaticMarkup(<ActiveOrderWorksEditor works={[]} busy={false} onSave={async () => {}}
      catalog={[settings.additionalWorks[0]!, { ...settings.additionalWorks[0]!, id: 'hidden', name: 'Скрытая работа', status: 'hidden' }]}
      preview={(works) => estimateCalculation(updateOrderAdditionalWorks(fresh(), works, date)).orderAdditionalWorkLines} />);
    expect(markup).toContain('Доставка'); expect(markup).not.toContain('Скрытая работа'); expect(markup).toContain('Добавить работу');
  });
});

describe('Feature 11 canonical Summary', () => {
  it('withholds a misleading empty total, including an order-work-only calculation', () => {
    const value = updateOrderAdditionalWorks(fresh(), [createAdditionalWorkSnapshot(settings.additionalWorks[0]!, 'work', 1)], date);
    const markup = html(value); expect(markup).toContain('В расчёте пока нет замеров'); expect(markup).not.toContain('calculation-final');
  });
  it('shows glazing product and installation separately, finish turnkey, subtotal and final', () => {
    const value = all(); const totals = estimateCalculation(value); const markup = html(value);
    expect(markup).toContain('Изделие'); expect(markup).toContain('Монтаж'); expect(markup).toContain('Отделка под ключ');
    for (const line of totals.measurements.flatMap((item) => item.clientLines)) expect(markup).toContain(amount(line.clientPriceMinor));
    expect(markup).toContain(amount(totals.subtotalMinor!)); expect(markup).toContain(amount(totals.finalTotalMinor!));
    expect(markup).not.toMatch(/Себестоимость|Зарплата|Закупочн|installer|materialCost/);
  });
  it.each([0, 7.25, 100])('renders canonical %s percent discount and commercially rounded final', (discountPercent) => {
    const value = updateCalculationDiscount(all(), { mode: 'percent', discountPercent }, date); const totals = estimateCalculationVNext(value);
    const markup = html(value); expect(markup).toContain(`Скидка ${discountPercent}%`);
    expect(markup).toContain(amount(totals.discountAmountMinor!)); expect(markup).toContain(amount(totals.finalTotalMinor!));
  });
  it('does not re-round the exact fixed override and invalidates it on a measurement edit', () => {
    const value = updateCalculationDiscount(all(), { mode: 'fixedFinalPrice', fixedFinalPriceMinor: 123456 }, date);
    expect(html(value)).toContain('Итоговая цена вручную'); expect(html(value)).toContain(amount(123456));
    const same = value.measurements[0]!; const edited = saveMeasurement(value, same, value.configuration[same.id]!, date, 'edit');
    expect(estimateCalculation(edited).finalTotalMinor).toBeNull(); expect(html(edited)).not.toContain('calculation-final');
    expect(estimateCalculation(confirmFixedFinalPrice(edited, date)).finalTotalMinor).toBe(123456);
  });
  it('keeps manual finish kopecks exact', () => { expect(html(add(fresh(), finish('manual')))).toContain(amount(123456)); });
  it.each(['unresolved', 'unconfirmed'] as const)('%s finish identifies the item and blocks trustworthy totals', (mode) => {
    const value = add(add(fresh(), window()), finish(mode)); const totals = estimateCalculation(value); const markup = html(value);
    expect(totals.subtotalMinor).toBeNull(); expect(totals.finalTotalMinor).toBeNull(); expect(markup).not.toContain('calculation-final');
    expect(markup).toContain('Отделка кухни'); expect(markup).toContain('Нужно уточнить цену отделки');
    expect(renderToStaticMarkup(<CalculationTotal totals={totals} />)).not.toContain('Итого:');
    expect(() => updateCalculationDiscount(value, { mode: 'percent', discountPercent: 5 }, date)).toThrow();
  });
  it.each(['resolve', 'remove'] as const)('%s unresolved finish restores the canonical total', (operation) => {
    const value = add(add(fresh(), window()), finish('unresolved'));
    const next = operation === 'remove' ? deleteMeasurement(value, 'finish', date) : saveMeasurement(value, finish(), value.configuration.finish!, date, 'edit');
    expect(estimateCalculation(next).pricingStatus).toBe('priced'); expect(html(next)).toContain('calculation-final');
  });
  it('uses calculation snapshots for cards and summary after global settings mutate; new calculation uses latest settings', () => {
    const input = createStarterCalculatorSettings(); const value = add(createCalculation('old', date, input), window());
    const before = html(value); const totals = estimateCalculation(value);
    input.glazing.profiles[0]!.basePricePerM2 = 999999; input.glazing.installationRatesPerM2.pvc = 999999;
    input.additionalWorks[0]!.unitPriceMinor = 999999;
    expect(html(value)).toBe(before); expect(estimateCalculation(value)).toEqual(totals);
    const latest = add(createCalculation('latest', date, input), window()); expect(estimateCalculation(latest).finalTotalMinor).not.toBe(totals.finalTotalMinor);
    expect(latest.settingsSnapshot!.additionalWorks[0]!.unitPriceMinor).toBe(999999);
  });
  it('formats large safe minor amounts and negative rounding adjustments exactly', () => {
    expect(calculationMoney(Number.MAX_SAFE_INTEGER)).toContain(',91'); expect(calculationMoney(-1)).toContain('−0,01');
    expect(rubInputToMinor(calculationMoneyInput(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
  });
  it('preserves exact safe integer kopecks when reopening a fixed final price field', () => {
    const measurement = finish('manual'); measurement.priceState = { mode: 'manual', confirmation: 'confirmed', finalPriceMinor: Number.MAX_SAFE_INTEGER };
    const value = updateCalculationDiscount(add(fresh(), measurement), { mode: 'fixedFinalPrice', fixedFinalPriceMinor: Number.MAX_SAFE_INTEGER - 2 }, date);
    const totals = estimateCalculation(value);
    const markup = renderToStaticMarkup(<DiscountEditor discount={totals.discount} subtotalMinor={totals.subtotalMinor!} busy={false} currentTotals={totals}
      previewDiscount={(input) => estimateCalculation(updateCalculationDiscount(value, input, date))} onApply={async () => {}} onConfirm={async () => {}} onReset={async () => {}} />);
    expect(markup).toContain('value="90071992547409.89"'); expect(markup).toContain(',89'); expect(markup).not.toContain('role="alert"');
  });
  it('preserves exact work-unit price text at the safe integer boundary', () => {
    const markup = renderToStaticMarkup(<ActiveAdditionalWorksEditor works={[{ id: 'work', name: 'Работа', quantity: 0.1, unitPriceMinor: Number.MAX_SAFE_INTEGER }]} onChange={() => {}} />);
    expect(markup).toContain('value="90071992547409.91"');
  });
  it('enables the v2 PDF port and keeps the flow free of legacy calculations, infrastructure and pricing imports', () => {
    const source = readFileSync('src/ui/App.tsx', 'utf8'); const summary = readFileSync('src/ui/CalculationSummary.tsx', 'utf8');
    expect(source).toContain('<PdfExportAction renderer={renderProposalPdf}');
    expect(source).not.toMatch(/createProposalDocument|renderProposalPdf\s*\(|from ['"].*infrastructure|from ['"].*domain\/calculation['"]/);
    expect(summary).not.toMatch(/from ['"].*domain\/pricing|from ['"].*domain\/money|settingsRepository/);
  });
});
