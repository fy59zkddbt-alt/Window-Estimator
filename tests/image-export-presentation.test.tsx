import { customerMoney } from '../src/presentation/customer-money';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildProposalDocumentV2, proposalMoneyV2 } from '../src/application/documents/build-proposal-document-v2';
import { estimateCalculationVNext } from '../src/application/estimate/estimate-calculation-vnext';
import { GlazingScheme } from '../src/ui/GlazingScheme';
import { customerConstruction, customerSchemeLayout, glazingPrimitives, schemeColumnWidths } from '../src/ui/glazing-drawing';
import { itemPresentation, sellerLines, summaryLines } from '../src/ui/proposal-presentation';
import { layoutProposalImages, textStyles, type TextStyle } from '../src/ui/export/proposal-image-layout';
import { ClientView } from '../src/ui/ClientView';
import { proposalCalculation, proposalWindow, proposalBalcony, proposalBlock, proposalFinish } from './fixtures/proposal-v2';
import * as money from '../src/domain/money';

const documentFor = (measurement = proposalWindow()) => buildProposalDocumentV2(proposalCalculation([measurement]));
const measure = (text: string, style: TextStyle) => text.length * textStyles[style].size * 0.56;
const body = (d: ReturnType<typeof buildProposalDocumentV2>) => layoutProposalImages(d, measure).flatMap(p => p.cards.flatMap(({card}) => card.atoms.flatMap(a => a.kind === 'text' ? [a.text, ...(a.amount ? [a.amount] : [])] : []))).join('\n');
const markup = (d: ReturnType<typeof buildProposalDocumentV2>) => renderToStaticMarkup(<ClientView document={d} onBack={() => {}} />);

