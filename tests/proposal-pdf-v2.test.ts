import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { buildProposalDocumentV2, proposalMoneyV2 } from '../src/application/documents/build-proposal-document-v2';
import type { ProposalDocumentV2 } from '../src/domain/documents/proposal-document-v2';
import { createProposalPdfV2, pdfTextMeasure, renderProposalPdfV2 } from '../src/infrastructure/pdf-v2/render-proposal-pdf-v2';
import { layoutProposalPdfV2, PDF_PAGE, PDF_WIDTH, type PdfPage } from '../src/infrastructure/pdf-v2/layout';
import { customerMoney } from '../src/presentation/customer-money';
import { customerConstruction, customerSchemeLayout } from '../src/presentation/glazing-drawing';
import { itemPresentation } from '../src/presentation/proposal-presentation';
import { proposalCalculation, proposalWindow, proposalBlock, proposalBalcony, proposalFinish } from './fixtures/proposal-v2';
import { pdfReviewDocument } from './fixtures/pdf-v2';
import * as money from '../src/domain/money';

const paint = vi.hoisted(() => ({ text: [] as { text: string; x: number; y: number; page: number; size: number }[],
  rect: [] as { x: number; y: number; width: number; height: number; page: number }[] }));
vi.mock('jspdf', async importOriginal => {
  const actual = await importOriginal<typeof import('jspdf')>();
  return { ...actual, jsPDF: class extends actual.jsPDF {
    constructor(options: ConstructorParameters<typeof actual.jsPDF>[0]) {
      super(options);
      const text = this.text; const rect = this.rect;
      this.text = (...args: Parameters<typeof text>) => {
        paint.text.push({ text: String(args[0]), x: args[1], y: args[2], page: this.getNumberOfPages(), size: this.getFontSize() });
        return Reflect.apply(text, this, args);
      };
      this.rect = (...args: Parameters<typeof rect>) => {
        paint.rect.push({ x: args[0], y: args[1], width: args[2], height: args[3], page: this.getNumberOfPages() });
        return Reflect.apply(rect, this, args);
      };
    }
  } };
});
beforeEach(() => { paint.text.length = 0; paint.rect.length = 0; });
const layout = (document: ProposalDocumentV2) => layoutProposalPdfV2(document, pdfTextMeasure(createProposalPdfV2()));
const rows = (pages: PdfPage[]) => pages.flatMap(page => page.cards.flatMap(({ card }) => card.blocks.flatMap(b => b.rows)));
const content = (document: ProposalDocumentV2) => rows(layout(document)).flatMap(row => row.kind === 'text'
  ? [row.text, row.amount || ''] : row.schemes.flatMap(s => s.titles)).join('\n');
const normalize = (value: string) => value.replace(/\s/g, ' ');
function safePages(pages: PdfPage[]) {
  expect(pages.length).toBeGreaterThan(0);
  for (const page of pages) {
    expect(page.cards.length).toBeGreaterThan(0); let bottom: number = PDF_PAGE.margin;
    for (const { card, y } of page.cards) {
      expect(y).toBeGreaterThanOrEqual(bottom); expect(y + card.height).toBeLessThanOrEqual(PDF_PAGE.bottom);
      expect(card.blocks.reduce((sum, b) => sum + b.height, 0)).toBeCloseTo(card.height, 8);
      bottom = y + card.height;
    }
  }
  expect(pages.at(-1)!.cards.at(-1)!.card.summary).toBe(true);
}

