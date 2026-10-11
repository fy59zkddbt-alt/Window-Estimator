import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildProposalDocumentV2, proposalMoneyV2 } from '../src/application/documents/build-proposal-document-v2';
import { estimateCalculationVNext } from '../src/application/estimate/estimate-calculation-vnext';
import * as canonical from '../src/application/estimate/estimate-calculation-vnext';
import * as money from '../src/domain/money';
import { proposalCalculation, proposalWindow, proposalBalcony, proposalBlock, proposalFinish, proposalDate } from './fixtures/proposal-v2';
import type { AdditionalWorkUnit } from '../src/domain/works/vnext';

const build = buildProposalDocumentV2;
describe('ProposalDocument v2 context and ownership', () => {
  it('builds a versioned deterministic document from valid v4', () => {
    const c = proposalCalculation(); const before = structuredClone(c); const d = build(c);
    expect(d.version).toBe(2); expect(d.items).toHaveLength(4); expect(build(c)).toEqual(d); expect(c).toEqual(before);
    expect(JSON.parse(JSON.stringify(d))).toEqual(d);
  });
  it('maps canonical identity, calculation timestamps and customer context', () => {
    expect(build(proposalCalculation()).context).toEqual({ calculationId: 'calculation-12', name: 'Остекление квартиры', createdAt: proposalDate,
      updatedAt: proposalDate, clientName: 'Анна Иванова', clientPhone: '+7 900 1234567', objectAddress: 'Новосибирск, Ленина, 7' });
  });
  it.each(['name', 'clientName', 'clientPhone', 'objectAddress'] as const)('handles missing/blank optional %s', (key) => {
    const c = proposalCalculation(); delete c[key]; expect(build(c).context).not.toHaveProperty(key);
    c[key] = '  '; expect(build(c).context).not.toHaveProperty(key);
  });
  it('maps all actual seller fields into a detached optional snapshot', () => {
    const seller = { sellerName: 'Иван', sellerPhone: '+7 900 1234567', companyName: 'Окна', companyPhone: '+7 900 7654321',
      telegram: '@okna', whatsapp: '9001234567', email: 'okna@example.org', website: 'https://example.org', inn: '1234567890' };
    const d = build(proposalCalculation(), seller); expect(d.seller).toEqual(seller); seller.sellerName = 'Другой'; expect(d.seller!.sellerName).toBe('Иван');
  });
  it('allows absent/incomplete seller metadata without blocking the customer view', () => {
    expect(build(proposalCalculation()).seller).toBeUndefined(); expect(build(proposalCalculation(), { sellerName: '', sellerPhone: '' }).seller).toBeUndefined();
    expect(build(proposalCalculation(), { sellerName: 'Иван', sellerPhone: '' }).seller).toEqual({ sellerName: 'Иван' });
  });
  it('uses per-measurement snapshot labels, including hidden historical catalog entries', () => {
    const c = proposalCalculation([proposalWindow()]); const s = c.configuration.window!;
    if (s.kind === 'WindowFinish') throw new Error('fixture');
    Object.assign(s.configuration.profiles[0]!, { name: 'Исторический профиль', status: 'hidden' });
    Object.assign(s.configuration.hardware[0]!, { name: 'Историческая фурнитура', status: 'hidden' });
    s.configuration.colors[2]!.name = 'Исторический цвет';
    const json = JSON.stringify(build(c)); expect(json).toContain('Исторический профиль'); expect(json).toContain('Историческая фурнитура'); expect(json).toContain('Исторический цвет');
  });
  it('ignores mutable creation defaults/catalog and remains independent after generation', () => {
    const c = proposalCalculation(); const d = build(c);
    c.settingsSnapshot!.glazing.profiles[0]!.name = 'Новый глобальный профиль'; c.settingsSnapshot!.glazing.profiles[0]!.basePricePerM2 = 999999;
    c.settingsSnapshot!.finish.materials[0]!.name = 'Новый материал'; c.settingsSnapshot!.additionalWorks = [];
    expect(build(c)).toEqual(d);
    const s = c.configuration.window!; if (s.kind !== 'WindowFinish') s.configuration.hardware[0]!.name = 'Изменённый снимок';
    expect(JSON.stringify(d)).not.toContain('Изменённый снимок');
  });
  it('detaches schemes and work data from Calculation/result objects', () => {
    const c = proposalCalculation(); const d = build(c); const original = JSON.stringify(c);
    const point = d.items[0]!.schemes[0]!.geometry.sections[1]!.symbols[0]!.points[0]!;
    Object.assign(point, { xMm: -123 }); expect(JSON.stringify(c)).toBe(original);
  });
  it('rejects truly corrupt Calculation rather than generating a fake offer', () => {
    const c = proposalCalculation(); c.configuration = {}; expect(() => build(c)).toThrow();
  });
});

