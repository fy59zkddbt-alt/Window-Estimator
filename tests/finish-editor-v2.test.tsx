import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FinishScreen } from '../src/ui/FinishScreen';
import * as editor from '../src/application/estimate/finish-editor-v2';
import { createCalculation, saveMeasurement, measurementSnapshot, estimateDraft, estimateCalculation } from '../src/application/estimate/active-calculation';
import { estimateFinishVNext } from '../src/application/estimate/estimate-finish-vnext';
import { validateFinishMeasurement, type WindowFinishMeasurement } from '../src/domain/measurements/vnext';
import type { FinishWork } from '../src/domain/configuration/vnext/types';
import { finishEditorSettings } from './fixtures/finish-editor-settings';
import { newWindow, setWindowType, setWindowWidth, setBlockCount, readyMeasurement } from '../src/application/estimate/glazing-editor-v2';

const settings = finishEditorSettings();
const config = settings.finish;
const now = '2026-10-10T12:00:00.000Z';
const works: readonly FinishWork[] = [
  { side: 'interior', workType: 'interiorSlopes' }, { side: 'interior', workType: 'interiorSlopesAndSill' }, { side: 'interior', workType: 'sillOnly' },
  { side: 'exterior', workType: 'exteriorSlopes' }, { side: 'exterior', workType: 'exteriorSlopesAndDrip' }, { side: 'exterior', workType: 'dripOnly' },
];
function finish(work: FinishWork = works[1]!): WindowFinishMeasurement {
  return editor.readyFinishMeasurement(editor.changeFinishWork({ ...editor.newFinishDraft('finish', config), room: 'Кухня', name: 'Окно 1',
    widthMm: 1400, heightMm: 2100, depthMm: 210 }, work, config));
}
function preview(value = finish(), configuration = config, step: 10 | 50 | 100 = 100) {
  const result = estimateDraft(editor.readyFinishMeasurement(value), { kind: 'WindowFinish', configuration }, step);
  if (result.kind !== 'WindowFinish') throw new Error();
  return result;
}
function html(value = finish(), configuration = config) {
  return renderToStaticMarkup(<FinishScreen id={value.id} initial={value} configuration={configuration} step={100} onSave={async () => {}} onCancel={() => {}} />);
}
function add(value = finish()) {
  const calculation = createCalculation('calculation', now, settings);
  return saveMeasurement(calculation, value, measurementSnapshot(calculation, 'WindowFinish'), now, 'add');
}
const amount = (minor: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(minor / 100);

describe('Finish Editor v2: canonical measurement and geometry', () => {
  it.each(works)('creates $workType with canonical mutually exclusive side/elements', (work) => {
    const value = finish(work); validateFinishMeasurement(value);
    expect(value.selections.map((selection) => selection.element)).toEqual(editor.finishWorkElements[work.workType]);
    expect(add(value).measurements).toEqual([value]);
    expect(preview(value).result.price).toEqual(estimateFinishVNext(value, config, 100).price);
  });
  it('starts with no fabricated geometry; blank labels use Feature 10A conventions on save', () => {
    const draft = editor.newFinishDraft('new', config);
    expect([draft.widthMm, draft.heightMm, draft.depthMm].every(Number.isNaN)).toBe(true);
    expect(() => editor.readyFinishMeasurement(draft)).toThrow('фактическую глубину');
    expect(editor.readyFinishMeasurement({ ...draft, widthMm: 1400, heightMm: 1500, depthMm: 210 })).toMatchObject({ room: 'Без помещения', name: 'Отделка окна' });
  });
  it.each(['widthMm', 'heightMm', 'depthMm'] as const)('edits %s without mutating the source', (key) => {
    const previous = finish(); const value = editor.reviseFinishDraft(previous, { ...previous, [key]: 123.5 });
    expect(editor.readyFinishMeasurement(value)[key]).toBe(123.5);
    expect(previous[key]).not.toBe(123.5);
  });
  it.each(['', '.', '-', '1.', '1,', 'abc', '0', '-1', 'Infinity', '1e3', '1.2.3'])('rejects incomplete/invalid numeric input %s', (text) => {
    const size = editor.finishDimensionFromText(text);
    expect(Number.isNaN(size)).toBe(true);
    expect(() => preview({ ...finish(), depthMm: size })).toThrow();
  });
  it.each([['1400', 1400], [' 210,5 ', 210.5], ['0.001', 0.001]] as const)('accepts measured fractional mm %s', (text, expected) => {
    expect(editor.finishDimensionFromText(text)).toBe(expected);
  });
  it('blocks missing configured exterior products rather than inventing material', () => {
    const missing = { ...config, materials: config.materials.filter((material) => material.side === 'interior') };
    const draft = editor.changeFinishWork(finish(), works[4]!, missing);
    expect(draft.selections.every((selection) => selection.materialId === '')).toBe(true);
    expect(() => editor.readyFinishMeasurement(draft)).toThrow('Выберите настроенный материал');
    expect(html(draft, missing)).toContain('В снимке расчёта нет материала');
  });
});

describe('Feature 4 selection and price display', () => {
  it.each([[210, '200'], [220, '200'], [220.000001, '300'], [320, '300']] as const)('selects by inclusive actual depth %s', (depthMm, id) => {
    const value = { ...finish(works[0]!), depthMm };
    const fit = editor.finishMaterialFit(value, config, 'slope');
    expect(fit.variant?.id).toBe(id);
    const result = preview(value);
    expect('selectedVariants' in result.result.price && result.result.price.selectedVariants[0]?.widthVariantId).toBe(id);
    expect(html(value)).toContain(`Подходящая ширина: ${fit.variant!.physicalWidthMm} мм`);
  });
  it('retains Feature 4 deterministic ties irrespective of catalog order/costs', () => {
    const variants = [
      { id: 'wide-cheap', physicalWidthMm: 400, maxUsableActualDepthMm: 500, purchaseCostPerRunningMeter: 1 },
      { id: 'b', physicalWidthMm: 300, maxUsableActualDepthMm: 250, purchaseCostPerRunningMeter: 1 },
      { id: 'a', physicalWidthMm: 300, maxUsableActualDepthMm: 250, purchaseCostPerRunningMeter: 999 },
      { id: 'looser', physicalWidthMm: 300, maxUsableActualDepthMm: 320, purchaseCostPerRunningMeter: 1 },
    ];
    for (const widths of [variants, [...variants].reverse()]) {
      const changed = { ...config, materials: config.materials.map((material) => material.id === 'sandwich' ? { ...material, widthVariants: widths } : material) };
      const value = finish(works[0]!);
      expect(editor.finishMaterialFit(value, changed, 'slope').variant?.id).toBe('a');
      expect(preview(value, changed).result.price).toMatchObject({ selectedVariants: [{ widthVariantId: 'a' }] });
    }
  });
  it('does not round the displayed actual depth back onto a width-selection boundary', () => {
    const value = { ...finish(works[0]!), depthMm: 220.0000001 };
    expect(editor.finishMaterialFit(value, config, 'slope').variant?.id).toBe('300');
    expect(html(value)).toContain('Для глубины 220,0000001 мм');
  });
  it('allowances affect geometry quantities, never width selection', () => {
    const changed = { ...config, allowances: { ...config.allowances, slope: { lengthMm: 500, depthMm: 900 } } };
    const value = finish(works[0]!);
    expect(editor.finishMaterialFit(value, changed, 'slope').variant?.id).toBe('200');
    expect(preview(value, changed).result.geometry.elements[0]).toMatchObject({ actualDepthMm: 210, requiredDepthMm: 1110, calculatedMaterialQuantityM: 7.1 });
    expect(preview(value, changed).result.price).toMatchObject({ selectedVariants: [{ widthVariantId: '200' }] });
  });
  it('preserves explicit width override and allows canonical unresolved behavior for undersized overrides', () => {
    const value = { ...finish(works[0]!), selections: [{ element: 'slope' as const, materialId: 'sandwich', widthVariantId: '300' }] };
    expect(preview(value).result.price).toMatchObject({ selectedVariants: [{ widthVariantId: '300' }] });
    expect(editor.finishMaterialFit(value, config, 'slope').variant?.id).toBe('300');
    const invalid = { ...value, depthMm: 250, selections: [{ ...value.selections[0]!, widthVariantId: '200' }] };
    expect(preview(invalid).basePriceMinor).toBeNull();
    expect(editor.finishMaterialFit(invalid, config, 'slope').variant).toBeUndefined();
  });
  it('too deep remains saveable, totals unresolved, no partial cost basis or trustworthy final price', () => {
    const value = { ...finish(), depthMm: 340 };
    const calculated = preview(value);
    const persisted = add(calculated.result.measurement);
    expect(calculated.result.measurement.priceState.mode).toBe('priceRequiresClarification');
    expect(calculated.result.price).not.toHaveProperty('costBasis');
    expect(calculated.basePriceMinor).toBeNull(); expect(calculated.measurementTotalMinor).toBeNull();
    expect(estimateCalculation(persisted)).toMatchObject({ pricingStatus: 'unresolved', subtotalMinor: null, finalTotalMinor: null });
    const markup = html(value);
    expect(markup).toContain('Нужно уточнить цену'); expect(markup).toContain('Для глубины 340 мм');
    expect(markup).toContain('Указать цену вручную'); expect(markup).not.toContain('class="total"');
    expect(markup).toMatch(/<button>Сохранить замер<\/button>/);
  });
  it.each([10, 50, 100] as const)('shows canonical commercial price once for rounding step %s', (step) => {
    const value = finish(); const calculated = preview(value, config, step);
    const markup = renderToStaticMarkup(<FinishScreen id={value.id} initial={value} configuration={config} step={step} onSave={async () => {}} onCancel={() => {}} />);
    expect(markup).toContain(amount(calculated.basePriceMinor!));
    expect(calculated.result.price).toEqual(estimateFinishVNext(value, config, step).price);
  });
});

describe('Manual final price and confirmation', () => {
  it.each(['0', '-1', '', '18.', '1.001', '1e10', '90071992547409.92'])('rejects invalid manual final price %s', (text) => {
    expect(() => editor.setManualFinishPrice(finish(), text)).toThrow('больше 0');
  });
  it.each([['18000.01', 1800001], ['18,53', 1853], ['0.01', 1], ['90071992547409.91', Number.MAX_SAFE_INTEGER]] as const)('stores exact final price %s, without commercial rounding or fake basis', (text, expected) => {
    const value = editor.setManualFinishPrice({ ...finish(), depthMm: 340 }, text);
    expect(value.priceState).toEqual({ mode: 'manual', finalPriceMinor: expected, confirmation: 'confirmed' });
    expect(preview(value).result.price).toEqual({ priceState: value.priceState, clientFinishPriceMinor: expected });
    expect(editor.setManualFinishPrice(value, editor.manualFinishPriceText(expected)).priceState).toEqual(value.priceState);
    expect(add(value).measurements[0]).toEqual(value);
    const markup = html(value); expect(markup).toContain('Цена задана вручную');
    if (expected === Number.MAX_SAFE_INTEGER) expect(markup).toContain('90 071 992 547 409,91 ₽');
    expect(markup).not.toMatch(/Себестоимость|Оплата монтажника|Материал с резервом/);
  });
  it.each(['widthMm', 'heightMm', 'depthMm'] as const)('changing %s invalidates manual, return to old size does not reconfirm', (key) => {
    const value = editor.setManualFinishPrice(finish(), '18000.01');
    const changed = editor.reviseFinishDraft(value, { ...value, [key]: value[key] + 1 });
    expect(changed.priceState).toMatchObject({ confirmation: 'needsConfirmation' });
    expect(preview(changed).basePriceMinor).toBeNull();
    const restored = editor.reviseFinishDraft(changed, { ...changed, [key]: value[key] });
    expect(restored.priceState).toMatchObject({ confirmation: 'needsConfirmation' });
    expect(html(restored)).toContain('Параметры изменились. Подтвердите ручную цену повторно.');
    expect(html(restored)).not.toContain('class="total"');
    expect(preview(editor.setManualFinishPrice(restored, '18000.01')).basePriceMinor).toBe(1800001);
  });
  it('incomplete geometry invalidates manual even if the old size is restored', () => {
    const value = editor.setManualFinishPrice(finish(), '18000');
    const draft = editor.reviseFinishDraft(value, { ...value, depthMm: NaN });
    const restored = editor.reviseFinishDraft(draft, { ...draft, depthMm: value.depthMm });
    expect(restored.priceState).toMatchObject({ confirmation: 'needsConfirmation' });
  });
  it('composition, side, material and width override invalidate; metadata does not', () => {
    const value = editor.setManualFinishPrice(finish(), '18000');
    expect(editor.changeFinishWork(value, works[0]!, config).priceState).toMatchObject({ confirmation: 'needsConfirmation' });
    expect(editor.changeFinishWork(value, works[4]!, config).priceState).toMatchObject({ confirmation: 'needsConfirmation' });
    for (const selection of [{ element: 'sill' as const, materialId: 'sill-premium' }, { element: 'sill' as const, materialId: 'sill-standard', widthVariantId: '300' }]) {
      expect(editor.reviseFinishDraft(value, { ...value, selections: [value.selections[0]!, selection] }).priceState).toMatchObject({ confirmation: 'needsConfirmation' });
    }
    expect(editor.reviseFinishDraft(value, { ...value, room: 'Спальня', name: 'Другое окно' }).priceState).toEqual(value.priceState);
  });
});

describe('Snapshots, save, additional works, Balcony Block bridge', () => {
  it('existing calculation options and prices stay independent of mutable Settings; edit preserves unrelated data', () => {
    const original = add(); const snapshot = original.configuration.finish!;
    const mutable = finishEditorSettings();
    mutable.finish.materials = mutable.finish.materials.map((material) => ({ ...material, name: 'Изменённый материал',
      widthVariants: [{ id: 'new', physicalWidthMm: 100, maxUsableActualDepthMm: 100, purchaseCostPerRunningMeter: 999999 }] }));
    mutable.finish.finishMarkupPercent = 999;
    const input = { ...finish(), heightMm: 2200 };
    const changed = saveMeasurement({ ...original, clientName: 'Клиент', orderAdditionalWorks: [{ id: 'delivery', name: 'Доставка', quantity: 1, unitPriceMinor: 10000 }] }, input, snapshot, now, 'edit');
    expect(changed).toMatchObject({ clientName: 'Клиент', commercialRoundingStepRub: 100, orderAdditionalWorks: [{ id: 'delivery' }] });
    expect(changed.measurements[0]).toEqual(input); expect(original.measurements[0]).toEqual(finish());
    expect(measurementSnapshot(original, 'WindowFinish')).toEqual(snapshot);
    if (snapshot.kind !== 'WindowFinish') throw new Error();
    expect(html(input, snapshot.configuration)).toContain('Сэндвич-панель');
    expect(estimateCalculation(changed).measurements[0]!.basePriceMinor).toBe(preview(input, config).basePriceMinor);
  });
  it('hidden selected products survive editing; new selections only use active products', () => {
    const hidden = { ...config, materials: config.materials.map((material) => ({ ...material, status: 'hidden' as const })) };
    expect(html(finish(), hidden)).toContain('Сэндвич-панель');
    expect(editor.newFinishDraft('new', hidden).selections.every((selection) => !selection.materialId)).toBe(true);
    expect(preview(finish(), hidden).basePriceMinor).toBe(preview().basePriceMinor);
  });
  it('insulation/sealing remain additional works, outside Feature 4 base price', () => {
    const value = { ...finish(), additionalWorks: [{ id: 'insulation', name: 'Утепление', quantity: 2, unitPriceMinor: 12550 }, { id: 'seal', name: 'Герметизация', quantity: 1, unitPriceMinor: 20000 }] };
    const result = preview(value);
    expect(result.result.price).toEqual(preview().result.price);
    expect(result.additionalWorkLines.map((line) => line.priceBeforeCommercialRoundingMinor)).toEqual([25100, 20000]);
    expect(result.additionalWorksTotalMinor).toBe(50000); // Existing Feature 5 rounds each commercial work line.
    expect(result.measurementTotalMinor).toBe(result.basePriceMinor! + 50000);
    expect(add(value).measurements[0]!.additionalWorks).toEqual(value.additionalWorks);
  });
  it.each([1, 2] as const)('bridge from %s windows prefills independent width/door height, never depth; saves separate finish', (count) => {
    let block = setBlockCount(setWindowWidth(setWindowType(newWindow('block', settings.glazing), 'balconyBlock'), 1400), count);
    if (block.windowType !== 'balconyBlock') throw new Error();
    block = readyMeasurement({ ...block, doorWidthMm: 700, doorHeightMm: 2200, windowHeightMm: 1500, doorPosition: 'right', room: 'Кухня', name: 'Блок' });
    const before = structuredClone(block);
    const calculation = createCalculation('calculation', now, settings);
    const saved = saveMeasurement(calculation, block, measurementSnapshot(calculation, 'Window'), now, 'add');
    const seed = editor.finishSeedFromBalconyBlock(block);
    expect(seed).toEqual({ widthMm: 2100, heightMm: 2200, room: 'Кухня', name: 'Отделка · Блок' });
    expect(seed).not.toHaveProperty('depthMm');
    const draft = editor.newFinishDraft('finish', config, seed);
    expect(Number.isNaN(draft.depthMm)).toBe(true); expect(() => editor.readyFinishMeasurement(draft)).toThrow();
    const withFinish = saveMeasurement(saved, editor.readyFinishMeasurement({ ...draft, depthMm: 210 }), measurementSnapshot(saved, 'WindowFinish'), now, 'add');
    expect(saved.measurements).toEqual([before]); expect(withFinish.measurements).toHaveLength(2);
    expect(withFinish.measurements[0]).toEqual(before); expect(block).toEqual(before);
    const edited = saveMeasurement(withFinish, { ...withFinish.measurements[1] as WindowFinishMeasurement, widthMm: 2300 }, withFinish.configuration.finish!, now, 'edit');
    expect(edited.measurements[0]).toEqual(before);
  });
  it('mobile controls expose measured geometry, decimal keypad and collapsed rare controls', () => {
    const markup = html();
    expect(markup.match(/inputMode="decimal"/g)).toHaveLength(3);
    expect(markup).toContain('Фактическая глубина, мм'); expect(markup).toContain('По этой глубине калькулятор');
    expect(markup).toContain('<details><summary>Дополнительные параметры');
    expect(markup).not.toMatch(/purchaseStep|wastePercent|materialMarkupPercent|maxUsableActualDepthMm/);
  });
});