describe('Feature 14 architecture and customer content', () => {
  it('embeds real Cyrillic, ruble and mathematical minus glyphs with nonzero advance', () => {
    const font = createProposalPdfV2().getFont().metadata;
    for (const character of ['Я', 'ё', '₽', '−']) {
      const glyph = font.characterToGlyph(character.codePointAt(0));
      expect(glyph).toBeGreaterThan(0); expect(font.widthOfGlyph(glyph)).toBeGreaterThan(0);
    }
  });
  it('renders real PDF bytes from a serialized detached v2 DTO without mutations or pricing calls', async () => {
    const d = JSON.parse(JSON.stringify(pdfReviewDocument())) as ProposalDocumentV2; const before = JSON.stringify(d);
    const round = vi.spyOn(money, 'commercialRoundMinor'); const percent = vi.spyOn(money, 'percentageMinor');
    try {
      const blob = await renderProposalPdfV2(d);
      expect(blob.type).toBe('application/pdf'); expect(blob.size).toBeGreaterThan(10000);
      const bytes = new TextDecoder().decode(await blob.arrayBuffer());
      expect(bytes.startsWith('%PDF-')).toBe(true); expect(bytes).toContain('/FontFile2'); expect(bytes).not.toContain('/Subtype /Image');
      expect([...bytes.matchAll(/\/Type \/Page\b/g)]).toHaveLength(layout(d).length);
      expect(round).not.toHaveBeenCalled(); expect(percent).not.toHaveBeenCalled(); expect(JSON.stringify(d)).toBe(before);
      for (const item of d.items) for (const line of item.priceLines) expect(paint.text.map(t => t.text)).toContain(customerMoney(line.amount));
      expect(paint.text.map(t => t.text)).toContain(customerMoney(d.summary.total!));
    } finally { round.mockRestore(); percent.mockRestore(); }
  });
  it('depends only on v2 DTO/presentation/font and never imports Calculation, Settings, pricing, legacy rendering or a conversion', () => {
    const sources = [...readdirSync('src/infrastructure/pdf-v2').filter(f => f.endsWith('.ts')).map(f => `src/infrastructure/pdf-v2/${f}`),
      'src/application/documents/proposal-pdf-v2.ts', 'src/presentation/proposal-presentation.ts', 'src/presentation/glazing-drawing.ts', 'src/presentation/customer-money.ts'];
    for (const file of sources) expect(readFileSync(file, 'utf8')).not.toMatch(/from ['"][^'"]*(calculation|estimate|pricing|settings|storage|ui\/|render-proposal-pdf['"]|proposal-document['"])|buildProposalDocument|commercialRound|percentageMinor|localStorage|indexedDB|Dexie|fetch\(/);
    const root = readFileSync('src/main.tsx', 'utf8'); expect(root).toContain("import('./infrastructure/pdf-v2/render-proposal-pdf-v2')");
    expect(root).not.toContain("import('./infrastructure/pdf/render-proposal-pdf')");
  });
  it('preserves the legacy PDF and renderer-neutral ProposalDocument v2 byte for byte', () => {
    const expected: Record<string, string> = {
      // Baseline hashes from main 5ef20b5.
      'src/infrastructure/pdf/render-proposal-pdf.ts': 'c8f483148056cd81b7e8a24ff4b1637cc3ed7b2bd10e3f59d6f3f55cb2d85ac9',
      'src/infrastructure/pdf/layout.ts': 'c81d2f04cb0ee19676f1ba102518d27cbd623195935549c5688b19f1a8244cf3',
      'src/domain/documents/proposal-document-v2.ts': '76e94703e6053caecb063c074430ef4c84b8aeae57bc97bb0ac1daf48ffd0186',
      'src/application/documents/proposal-pdf.ts': 'd2640a8654d6d9dc20cabfaee6540ce66f47ecf8954d51661935902fd136c072',
    };
    for (const [file, hash] of Object.entries(expected)) expect(createHash('sha256').update(readFileSync(file, 'utf8').replaceAll('\r\n', '\n')).digest('hex')).toBe(hash);
  });
  it('includes canonical header/client and compact seller, and omits absent seller and invented date', () => {
    const d = pdfReviewDocument(); const text = content(d);
    for (const value of ['Остекление квартиры', 'Анна Иванова', 'Новосибирск, Ленина, 7', '+7 900 1234567', 'Окна для вас · Иван Петров', '+7 900 1112233 · Telegram: @okna']) expect(text).toContain(value);
    const { seller: _seller, ...absent } = d;
    expect(content(absent)).not.toMatch(/Иван Петров|Окна для вас|@okna|Дата|2026/);
  });
  it.each(['Window', 'balconyBlock'] as const)('%s keeps the scheme first and only approved configuration / price lines', kind => {
    const d = buildProposalDocumentV2(proposalCalculation([kind === 'Window' ? proposalWindow() : proposalBlock()]));
    const item = d.items[0]!; const planned = rows(layout(d)); const text = content(d);
    expect(planned.findIndex(row => row.kind === 'schemes')).toBeLessThan(planned.findIndex(row => row.kind === 'text' && row.text.includes('VEKA')));
    expect(planned.filter(row => row.kind === 'schemes').flatMap(row => row.kind === 'schemes' ? row.schemes.map(s => s.geometry) : [])).toEqual(item.schemes.map(s => s.geometry));
    expect(text).toContain('VEKA Softline 70'); expect(text).toContain('Mako');
    for (const line of item.priceLines) { expect(text).toContain(line.label); expect(text).toContain(customerMoney(line.amount)); }
    expect(text).toContain(customerMoney(item.total!)); expect(text).not.toMatch(/Секция|Петли|Площадь|ПВХ/);
    if (kind === 'Window') expect(itemPresentation(item).lines).toEqual(['VEKA Softline 70 · Mako', 'Ламинация с двух сторон', 'Дополнительно: расширители, соединители']);
    else expect(text).toContain('Кухня');
  });
  it.each(['straight', 'L', 'U'] as const)('renders PVC and aluminium %s with all planes, sliding and two rows', shape => {
    for (const material of ['pvc', 'aluminium'] as const) {
      const d = buildProposalDocumentV2(proposalCalculation([proposalBalcony(shape, material, 'sliding', 'sandwich')]));
      const text = content(d); expect(text).toContain(d.items[0]!.typeLabel); expect(text).toContain('Низ — сэндвич-панель');
      const schemes = rows(layout(d)).flatMap(row => row.kind === 'schemes' ? row.schemes : []);
      expect(schemes).toHaveLength(shape === 'straight' ? 1 : shape === 'L' ? 2 : 3);
      expect(schemes.map(s => s.geometry)).toEqual(d.items[0]!.schemes.map(s => s.geometry));
      if (material === 'aluminium') { expect(text).toContain('Алюминий ·'); expect(text).toContain('Цвет: Белый · Раздвижное'); expect(text).not.toMatch(/ламинац|Mako/i); }
      else expect(text).toContain('VEKA Softline 70 · Mako');
      expect(text).not.toMatch(/Верхний ряд|Нижний ряд|Секция|tilt_turn|sliding/); safePages(layout(d));
    }
  });
  it.each(['automatic', 'manual'] as const)('keeps %s finish compact with one turnkey item price', mode => {
    const d = buildProposalDocumentV2(proposalCalculation([proposalFinish(mode)])); const item = d.items[0]!;
    const card = layout(d).flatMap(p => p.cards).find(({card}) => card.blocks.some(b => b.rows.some(row => row.kind === 'text' && row.text === item.name)))!.card;
    const amounts = card.blocks.flatMap(b => b.rows.flatMap(row => row.kind === 'text' && row.amount ? [row.amount] : []));
    expect(amounts).toEqual([customerMoney(item.priceLines[0]!.amount)]); expect(card.continuation).toBe(false);
    expect(content(d)).toContain('Внутренняя · откосы и подоконник'); expect(content(d)).toContain('Сэндвич-панель · Подоконник Стандарт');
    if (mode === 'manual') expect(amounts).toEqual(['1 234,56 ₽']);
  });
  it('renders works from their document amount and quantity, and the approved discount/summary only', () => {
    const d = pdfReviewDocument(); const text = normalize(content(d));
    for (const value of ['Доставка · 2 шт.', '500 ₽', 'Демонтаж окна · 1,25 пог. м', '200 ₽', 'Скидка 7,25%', 'Сумма заказа']) expect(text).toContain(value);
    expect(text).toContain(normalize(customerMoney(d.summary.discount!.amount, true))); expect(text).toContain(normalize(customerMoney(d.summary.total!)));
    expect(content(pdfReviewDocument('window'))).not.toContain('Сумма заказа');
    expect(text).not.toMatch(/Округление|себестоимость|зарплат|наценк|activeArea|glassArea|sandwichArea|м²|fixedFinalPrice|private-work|private-order|hardwareId|profileId|unitPrice/i);
  });
  it('filters internal technical properties even if supplied by a detached DTO', () => {
    const d = pdfReviewDocument('window'); const item = d.items[0]!;
    const injected = { ...d, items: [{ ...item, properties: [...item.properties, ...['Площадь', 'Активная площадь', 'Стекло', 'Сэндвич-панель', 'Себестоимость', 'Зарплата монтажника', 'Наценка'].map(label => ({ label, value: 'SECRET 13,16 м² 50%' }))] }] };
    expect(content(injected)).not.toMatch(/SECRET|13,16|50%|Площадь|м²/);
  });
  it('renders unresolved finish with clarification and no trustworthy summary total, subtotal or zero substitute', async () => {
    const d = pdfReviewDocument('unresolved'); const text = content(d); await renderProposalPdfV2(d);
    expect(text).toContain('Цена отделки требует уточнения'); expect(d.summary.total).toBeNull();
    expect(rows(layout(d)).some(row => row.kind === 'text' && row.style === 'final')).toBe(false);
    expect(paint.text.some(row => row.size === 22)).toBe(false); expect(text).not.toMatch(/Сумма заказа|нет подходящего|0,00/);
  });
  it('preserves zero/nonzero kopecks, exact large money, negative discounts and arbitrary DTO display strings', async () => {
    const d = pdfReviewDocument('exact'); await renderProposalPdfV2(d);
    const text = normalize(paint.text.map(t => t.text).join('\n'));
    expect(text).toContain('90 071 992 547 409,91 ₽'); expect(text).toContain('90 071 992 547 409,89 ₽'); expect(text).toContain('−0,02 ₽');
    for (const minor of [3680000, 30240000, 123456]) {
      const value = proposalMoneyV2(minor); const custom = { ...d, summary: { ...d.summary, total: value } };
      expect(content(custom)).toContain(customerMoney(value));
    }
    const custom = { ...d, summary: { ...d.summary, total: { ...proposalMoneyV2(101), display: 'Точные деньги из DTO' } } };
    expect(content(custom)).toContain('Точные деньги из DTO'); expect(content(pdfReviewDocument())).not.toMatch(/,00\s*₽/);
  });
  it('uses the same frame/sash/opening primitives, with hinge markers removed and solid/dashed/sliding paths retained', async () => {
    for (const scenario of ['window', 'pvc-u', 'aluminium', 'full']) {
      const d = pdfReviewDocument(scenario); await renderProposalPdfV2(d);
      for (const scheme of d.items.flatMap(item => item.schemes)) {
        const geometry = scheme.geometry; const construction = customerConstruction(geometry, customerSchemeLayout(geometry, 936, 440));
        expect(construction.lines.every(line => line.kind !== 'hinge')).toBe(true);
        for (const line of construction.lines) expect(line.dashed).toBe(line.kind === 'tilt');
      }
    }
    for (const r of paint.rect) { expect(r.width).toBeGreaterThan(0); expect(r.height).toBeGreaterThan(0);
      expect(r.x).toBeGreaterThanOrEqual(PDF_PAGE.margin); expect(r.x + r.width).toBeLessThanOrEqual(210 - PDF_PAGE.margin);
      expect(r.y).toBeGreaterThanOrEqual(PDF_PAGE.margin); expect(r.y + r.height).toBeLessThanOrEqual(PDF_PAGE.bottom); }
  });
});

describe('A4 deterministic pagination', () => {
  it('fits a simple proposal, keeps small cards intact, and has no trailing blank pages', () => {
    const pages = layout(pdfReviewDocument('window')); safePages(pages); expect(pages).toHaveLength(1);
    expect(pages[0]!.cards.every(c => !c.card.continuation)).toBe(true);
    expect(PDF_PAGE).toMatchObject({ width: 210, height: 297, margin: 16 }); expect(PDF_WIDTH).toBe(178);
  });
  it('uses real embedded font metrics and produces identical full/large layouts and stable page counts', async () => {
    const d = pdfReviewDocument(); const full = layout(d); safePages(full); expect(full).toEqual(layout(structuredClone(d)));
    expect(full).toHaveLength(2);
    const large = { ...d, items: Array.from({ length: 32 }, (_, i) => ({ ...d.items[i % d.items.length]!, id: `copy-${i}` })) };
    const pages = layout(large); safePages(pages); expect(pages).toEqual(layout(large)); expect(pages.length).toBeGreaterThan(5);
    await renderProposalPdfV2(d); expect(paint.text.filter(t => t.text.startsWith('Страница '))).toHaveLength(full.length);
    expect(paint.text.filter(t => t.size === 22).every(t => t.page === full.length)).toBe(true);
  });
  it('starts the next small item on the same page when it fits and keeps both cards intact', () => {
    const d = pdfReviewDocument(); const items = [d.items[0]!, d.items[3]!];
    const pages = layout({ ...d, items, orderAdditionalWorks: [] }); safePages(pages);
    expect(pages).toHaveLength(1);
    for (const item of items) {
      const cards = pages[0]!.cards.filter(({ card }) => card.blocks.some(b => b.rows.some(r => r.kind === 'text' && r.text === item.name)));
      expect(cards).toHaveLength(1); expect(cards[0]!.card.continuation).toBe(false);
      for (const line of item.priceLines) expect(cards[0]!.card.blocks.flatMap(b => b.rows)
        .some(r => r.kind === 'text' && r.amount === customerMoney(line.amount))).toBe(true);
    }
  });
  it('uses the lower half of the full proposal for balcony schemes and keeps its tail and summary atomic', () => {
    const d = pdfReviewDocument(); const pages = layout(d); safePages(pages);
    const first = pages[0]!; const last = first.cards.at(-1)!;
    expect(rows([first]).some(r => r.kind === 'text' && r.text === d.items[0]!.name)).toBe(true);
    expect(rows([first]).some(r => r.kind === 'text' && r.text === d.items[1]!.name)).toBe(true);
    expect(last.card.blocks.flatMap(b => b.rows).filter(r => r.kind === 'schemes')).toHaveLength(1);
    expect(last.y + last.card.height).toBeGreaterThan(PDF_PAGE.bottom - 12);
    const tail = pages[1]!.cards[0]!.card; expect(tail.continuation).toBe(true);
    expect(tail.blocks.flatMap(b => b.rows).filter(r => r.kind === 'text' && r.amount)).toHaveLength(3);
    for (const item of d.items.filter(i => i.kind !== 'Balcony')) {
      const cards = pages.flatMap(p => p.cards).filter(({ card }) => card.blocks.some(b => b.rows.some(r => r.kind === 'text' && r.text === item.name)));
      expect(cards).toHaveLength(1); expect(cards[0]!.card.continuation).toBe(false);
    }
    const summaries = pages.flatMap(p => p.cards).filter(c => c.card.summary); expect(summaries).toHaveLength(1);
    expect(summaries[0]!.card.blocks).toHaveLength(1); expect(summaries[0]!.card.continuation).toBe(false);
    const preceding = pages[1]!.cards.at(-2)!;
    expect(summaries[0]!.y - preceding.y - preceding.card.height).toBeCloseTo(PDF_PAGE.gap);
    expect(content(d)).not.toContain('Размеры в мм');
  });
  it('splits an oversized dense U balcony only between whole planes and keeps configuration/prices together', () => {
    const balcony = proposalBalcony('U', 'pvc', 'sliding', 'sandwich');
    balcony.planes = balcony.planes.map(plane => ({ ...plane, widthMm: 4000, sectionCount: 8,
      sections: Array.from({length: 8}, (_, i) => ({ id: `s${i}`, widthMm: 500, openingType: 'fixed' as const })) }));
    const d = buildProposalDocumentV2(proposalCalculation([balcony])); const pages = layout(d); safePages(pages);
    const cards = pages.flatMap(p => p.cards); expect(cards.some(c => c.card.continuation)).toBe(true);
    const planned = rows(pages); expect(planned.filter(r => r.kind === 'schemes')).toHaveLength(3);
    for (const scheme of d.items[0]!.schemes) expect(planned.filter(r => r.kind === 'schemes').flatMap(r => r.kind === 'schemes' ? r.schemes.map(s => s.geometry) : [])).toContainEqual(scheme.geometry);
    const tail = cards.find(c => c.card.blocks.some(b => b.rows.some(r => r.kind === 'text' && r.text.includes('VEKA'))))!.card;
    expect(tail.blocks.flatMap(b => b.rows).filter(r => r.kind === 'text' && r.amount)).toHaveLength(3);
    const first = cards.find(c => c.card.blocks.some(b => b.rows.some(r => r.kind === 'text' && r.text === balcony.name)))!.card;
    expect(first.blocks.flatMap(b => b.rows).some(r => r.kind === 'schemes')).toBe(true);
    expect(cards.at(-1)!.card.blocks.some(b => b.rows.some(r => r.kind === 'text' && r.style === 'final'))).toBe(true);
    // An oversized item also uses remaining space after a preceding small card.
    const finish = pdfReviewDocument().items[3]!;
    const prefixed = layout({ ...d, items: [finish, ...d.items] }); safePages(prefixed);
    expect(rows([prefixed[0]!]).some(r => r.kind === 'text' && r.text === finish.name)).toBe(true);
    expect(rows([prefixed[0]!]).some(r => r.kind === 'text' && r.text === balcony.name)).toBe(true);
    expect(rows([prefixed[0]!]).some(r => r.kind === 'schemes')).toBe(true);
    expect(rows(prefixed).filter(r => r.kind === 'schemes')).toHaveLength(3);
  });
  it('wraps unusually long metadata/works without clipping or blank pages', () => {
    const d = pdfReviewDocument(); const huge = { ...d, context: { ...d.context, clientName: 'Имя'.repeat(1500) },
      items: [{ ...d.items[0]!, additionalWorks: Array.from({ length: 100 }, (_, i) => ({ name: `Работа ${i}`, quantity: 1, amount: proposalMoneyV2(123456) })) }] };
    const pages = layout(huge); safePages(pages); expect(pages.length).toBeGreaterThan(3);
    const measure = pdfTextMeasure(createProposalPdfV2());
    for (const row of rows(pages)) if (row.kind === 'text') expect(measure(row.text, row.style) + (row.amount ? measure(row.amount, row.style) + 6 : 0)).toBeLessThanOrEqual(PDF_WIDTH + 0.001);
  });
});