describe('ProposalDocument v2 glazing content', () => {
  it('maps Window identity, dimensions, unequal sections and transom using canonical coordinates', () => {
    const c = proposalCalculation([proposalWindow()]); const d = build(c).items[0]!; const g = estimateCalculationVNext(c).measurements[0]!.result.geometry;
    expect(d).toMatchObject({ kind: 'Window', name: 'Окно спальни', room: 'Спальня', typeLabel: 'Двустворчатое окно',
      dimensions: [{ label: 'Окно', widthMm: 1400, heightMm: 1500 }] });
    if (!('bounds' in g)) throw new Error('fixture');
    const drawing = d.schemes[0]!.geometry; expect(drawing.bounds).toEqual(g.bounds); expect(drawing.transom).toMatchObject({ heightMm: 200 });
    expect(drawing.sections.map((s) => [s.xMm, s.yMm, s.widthMm, s.heightMm, s.symbols]))
      .toEqual(g.sections.map((s) => [s.xMm, s.yMm, s.widthMm, s.heightMm, s.symbols]));
  });
  it.each([['fixed', 'Глухая'], ['turn', 'Поворотная'], ['tilt_turn', 'Поворотно-откидная']] as const)('maps PVC opening %s', (openingType, label) => {
    const m = proposalWindow(); m.plane.sections = [{ id: 'one', widthMm: 500, openingType: 'fixed' },
      openingType === 'fixed' ? { id: 'two', widthMm: 900, openingType } : { id: 'two', widthMm: 900, openingType, hingeSide: 'left', hardwareId: 'standard' }];
    const section = build(proposalCalculation([m])).items[0]!.schemes[0]!.geometry.sections[1]!;
    expect(section.openingLabel).toBe(label); if (openingType !== 'fixed') { expect(section.hardwareLabel).toBe('Mako'); expect(section.hingeLabel).toBe('Петли слева'); }
    else { expect(section.hardwareLabel).toBeUndefined(); expect(section.hingeLabel).toBeUndefined(); }
  });
  it.each([['white', 'Без ламинации'], ['laminated', 'Ламинация с одной стороны'], ['laminated-two', 'Ламинация с двух сторон']] as const)('maps color/lamination %s', (colorId, value) => {
    const m = proposalWindow(); m.colorId = colorId;
    expect(build(proposalCalculation([m])).items[0]!.properties).toContainEqual({ label: 'Ламинация', value });
  });
  it('maps product profile and visible options without rates', () => {
    const properties = build(proposalCalculation([proposalWindow()])).items[0]!.properties;
    expect(properties).toContainEqual({ label: 'Профиль', value: 'VEKA Softline 70' });
    expect(properties).toContainEqual({ label: 'Комплектация', value: 'Расширители' }); expect(properties).toContainEqual({ label: 'Комплектация', value: 'Соединители' });
  });
  it.each(['straight', 'L', 'U'] as const)('maps balcony %s with ordered planes and ready geometry', (shape) => {
    const c = proposalCalculation([proposalBalcony(shape)]); const d = build(c).items[0]!;
    expect(d.typeLabel).toBe({ straight: 'Прямой балкон', L: 'Г-образный балкон', U: 'П-образный балкон' }[shape]);
    expect(d.schemes).toHaveLength({ straight: 1, L: 2, U: 3 }[shape]);
    const result = estimateCalculationVNext(c).measurements[0]!.result;
    if (!('planes' in result.geometry)) throw new Error('fixture');
    expect(d.schemes.map((p) => p.geometry.bounds)).toEqual(result.geometry.planes.map((p) => p.bounds));
    expect(d.dimensions.every((p) => p.widthMm === 1800 && p.heightMm === 2100)).toBe(true);
  });
  it.each(['left', 'right'] as const)('maps L-%s plane order', (side) => {
    const d = build(proposalCalculation([proposalBalcony('L', 'pvc', 'sliding', undefined, side)])).items[0]!;
    expect(d.dimensions.map((p) => p.label)).toEqual(side === 'left' ? ['Левая сторона', 'Передняя сторона'] : ['Передняя сторона', 'Правая сторона']);
  });
  it('maps PVC balcony profile, hinges and hardware', () => {
    const d = build(proposalCalculation([proposalBalcony()])).items[0]!;
    expect(d.properties).toContainEqual({ label: 'Материал', value: 'ПВХ' }); expect(d.schemes[0]!.geometry.sections[1]!.hardwareLabel).toBe('Mako');
  });
  it.each(['sliding', 'swing'] as const)('maps aluminium balcony %s without PVC hardware', (mode) => {
    const d = build(proposalCalculation([proposalBalcony('U', 'aluminium', mode)])).items[0]!;
    expect(d.properties).toContainEqual({ label: 'Материал', value: 'Алюминий' }); expect(d.properties.some((p) => p.label === 'Система')).toBe(true);
    const section = d.schemes[0]!.geometry.sections[1]!; expect(section.openingLabel).toBe(mode === 'sliding' ? 'Раздвижная' : 'Поворотная');
    expect(section.hardwareLabel).toBeUndefined(); expect(d.schemes[0]!.label).toContain(mode === 'sliding' ? 'Раздвижное' : 'Распашное');
  });
  it.each([undefined, 'glass', 'sandwich'] as const)('maps full-height/two-row balcony lower fill %s', (lower) => {
    const d = build(proposalCalculation([proposalBalcony('straight', 'pvc', 'sliding', lower)])).items[0]!.schemes[0]!;
    expect(d.geometry.sections).toHaveLength(lower ? 4 : 2); expect(d.geometry.splitLine !== undefined).toBe(!!lower);
    expect(d.label).toContain(lower ? 'Два ряда' : 'Один ряд на всю высоту');
    if (lower) { expect(d.geometry.sections[2]).toMatchObject({ fill: lower, heightMm: 600, yMm: 1500, openingLabel: 'Глухая' }); expect(d.label).toContain(lower === 'glass' ? 'стекло' : 'сэндвич-панель'); }
  });
  it.each(['left', 'middle', 'right'] as const)('maps block window/door dimensions and placement %s', (position) => {
    const d = build(proposalCalculation([proposalBlock(position)])).items[0]!;
    expect(d.kind).toBe('balconyBlock'); expect(d.dimensions).toEqual([{ label: 'Оконная часть', widthMm: 1400, heightMm: 1500 }, { label: 'Дверь', widthMm: 700, heightMm: 2200 }]);
    const g = d.schemes[0]!.geometry; const doorIndex = { left: 0, middle: 1, right: 2 }[position];
    expect(g.sections[doorIndex]).toMatchObject({ label: 'Дверь', widthMm: 700, heightMm: 2200, openingLabel: 'Поворотно-откидная', hardwareLabel: 'Mako' });
    expect(g.bounds.widthMm).toBe(2100); expect(g.sections.filter((s) => s.label !== 'Дверь').map((s) => s.widthMm)).toEqual([800, 600]);
  });
});