describe('Feature 13 customer opening convention: view from inside', () => {
  it.each([
    ['turn', 'left'], ['turn', 'right'], ['tilt_turn', 'left'], ['tilt_turn', 'right'],
  ] as const)('%s hinges %s: deterministic existing apex, no second hinge system', (opening, hingeSide) => {
    const w = proposalWindow(); if (w.windowType !== 'double') throw new Error('fixture');
    w.plane.sections = [{ id: 'fixed', widthMm: 500, openingType: 'fixed' }, { id: 'active', widthMm: 900, openingType: opening, hingeSide, hardwareId: 'standard' }];
    const geometry = documentFor(w).items[0]!.schemes[0]!.geometry; const original = JSON.stringify(geometry);
    const lines = glazingPrimitives(geometry, true).lines;
    const turn = lines.find(l => l.kind === 'turn')!;
    expect(turn.points).toEqual(hingeSide === 'left' ? [{ xMm: 1310, yMm: 330 }, { xMm: 590, yMm: 850 }, { xMm: 1310, yMm: 1370 }]
      : [{ xMm: 590, yMm: 330 }, { xMm: 1310, yMm: 850 }, { xMm: 590, yMm: 1370 }]);
    expect(lines.some(l => l.kind === 'hinge')).toBe(false);
    expect(lines.filter(l => l.kind === 'tilt')).toHaveLength(opening === 'tilt_turn' ? 1 : 0);
    if (opening === 'tilt_turn') expect(lines.find(l => l.kind === 'tilt')).toMatchObject({ dashed: true, points: [{ xMm: 590, yMm: 1370 }, { xMm: 950, yMm: 330 }, { xMm: 1310, yMm: 1370 }] });
    const svg = renderToStaticMarkup(<GlazingScheme customer geometry={geometry} label="Вид из помещения" />);
    const customer = customerConstruction(geometry, customerSchemeLayout(geometry, 620, 440));
    const turnLine = customer.lines.find(l => l.kind === 'turn')!;
    expect(svg).toContain(`points="${turnLine.points.map(p => `${p.x},${p.y}`).join(' ')}"`);
    expect(hingeSide === 'left' ? turnLine.points[1]!.x < turnLine.points[0]!.x : turnLine.points[1]!.x > turnLine.points[0]!.x).toBe(true);
    const glass = customer.contours.at(-1)!;
    const at = (x: number, y: number) => ({ x: glass.x + x * glass.width, y: glass.y + y * glass.height });
    expect(turnLine.dashed).toBe(false);
    expect(turnLine.points).toEqual(hingeSide === 'left' ? [at(0.9, 0.1), at(0.1, 0.5), at(0.9, 0.9)] : [at(0.1, 0.1), at(0.9, 0.5), at(0.1, 0.9)]);
    if (opening === 'tilt_turn') {
      const tiltLine = customer.lines.find(l => l.kind === 'tilt')!;
      expect(tiltLine).toEqual({ kind: 'tilt', dashed: true, points: [at(0.1, 0.9), at(0.5, 0.1), at(0.9, 0.9)] });
      expect(svg).toContain(`points="${tiltLine.points.map(p => `${p.x},${p.y}`).join(' ')}"`);
    }
    expect(svg).not.toContain('opening-symbol hinge'); expect(JSON.stringify(geometry)).toBe(original);
    expect(glazingPrimitives(geometry).lines.filter(l => l.kind === 'hinge')).toHaveLength(2); // Editor convention untouched.
  });
  it('fixed panes are plain; sliding is exclusively the supplied arrow, never a hinged triangle', () => {
    const w = proposalWindow(); if (w.windowType !== 'double') throw new Error('fixture');
    w.plane.sections = [{ id: 'a', widthMm: 500, openingType: 'fixed' }, { id: 'b', widthMm: 900, openingType: 'fixed' }];
    const fixed = documentFor(w).items[0]!.schemes[0]!.geometry;
    expect(glazingPrimitives(fixed, true).lines).toEqual([]);
    const fixedDrawing = customerConstruction(fixed, customerSchemeLayout(fixed, 620, 440));
    expect(fixedDrawing.lines).toEqual([]); expect(fixedDrawing.contours.every(c => c.kind === 'glass')).toBe(true);
    const geometry = buildProposalDocumentV2(proposalCalculation([proposalBalcony('straight', 'aluminium', 'sliding')])).items[0]!.schemes[0]!.geometry;
    const arrow = geometry.sections[1]!.symbols[0]!;
    expect(arrow.kind).toBe('sliding'); expect(arrow.points).toHaveLength(5);
    expect(glazingPrimitives(geometry, true).lines).toEqual([{ points: arrow.points, kind: 'sliding', width: 1.5, dashed: false }]);
    const drawing = customerConstruction(geometry, customerSchemeLayout(geometry, 620, 440));
    const glass = drawing.contours.at(-1)!;
    const at = (x: number, y: number) => ({ x: glass.x + x * glass.width, y: glass.y + y * glass.height });
    expect(drawing.lines).toEqual([{ kind: 'sliding', dashed: false, points: [at(0.2, 0.5), at(0.8, 0.5), at(0.65, 0.4), at(0.8, 0.5), at(0.65, 0.6)] }]);
  });
  it('a supplied tilt-only symbol renders once, with the existing top apex', () => {
    const geometry = documentFor().items[0]!.schemes[0]!.geometry;
    const tilt = geometry.sections[1]!.symbols.find(s => s.kind === 'tilt')!;
    const isolated = { ...geometry, sections: [{ ...geometry.sections[1]!, symbols: [tilt] }] };
    expect(glazingPrimitives(isolated, true).lines).toEqual([{ points: tilt.points, kind: 'tilt', width: 1.5, dashed: true }]);
    const drawing = customerConstruction(isolated, customerSchemeLayout(isolated, 620, 440));
    const glass = drawing.contours.at(-1)!;
    const at = (x: number, y: number) => ({ x: glass.x + x * glass.width, y: glass.y + y * glass.height });
    expect(drawing.lines).toEqual([{ kind: 'tilt', dashed: true, points: [at(0.1, 0.9), at(0.5, 0.1), at(0.9, 0.9)] }]);
  });
});

describe('Feature 13 final human-perception pass', () => {
  it.each([
    [3680000, '36 800 ₽'], [30240000, '302 400 ₽'], [22350000, '223 500 ₽'],
    [123456, '1 234,56 ₽'], [1, '0,01 ₽'], [0, '0 ₽'],
    [Number.MAX_SAFE_INTEGER, '90 071 992 547 409,91 ₽'],
    [9007199254740900, '90 071 992 547 409 ₽'],
  ])('formats minor %s without rounding or unsafe conversion', (minor, expected) => {
    const amount = proposalMoneyV2(minor as number); const original = JSON.stringify(amount);
    expect(customerMoney(amount)).toBe(expected); expect(JSON.stringify(amount)).toBe(original);
    expect(customerMoney(amount, true)).toBe(`−${expected}`);
  });
  it('preserves the exact nonzero discount kopecks and leaves custom document wording alone', () => {
    expect(customerMoney(proposalMoneyV2(2363751), true)).toBe('−23 637,51 ₽');
    expect(customerMoney({ ...proposalMoneyV2(100), display: 'Согласованная сумма' })).toBe('Согласованная сумма');
  });
  it('fixed has frame/glass, active has frame/sash/glass; every symbol stays inside glazing', () => {
    const geometry = documentFor().items[0]!.schemes[0]!.geometry;
    const layout = customerSchemeLayout(geometry, 620, 440); const drawing = customerConstruction(geometry, layout);
    expect(drawing.contours.filter(r => r.kind === 'sash')).toHaveLength(1);
    expect(drawing.contours.filter(r => r.kind === 'glass')).toHaveLength(3); // fixed, active, transom
    const glass = drawing.contours.at(-1)!;
    for (const line of drawing.lines) for (const point of line.points) {
      expect(point.x).toBeGreaterThan(glass.x); expect(point.x).toBeLessThan(glass.x + glass.width);
      expect(point.y).toBeGreaterThan(glass.y); expect(point.y).toBeLessThan(glass.y + glass.height);
    }
    expect(drawing.lines.map(l => l.kind)).toEqual(['turn', 'tilt']);
    const svg = renderToStaticMarkup(<GlazingScheme customer geometry={geometry} label="Окно" />);
    expect(svg).toContain('stroke-width:3.2'); expect(svg).toContain('customer-sash'); expect(svg).toContain('customer-glass');
    expect(svg).toContain('stroke-width="1.1"'); expect(svg).not.toContain('opening-symbol hinge');
  });
  it('four adjacent active sashes retain full combined turn/tilt symbols and no decorative bars', () => {
    const window = proposalWindow(); if (window.windowType !== 'double') throw new Error('fixture');
    const original = documentFor(window).items[0]!.schemes[0]!.geometry;
    const section = original.sections[1]!;
    const geometry = { ...original, transom: null, bounds: { xMm: 0, yMm: 0, widthMm: 3600, heightMm: 1300 }, sections: Array.from({ length: 4 }, (_, index) => ({ ...section, xMm: 900 * index, yMm: 0, symbols: section.symbols.map(s => ({ ...s, points: s.points.map(p => ({ xMm: p.xMm - section.xMm + 900 * index, yMm: p.yMm - section.yMm })) })) })) };
    const drawing = customerConstruction(geometry, customerSchemeLayout(geometry, 936, 380));
    expect(drawing.contours.filter(r => r.kind === 'sash')).toHaveLength(4);
    expect(drawing.lines.filter(l => l.kind === 'hinge')).toHaveLength(0);
    for (let i = 0; i < 4; i++) {
      const turn = drawing.lines[i * 2]!; const tilt = drawing.lines[i * 2 + 1]!;
      expect(Math.min(...tilt.points.map(p => p.y))).toBe(Math.min(...turn.points.map(p => p.y)));
      expect(Math.max(...tilt.points.map(p => p.y))).toBe(Math.max(...turn.points.map(p => p.y)));
      expect(tilt.points[1]!.y).toBeLessThan(tilt.points[0]!.y);
      expect(turn.dashed).toBe(false); expect(tilt.dashed).toBe(true);
    }
  });
  it('groups true-width elevations, with secondary section dimensions lighter than overall sizes', () => {
    const geometry = documentFor().items[0]!.schemes[0]!.geometry;
    const widths = schemeColumnWidths([geometry, { ...geometry, bounds: { ...geometry.bounds, widthMm: 2800 } }, geometry], 936);
    expect(widths.reduce((a, b) => a + b, 0)).toBe(936); expect(widths[1]).toBeGreaterThan(widths[0]!);
    expect((widths[1]! - 120) / 2800).toBe((widths[0]! - 120) / 1400);
    const dimensions = customerSchemeLayout(geometry, 620, 440).dimensions;
    expect(dimensions.filter(d => d.primary)).toHaveLength(2);
    expect(dimensions.filter(d => !d.primary)).toHaveLength(4);
  });
  it('omits repeated room/type/defaults, keeps selected options and one orientation note per item', () => {
    const d = documentFor(); expect(itemPresentation(d.items[0]!).room).toBe(''); expect(itemPresentation(d.items[0]!).subtitle).toBe('');
    const text = body(d); expect(text).not.toMatch(/Двустворчатое|(?:^|\n)Спальня|Вид из помещения · мм|Техническая схема/);
    expect(text.match(/Вид из помещения/g)).toHaveLength(1); expect(text.match(/Размеры в мм/g)).toHaveLength(1);
    const block = documentFor(proposalBlock()); expect(body(block)).not.toMatch(/Балконный блок|Без ламинации/); expect(body(block)).toContain('Кухня');
    const finish = buildProposalDocumentV2(proposalCalculation([proposalFinish('manual')])); expect(body(finish)).not.toMatch(/(?:^|\n)Кухня|Размеры в мм/);
    const balcony = buildProposalDocumentV2(proposalCalculation([proposalBalcony('U', 'pvc', 'sliding', 'sandwich')]));
    expect(body(balcony)).not.toMatch(/Без ламинации|ПВХ|(?:^|\n)Балкон/); expect(body(balcony).match(/Низ —/g)).toHaveLength(1);
    expect(body(balcony).match(/Вид из помещения/g)).toHaveLength(1);
  });
  it.each([['Окно спальни', 'Спальня'], ['Отделка кухни', 'Кухня'], ['Окно гостиной', 'Гостиная'], ['Окно детской', 'Детская']])('omits room already contained in %s', (name, room) => {
    const item = documentFor().items[0]!;
    expect(itemPresentation({ ...item, name, room }).room).toBe('');
    expect(itemPresentation({ ...item, name: 'Выход на лоджию', room: 'Кухня' }).room).toBe('Кухня');
  });
  it('selects a compact seller identity and at most three useful contact values', () => {
    const seller = { companyName: 'Окна', sellerName: 'Иван', sellerPhone: '123', companyPhone: '456', telegram: '@okna', whatsapp: '789', email: 'hidden@email.test', inn: 'hidden-inn' };
    expect(sellerLines(seller)).toEqual(['Окна · Иван', '123 · Telegram: @okna · WhatsApp: 789']);
    expect(sellerLines({ email: 'mail@example.test' })).toEqual(['mail@example.test']);
    expect(sellerLines(undefined)).toEqual([]);
  });
  it('shares all customer monetary strings and aligns regular lines separately from stronger totals', () => {
    const d = documentFor(); const atoms = layoutProposalImages(d, measure).flatMap(p => p.cards.flatMap(c => c.card.atoms));
    const rows = atoms.filter(a => a.kind === 'text' && a.amount);
    expect(rows.filter(a => a.kind === 'text' && a.style === 'price')).toHaveLength(2);
    expect(rows.some(a => a.kind === 'text' && a.style === 'itemTotal')).toBe(true);
    expect(rows.some(a => a.kind === 'text' && a.style === 'final')).toBe(true);
    expect(body(d)).not.toMatch(/,00\s*₽/); expect(markup(d)).not.toMatch(/,00\s*₽/);
    for (const line of d.items[0]!.priceLines) { expect(body(d)).toContain(customerMoney(line.amount)); expect(markup(d)).toContain(customerMoney(line.amount)); }
  });
  it('keeps final summary with intact finish and order works rather than an orphan page', () => {
    const c = proposalCalculation([proposalWindow(), proposalBalcony('U', 'aluminium', 'sliding', 'sandwich'), proposalBlock(), proposalFinish('manual')]);
    c.measurements[0]!.additionalWorks = [{ id: 'removal', name: 'Демонтаж окна', quantity: 1.25, unit: 'runningMeter', unitPriceMinor: 12345 }];
    c.orderAdditionalWorks = [{ id: 'delivery', name: 'Доставка', quantity: 2, unit: 'piece', unitPriceMinor: 23456 }];
    c.discount = { mode: 'percent', discountPercent: 7.25 };
    const d = buildProposalDocumentV2(c, { companyName: 'Окна для вас', sellerName: 'Иван Петров', sellerPhone: '+7 900 1112233', telegram: '@okna' }); const pages = layoutProposalImages(d, measure);
    expect(pages).toHaveLength(2); expect(pages.at(-1)!.cards.length).toBeGreaterThan(1);
    expect(pages.at(-1)!.cards.at(-1)!.card.summary).toBe(true);
    expect(pages.flatMap(p => p.cards).filter(c => c.card.continuation)).toHaveLength(0);
  });
});