describe('ProposalDocument v2 canonical money and finish', () => {
  it.each(['automatic', 'manual'] as const)('maps %s finish as a single client price', (mode) => {
    const c = proposalCalculation([proposalFinish(mode)]); const d = build(c).items[0]!; const line = estimateCalculationVNext(c).measurements[0]!.clientLines[0]!;
    expect(d.priceLines).toEqual([{ label: 'Отделка под ключ', amount: proposalMoneyV2(line.clientPriceMinor) }]);
    expect(d.properties).toContainEqual({ label: 'Сторона', value: 'Внутри помещения' }); expect(d.properties).toContainEqual({ label: 'Состав', value: 'Откосы и подоконник' });
    expect(d.properties).toContainEqual({ label: 'Подоконник', value: 'Подоконник Стандарт' }); if (mode === 'manual') expect(d.total!.minor).toBe(123456);
  });
  it('maps exterior composition and selected visible materials', () => {
    const m = proposalFinish(); Object.assign(m, { side: 'exterior', workType: 'exteriorSlopesAndDrip', selections: [{ element: 'slope', materialId: 'exterior-slope' }, { element: 'drip', materialId: 'exterior-drip' }] });
    const properties = build(proposalCalculation([m])).items[0]!.properties;
    expect(properties).toContainEqual({ label: 'Сторона', value: 'Снаружи помещения' }); expect(properties).toContainEqual({ label: 'Отлив', value: 'Отлив по каталогу' });
  });
  it.each(['unresolved', 'pending'] as const)('propagates %s finish without fake item/subtotal/final price or private failure details', (mode) => {
    const c = proposalCalculation([proposalWindow(), proposalFinish(mode)]); const d = build(c);
    expect(d.summary).toMatchObject({ status: 'needsClarification', total: null, subtotal: null, discount: null });
    expect(d.items[1]).toMatchObject({ pricingStatus: 'needsClarification', clarification: 'Цена отделки требует уточнения', priceLines: [], total: null });
    expect(d.items[0]!.total).not.toBeNull(); expect(JSON.stringify(d)).not.toContain('maxUsableActualDepthMm');
  });
  it.each(['product', 'installation'] as const)('takes Window %s money from canonical Feature 5 client lines', (part) => {
    const c = proposalCalculation([proposalWindow()]); const result = estimateCalculationVNext(c); const d = build(c);
    const index = part === 'product' ? 0 : 1; expect(d.items[0]!.priceLines[index]!.amount.minor).toBe(result.measurements[0]!.clientLines[index]!.clientPriceMinor);
  });
  it.each(['measurement', 'order'] as const)('maps %s works from canonical final lines, hiding catalog/unit pricing', (scope) => {
    const m = proposalWindow(); const work = { id: 'work', catalogId: 'secret-catalog', name: 'Демонтаж', unitPriceMinor: 12345, quantity: 1.25, unit: 'runningMeter' as const };
    if (scope === 'measurement') m.additionalWorks = [work]; const c = proposalCalculation([m]); if (scope === 'order') c.orderAdditionalWorks = [work];
    const totals = estimateCalculationVNext(c); const d = build(c); const lines = scope === 'order' ? d.orderAdditionalWorks : d.items[0]!.additionalWorks;
    const canonicalLines = scope === 'order' ? totals.orderAdditionalWorkLines : totals.measurements[0]!.additionalWorkLines;
    expect(lines).toEqual([{ name: 'Демонтаж', quantity: 1.25, unitLabel: 'пог. м', amount: proposalMoneyV2(canonicalLines[0]!.clientPriceMinor) }]);
    expect(JSON.stringify(d)).not.toContain('secret-catalog'); expect(JSON.stringify(d)).not.toContain('unitPriceMinor');
  });
  it.each([['piece', 'шт.'], ['runningMeter', 'пог. м'], ['squareMeter', 'м²'], ['unit', 'ед.'], [undefined, undefined]] as const)('maps optional work unit %s', (unit, label) => {
    const c = proposalCalculation(); c.orderAdditionalWorks = [{ id: 'x', name: 'Работа', quantity: 0.125, unitPriceMinor: 333, ...(unit ? { unit: unit as AdditionalWorkUnit } : {}) }];
    expect(build(c).orderAdditionalWorks[0]!.unitLabel).toBe(label);
  });
  it.each(['none', 'percent', 'fixedFinalPrice'] as const)('maps %s summary exclusively from Feature 5', (mode) => {
    const c = proposalCalculation(); const before = estimateCalculationVNext(c);
    c.discount = mode === 'percent' ? { mode, discountPercent: 7.25 } : mode === 'none' ? { mode } : { mode, fixedFinalPriceMinor: 1234567, confirmation: 'confirmed', confirmedSubtotalMinor: before.subtotalMinor! };
    const t = estimateCalculationVNext(c); const s = build(c).summary;
    expect(s.subtotal!.minor).toBe(t.subtotalMinor); expect(s.total!.minor).toBe(t.finalTotalMinor); expect(s.measurementsSubtotal!.minor).toBe(t.measurementsSubtotalMinor);
    expect(s.discount?.amount.minor ?? null).toBe(mode === 'none' ? null : t.discountAmountMinor); expect(s.roundingAdjustment?.minor).toBe(t.commercialRoundingAdjustmentMinor);
    if (mode === 'percent') expect(s.discount!.label).toBe('Скидка 7,25%');
  });
  it('withholds pending fixed final total without exposing override mechanics', () => {
    const c = proposalCalculation(); c.discount = { mode: 'fixedFinalPrice', fixedFinalPriceMinor: 1234567, confirmation: 'needsConfirmation', confirmedSubtotalMinor: estimateCalculationVNext(c).subtotalMinor! };
    const s = build(c).summary; expect(s.status).toBe('needsConfirmation'); expect(s.total).toBeNull(); expect(s.discount).toBeNull(); expect(s.subtotal).not.toBeNull();
  });
  it('preserves a precise decimal percentage label without rounding it to three decimals', () => {
    const c = proposalCalculation(); c.discount = { mode: 'percent', discountPercent: 33.3333333 };
    expect(build(c).summary.discount!.label).toBe('Скидка 33,3333333%');
  });
  it.each([1, 123456, Number.MAX_SAFE_INTEGER])('keeps manual finish and final total %s exact', (minor) => {
    const d = build(proposalCalculation([proposalFinish('manual', minor)])); expect(d.items[0]!.total!.minor).toBe(minor); expect(d.summary.total!.minor).toBe(minor);
    expect(d.summary.total!.display).toContain(String(BigInt(minor) % 100n).padStart(2, '0'));
    if (minor === Number.MAX_SAFE_INTEGER) expect(d.summary.total!.display).toBe('90 071 992 547 409,91 ₽');
  });
  it('keeps large fixed final kopecks exactly, with no commercial rounding', () => {
    const c = proposalCalculation([proposalFinish('manual', Number.MAX_SAFE_INTEGER)]);
    c.discount = { mode: 'fixedFinalPrice', fixedFinalPriceMinor: Number.MAX_SAFE_INTEGER - 2, confirmation: 'confirmed', confirmedSubtotalMinor: Number.MAX_SAFE_INTEGER };
    expect(build(c).summary.total).toEqual(proposalMoneyV2(Number.MAX_SAFE_INTEGER - 2)); expect(build(c).summary.total!.display).toContain(',89');
  });
  it('performs exactly one canonical evaluation and adds no commercial rounding calls', () => {
    const c = proposalCalculation(); const round = vi.spyOn(money, 'commercialRoundMinor'); const evaluate = vi.spyOn(canonical, 'estimateCalculationVNext');
    try { estimateCalculationVNext(c); const expected = round.mock.calls.length; round.mockClear(); evaluate.mockClear(); build(c);
      expect(evaluate).toHaveBeenCalledTimes(1); expect(round).toHaveBeenCalledTimes(expected);
    } finally { round.mockRestore(); evaluate.mockRestore(); }
  });
  it('empty Calculation has no trustworthy presentation total', () => { expect(build(proposalCalculation([])).summary).toMatchObject({ status: 'empty', total: null }); });
});

describe('ProposalDocument v2 presentation boundary', () => {
  it.each(['purchaseCostPerRunningMeter', 'installerRatePerRunningMeter', 'baseInstallerPayByWorkType', 'finishMarkupPercent', 'productMarkupPercent',
    'reservePercent', 'basePricePerM2', 'activityPercent', 'slidingPercent', 'colorRules', 'unitPriceMinor', 'configuration', 'settingsSnapshot', 'priceState', 'hardwareId', 'profileId'])('never exposes internal field %s', (key) => {
    expect(JSON.stringify(build(proposalCalculation()))).not.toContain(`"${key}"`);
  });
  it('document contract is React/DOM/editable-model independent and builder has no pricing/rounding implementation', () => {
    const contract = readFileSync('src/domain/documents/proposal-document-v2.ts', 'utf8'); const source = readFileSync('src/application/documents/build-proposal-document-v2.ts', 'utf8');
    expect(contract.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/import |HTMLElement|React|JSX|canvas|<svg/); expect(source).not.toMatch(/domain\/pricing|commercialRoundMinor|percentageMinor|sumMinor|multiplyMinorByQuantity|from .*calculator-settings/);
    expect(source).toContain('estimateCalculationVNext(calculation)');
  });
});