describe('Feature 13 dimensions and compact shared presentation', () => {
  it('puts overall/section/transom dimensions on the scheme with one uniform fit', () => {
    const g = documentFor().items[0]!.schemes[0]!.geometry; const layout = customerSchemeLayout(g, 936, 400);
    expect(layout.plot.width / g.bounds.widthMm).toBeCloseTo(layout.plot.height / g.bounds.heightMm, 12);
    expect(layout.dimensions.filter(d => d.axis === 'width').map(d => d.text)).toEqual(['500', '900', '1 400']);
    expect(layout.dimensions.filter(d => d.axis === 'height').map(d => d.text)).toEqual(['200', '1 300', '1 500']);
    const svg = renderToStaticMarkup(<GlazingScheme customer geometry={g} label="Вид из помещения" />);
    expect(svg).toContain('scheme-dimension'); expect(svg).toContain('viewBox="0 0 1400 1500"');
    const text = body(documentFor()); expect(text).not.toMatch(/(?:^|\n)500|1 400|Секция|Петли|Поворотно|Площадь/);
    expect(markup(documentFor())).not.toMatch(/client-sections|client-dimensions|Секция 1|Петли справа/);
  });
  it('shows balcony heights and unique section widths once per dimension chain', () => {
    const d = buildProposalDocumentV2(proposalCalculation([proposalBalcony('U', 'pvc', 'sliding', 'sandwich')]));
    for (const s of d.items[0]!.schemes) {
      const dimensions = customerSchemeLayout(s.geometry, 312, 400).dimensions;
      expect(dimensions.filter(d => d.axis === 'width').map(d => d.text)).toEqual(['600', '1 200', '1 800']);
      expect(dimensions.filter(d => d.axis === 'height').map(d => d.text)).toEqual(['1 500', '600', '2 100']);
    }
    const p = itemPresentation(d.items[0]!);
    expect(p.schemes.map(s => s.heading)).toEqual(['Левая сторона', 'Фасад', 'Правая сторона']);
    expect(p.lines.filter(s => s.includes('Низ'))).toEqual(['Низ — сэндвич-панель']);
    expect(body(d)).not.toMatch(/Секция|Верхний ряд|Нижний ряд|нижний 600|Два ряда|Открывание:/);
  });
  it('preserves genuinely different lower filling per plane instead of inventing a common setting', () => {
    const d = buildProposalDocumentV2(proposalCalculation([proposalBalcony('L', 'pvc', 'sliding', 'sandwich')])); const item = d.items[0]!;
    const changed = { ...item, schemes: item.schemes.map((s, i) => i ? { ...s, geometry: { ...s.geometry, sections: s.geometry.sections.map(section => ({ ...section, fill: 'glass' as const })) } } : s) };
    const p = itemPresentation(changed); expect(p.lines.some(s => s.startsWith('Низ'))).toBe(false);
    expect(p.schemes.map(s => s.note)).toEqual(['Низ — сэндвич-панель', 'Низ — стекло']);
  });
  it('compacts PVC profile/hardware, lamination and actual options without duplicate material/color rows', () => {
    const d = documentFor(); const p = itemPresentation(d.items[0]!);
    expect(p.lines).toEqual(['VEKA Softline 70 · Mako', 'Ламинация с двух сторон', 'Дополнительно: расширители, соединители']);
    const html = markup(d); expect(html.match(/Ламинация с двух сторон/g)).toHaveLength(1); expect(html).not.toContain('Материал: ПВХ'); expect(html).not.toContain('Комплектация:');
    const separateColor = { ...d.items[0]!, properties: d.items[0]!.properties.map(p => p.label === 'Цвет' ? { ...p, value: 'Золотой дуб' } : p) };
    expect(itemPresentation(separateColor).lines).toContain('Цвет: Золотой дуб');
  });
  it.each(['sliding', 'swing'] as const)('aluminium %s uses System, Color and mode, never lamination or PVC hardware', (mode) => {
    const d = buildProposalDocumentV2(proposalCalculation([proposalBalcony('L', 'aluminium', mode)]));
    const p = itemPresentation(d.items[0]!); expect(p.lines[0]).toContain('Алюминий · Алюминиевая система');
    expect(p.lines).toContain(`Цвет: Белый · ${mode === 'sliding' ? 'Раздвижное' : 'Распашное'}`);
    expect(markup(d)).not.toMatch(/Ламинация|Без ламинации|Mako|Секция/);
  });
  it('filters non-customer area metrics even when supplied as generic document properties', () => {
    const d = documentFor(); const item = d.items[0]!;
    const injected = { ...d, items: [{ ...item, properties: [...item.properties, ...['Площадь', 'Стекло', 'Сэндвич-панель', 'Активная площадь'].map(label => ({ label, value: '13,16 м²' }))] }] };
    expect(body(injected)).not.toMatch(/13,16|Площадь|м²/); expect(markup(injected)).not.toMatch(/13,16|Площадь|м²/);
  });
  it('keeps block sizes on the drawing and only profile/hardware/options below it', () => {
    const d = documentFor(proposalBlock()); const p = itemPresentation(d.items[0]!);
    expect(p.lines[0]).toContain('VEKA'); expect(p.lines[0]).toContain('Mako'); expect(p.lines[0]).toContain('Премиум');
    expect(customerSchemeLayout(d.items[0]!.schemes[0]!.geometry, 936, 400).dimensions.map(d => d.text)).toEqual(['800', '700', '600', '2 100', '1 500', '2 200']);
    expect(body(d)).not.toMatch(/Секция|700|2 200|Петли|Оконная часть:/);
  });
  it('finish has two metadata lines and one exact turnkey price; only real additional works justify a total', () => {
    const d = buildProposalDocumentV2(proposalCalculation([proposalFinish('manual')]));
    expect(itemPresentation(d.items[0]!).lines).toEqual(['Внутренняя · откосы и подоконник', 'Сэндвич-панель · Подоконник Стандарт']);
    expect(body(d).match(/1 234,56 ₽/g)).toHaveLength(2); // Once on item, once as proposal final amount.
    expect(body(d)).not.toMatch(/Итого по позиции|Проём:|глубина/);
    expect(itemPresentation({ ...d.items[0]!, additionalWorks: [{ name: 'Демонтаж', quantity: 1, amount: d.items[0]!.priceLines[0]!.amount }] }).showTotal).toBe(true);
  });
  it.each(['none', 'percent', 'fixedFinalPrice'] as const)('hides rounding mechanics for %s while preserving canonical money', (mode) => {
    const c = proposalCalculation(); c.discount = mode === 'none' ? { mode } : mode === 'percent' ? { mode, discountPercent: 7.25 } : { mode, fixedFinalPriceMinor: 1234567, confirmation: 'confirmed', confirmedSubtotalMinor: estimateCalculationVNext(c).subtotalMinor! };
    const d = buildProposalDocumentV2(c);
    const round = vi.spyOn(money, 'commercialRoundMinor'); const percent = vi.spyOn(money, 'percentageMinor');
    try {
      const text = body(d); expect(text).toContain(customerMoney(d.summary.total!)); expect(text).not.toMatch(/Округление|fixedFinalPrice|override/);
      expect(summaryLines(d.summary)).toHaveLength(mode === 'none' ? 0 : 2);
      if (mode !== 'none') { expect(text).toContain(customerMoney(d.summary.subtotal!)); expect(text).toContain(customerMoney(d.summary.discount!.amount)); }
      else expect(text).not.toContain('Сумма заказа');
      expect(markup(d)).not.toContain('Округление'); expect(round).not.toHaveBeenCalled(); expect(percent).not.toHaveBeenCalled();
    } finally { round.mockRestore(); percent.mockRestore(); }
  });
  it('keeps the representative four-card proposal under two bounded pages with summary last', () => {
    const pages = layoutProposalImages(buildProposalDocumentV2(proposalCalculation()), measure);
    expect(pages.length).toBeLessThanOrEqual(2);
    for (const page of pages) for (const {card, y} of page.cards) expect(y + card.height).toBeLessThanOrEqual(page.height - 48);
    expect(pages.at(-1)!.cards.at(-1)!.card.summary).toBe(true);
    const cards = pages.flatMap(p => p.cards);
    expect(cards[1]!.card.height).toBeLessThan(850); expect(cards[2]!.card.height).toBeLessThan(900);
  });
});
