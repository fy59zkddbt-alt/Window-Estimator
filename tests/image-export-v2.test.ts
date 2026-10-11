import { customerMoney } from '../src/presentation/customer-money';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { buildProposalDocumentV2 } from '../src/application/documents/build-proposal-document-v2';
import { estimateCalculationVNext } from '../src/application/estimate/estimate-calculation-vnext';
import type { ProposalDocumentV2 } from '../src/domain/documents/proposal-document-v2';
import { imageFilename, IMAGE_WIDTH, IMAGE_MARGIN, MAX_IMAGE_HEIGHT, imageContentWidth, layoutProposalImages, textStyles, wrapImageText, type ImagePage, type TextStyle } from '../src/ui/export/proposal-image-layout';
import { renderProposalImages, downloadProposalImage } from '../src/ui/export/render-proposal-images';
import { glazingPrimitives } from '../src/ui/glazing-drawing';
import { itemPresentation } from '../src/ui/proposal-presentation';
import { proposalCalculation, proposalWindow, proposalBalcony, proposalBlock, proposalFinish } from './fixtures/proposal-v2';
import * as money from '../src/domain/money';

// Deterministic width approximation for pure planning tests. Actual font metrics are
// exercised separately by the browser harness against the real canvas renderer.
const measure = (text: string, style: TextStyle) => Array.from(text).length * textStyles[style].size * 0.56;
const layout = (d: ProposalDocumentV2) => layoutProposalImages(JSON.parse(JSON.stringify(d)), measure);
const atoms = (pages: ImagePage[]) => pages.flatMap((p) => p.cards.flatMap(({ card }) => card.atoms));
const content = (pages: ImagePage[]) => atoms(pages).flatMap((a) => a.kind === 'text' ? [a.text, ...(a.amount ? [a.amount] : [])] : []).join('\n');
const doc = () => buildProposalDocumentV2(proposalCalculation());

function safePages(pages: ImagePage[]) {
  expect(pages.length).toBeGreaterThan(0);
  for (const page of pages) {
    expect(page.cards.length).toBeGreaterThan(0); expect(page.height).toBeLessThanOrEqual(MAX_IMAGE_HEIGHT);
    let bottom = IMAGE_MARGIN;
    for (const { card, y } of page.cards) {
      expect(y).toBeGreaterThanOrEqual(bottom); expect(y + card.height).toBeLessThanOrEqual(page.height - IMAGE_MARGIN);
      expect(card.atoms.reduce((sum, a) => sum + a.height, 48)).toBe(card.height);
      bottom = y + card.height;
      for (const atom of card.atoms) if (atom.kind === 'text') expect(measure(atom.text, atom.style)).toBeLessThanOrEqual(imageContentWidth);
    }
  }
  expect(pages.at(-1)!.cards.at(-1)!.card.summary).toBe(true);
}

describe('Feature 13 ProposalDocument-only image presentation', () => {
  it('has no calculation, estimate, pricing, mutable settings, conversion, persistence or PDF dependencies', () => {
    const sources = [...readdirSync('src/ui/export').filter(f => f !== 'PdfExportAction.tsx').map((f) => `src/ui/export/${f}`), 'src/ui/proposal-presentation.ts', 'src/ui/glazing-drawing.ts', 'src/presentation/proposal-presentation.ts', 'src/presentation/glazing-drawing.ts', 'src/presentation/customer-money.ts', 'src/ui/ClientView.tsx'];
    for (const file of sources) {
      // Client View now also exposes the injected v2 PDF port, never a PDF implementation.
      const source = readFileSync(file, 'utf8').replace(/import type .*proposal-pdf-v2';/g, '');
      expect(source).not.toMatch(/from ['"][^'"]*(calculation|estimate|pricing|settings|storage|pdf)|buildProposalDocument|commercialRound|percentageMinor|localStorage|indexedDB|Dexie|toDataURL|foreignObject/);
    }
    const d = doc(); const before = JSON.stringify(d); layout(d); expect(JSON.stringify(d)).toBe(before);
  });
  it('maps only available seller/client/object fields and omits absent seller without placeholders', () => {
    const d = doc(); const seller = { companyName: 'Окна для вас', sellerName: 'Иван Петров', sellerPhone: '+7 900 2223344', companyPhone: '+7 900 3334455', telegram: '@okna', whatsapp: '+7 900 4445566', email: 'okna@example.org', website: 'https://example.org', inn: '1234567890' };
    const text = content(layout({ ...d, seller })); for (const value of [seller.companyName, seller.sellerName, seller.sellerPhone, seller.telegram, seller.whatsapp]) expect(text).toContain(value);
    for (const value of [seller.companyPhone, seller.email, seller.website, seller.inn]) expect(text).not.toContain(value);
    expect(text).toContain(d.context.clientName); expect(text).toContain(d.context.objectAddress);
    expect(content(layout(d))).not.toMatch(/Телефон компании|undefined|null|Дата замера|Замерщик|calculation-12/);
  });
  it.each([
    ['window', proposalWindow()], ['block', proposalBlock()], ['straight PVC', proposalBalcony('straight')],
    ['L PVC', proposalBalcony('L')], ['U PVC', proposalBalcony('U')], ['aluminium sliding', proposalBalcony('U', 'aluminium', 'sliding')],
    ['aluminium swing', proposalBalcony('L', 'aluminium', 'swing')], ['two-row glass', proposalBalcony('L', 'pvc', 'sliding', 'glass')],
    ['two-row sandwich', proposalBalcony('U', 'aluminium', 'sliding', 'sandwich')], ['automatic finish', proposalFinish()], ['manual finish', proposalFinish('manual')],
  ] as const)('renders %s labels, dimensions, configurations, exact prices and canonical schemes', (_, measurement) => {
    const d = buildProposalDocumentV2(proposalCalculation([measurement])); const pages = layout(d); const text = content(pages); const item = d.items[0]!;
    expect(text).toContain(item.name);
    if (itemPresentation(item).room) expect(text).toContain(itemPresentation(item).room);
    if (item.kind === 'Balcony') expect(text).toContain(item.typeLabel);
    for (const line of itemPresentation(item).lines) expect(text).toContain(line);
    for (const price of item.priceLines) { expect(text).toContain(price.label); expect(text).toContain(customerMoney(price.amount)); }
    expect(atoms(pages).flatMap((a) => a.kind === 'schemes' ? a.geometries : [])).toEqual(item.schemes.map((s) => s.geometry));
    for (const s of item.schemes) {
      const p = glazingPrimitives(s.geometry, true); expect(p.rectangles.length).toBe(s.geometry.sections.length + (s.geometry.transom ? 1 : 0));
      expect(p.lines.length).toBe(s.geometry.sections.reduce((n, s) => n + s.symbols.filter(symbol => symbol.kind !== 'hinge').length, 0) + (s.geometry.splitLine ? 1 : 0));
    }
    safePages(pages);
  });
  it.each(['none', 'percent', 'fixedFinalPrice'] as const)('preserves canonical works, discount and %s final result', (mode) => {
    const c = proposalCalculation([proposalWindow()]); c.measurements[0]!.additionalWorks = [{ id: 'secret-work', name: 'Демонтаж окна', quantity: 1.25, unit: 'runningMeter', unitPriceMinor: 12345 }];
    c.orderAdditionalWorks = [{ id: 'secret-order', name: 'Доставка', quantity: 2, unit: 'piece', unitPriceMinor: 45678 }];
    c.discount = mode === 'none' ? { mode } : mode === 'percent' ? { mode, discountPercent: 7.25 } : { mode, fixedFinalPriceMinor: 1234567, confirmation: 'confirmed', confirmedSubtotalMinor: estimateCalculationVNext(c).subtotalMinor! };
    const d = buildProposalDocumentV2(c); const text = content(layout(d));
    for (const value of ['Демонтаж окна', '1,25 пог. м', 'Доставка', '2 шт.', customerMoney(d.items[0]!.additionalWorks[0]!.amount), customerMoney(d.orderAdditionalWorks[0]!.amount), customerMoney(d.summary.total!)]) expect(text).toContain(value);
    if (d.summary.discount) expect(text).toContain(d.summary.discount.label);
    expect(text).not.toMatch(/secret-|fixedFinalPrice/);
  });
  it.each(['unresolved', 'pending'] as const)('exports %s finish honestly without a fabricated final total or internal reason', (mode) => {
    const d = buildProposalDocumentV2(proposalCalculation([proposalWindow(), proposalFinish(mode)])); const text = content(layout(d));
    expect(text).toContain('Цена отделки требует уточнения'); expect(text).not.toContain('Сумма заказа'); expect(text).not.toMatch(/диапазон|materialId/);
    expect(atoms(layout(d)).filter(a => a.kind === 'text' && a.style === 'final')).toHaveLength(0);
    expect(text).toContain(customerMoney(d.items[0]!.priceLines[0]!.amount));
  });
  it('never displays internal cost/salary/reserve/markup, IDs or enum keys', () => {
    expect(content(layout(doc()))).not.toMatch(/себестоимость|зарплат|наценк|запас|markup|installer|profileId|hardwareId|materialId|tilt_turn|fixedFinalPrice|needsConfirmation|pvc-standard|calculation-12/i);
  });
  it('uses exact manual/fixed/large strings without commercial rounding or monetary arithmetic', () => {
    const c = proposalCalculation([proposalFinish('manual', Number.MAX_SAFE_INTEGER)]); c.discount = { mode: 'fixedFinalPrice', fixedFinalPriceMinor: Number.MAX_SAFE_INTEGER - 2, confirmation: 'confirmed', confirmedSubtotalMinor: Number.MAX_SAFE_INTEGER };
    const d = buildProposalDocumentV2(c); const round = vi.spyOn(money, 'commercialRoundMinor'); const percent = vi.spyOn(money, 'percentageMinor');
    try { const text = content(layout(d)); expect(text).toContain('90 071 992 547 409,91 ₽'); expect(text).toContain('90 071 992 547 409,89 ₽'); expect(round).not.toHaveBeenCalled(); expect(percent).not.toHaveBeenCalled(); }
    finally { round.mockRestore(); percent.mockRestore(); }
    const custom = { ...d, summary: { ...d.summary, total: { ...d.summary.total!, display: 'Точное значение из документа' } } };
    expect(content(layout(custom))).toContain('Точное значение из документа');
  });
  it('small proposal is one image; representative four-measurement proposal is at most two', () => {
    expect(layout(buildProposalDocumentV2(proposalCalculation([proposalWindow()])))).toHaveLength(1);
    const pages = layout(doc()); expect(pages.length).toBeLessThanOrEqual(2); safePages(pages);
    expect(pages.flatMap((p) => p.cards).every(({ card }) => !card.continuation)).toBe(true);
  });
  it('large documents split deterministically with every small card intact and summary last', () => {
    const base = doc(); const d = { ...base, items: Array.from({ length: 24 }, (_, i) => ({ ...base.items[i % base.items.length]!, id: `item-${i}` })) };
    const pages = layout(d); expect(pages.length).toBeGreaterThan(2); expect(layout(d)).toEqual(pages); safePages(pages);
    expect(pages.flatMap((p) => p.cards).filter(({ card }) => card.continuation)).toHaveLength(0);
    expect(atoms(pages).filter((a) => a.kind === 'schemes')).toHaveLength(18);
  });
  it('splits an oversized measurement internally without losing text/diagrams or blank pages', () => {
    const base = doc(); const item = base.items[0]!;
    const d = { ...base, items: [{ ...item, additionalWorks: Array.from({ length: 140 }, (_, i) => ({ name: `Работа номер ${i}`, quantity: 1, amount: item.total! })) }] };
    const pages = layout(d); expect(pages.some((p) => p.cards.some(({ card }) => card.continuation))).toBe(true); safePages(pages);
    const text = content(pages); for (let i = 0; i < 140; i++) expect(text).toContain(`Работа номер ${i} ·`);
    expect(atoms(pages).filter((a) => a.kind === 'schemes')).toHaveLength(1);
  });
  it('wraps unbroken Unicode, multiline and very long values without horizontal clipping', () => {
    const input = 'ОченьДлинноеИмя'.repeat(120); const lines = wrapImageText(input, 'title', measure);
    expect(lines.join('')).toBe(input); for (const line of lines) expect(measure(line, 'title')).toBeLessThanOrEqual(imageContentWidth);
    const d = doc(); safePages(layout({ ...d, context: { ...d.context, name: input, objectAddress: input } }));
    safePages(layout({ ...d, items: [{ ...d.items[0]!, name: input.repeat(3) }] }));
  });
  it('omits absent client context and handles pending fixed amount without inventing a total', () => {
    const c = proposalCalculation(); delete c.name; delete c.clientName; delete c.clientPhone; delete c.objectAddress;
    c.discount = { mode: 'fixedFinalPrice', fixedFinalPriceMinor: 1234567, confirmation: 'needsConfirmation', confirmedSubtotalMinor: estimateCalculationVNext(c).subtotalMinor! };
    const text = content(layout(buildProposalDocumentV2(c)));
    expect(text).toContain('Ваше предложение'); expect(text).toContain('Итоговая стоимость требует подтверждения');
    expect(text).not.toMatch(/undefined|null|12 345,67|fixedFinalPrice/);
    expect(atoms(layout(buildProposalDocumentV2(c))).filter(a => a.kind === 'text' && a.style === 'final')).toHaveLength(0);
  });
  it('uses deterministic safe names without customer phone or platform data', () => {
    expect(imageFilename(0, 1)).toBe('zamerok-offer.png'); expect(imageFilename(0, 2)).toBe('zamerok-offer-1.png'); expect(imageFilename(1, 2)).toBe('zamerok-offer-2.png'); expect(IMAGE_WIDTH).toBe(1080);
  });
});

describe('Feature 13 temporary resource lifecycle', () => {
  function environment(fail: boolean) {
    const ctx = { font: '', measureText: (text: string) => ({ width: text.length * 15 }), fillRect: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn(), save: vi.fn(), restore: vi.fn(), setLineDash: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), translate: vi.fn(), rotate: vi.fn() };
    const canvas = { width: 0, height: 0, getContext: () => ctx, toBlob: (cb: (blob: Blob | null) => void) => cb(fail ? null : new Blob(['png'], { type: 'image/png' })), remove: vi.fn() };
    const link = { href: '', download: '', hidden: false, click: vi.fn(), remove: vi.fn() };
    vi.stubGlobal('document', { createElement: (tag: string) => tag === 'canvas' ? canvas : link, body: { append: vi.fn() } });
    return { canvas, ctx, link };
  }
  it.each([false, true])('releases detached canvas backing and DOM on encoding failure=%s', async (fail) => {
    const { canvas } = environment(fail);
    try {
      const run = async () => { const images = []; for await (const image of renderProposalImages(doc())) images.push(image); return images; };
      if (fail) await expect(run()).rejects.toThrow('PNG encoding failed');
      else { const images = await run(); expect(images.length).toBeGreaterThan(0); expect(images[0]!.width).toBe(1080); expect(images[0]!.blob.type).toBe('image/png'); }
      expect(canvas.width).toBe(0); expect(canvas.height).toBe(0); expect(canvas.remove).toHaveBeenCalledOnce();
    } finally { vi.unstubAllGlobals(); }
  });
  it('cleans up when the consumer stops early, and can render just one indexed page', async () => {
    const { canvas } = environment(false);
    try {
      for await (const image of renderProposalImages(doc())) { expect(image.width).toBe(1080); break; }
      expect(canvas.remove).toHaveBeenCalledOnce();
      const multi = { ...doc(), items: Array.from({ length: 12 }, (_, i) => doc().items[i % 4]!) };
      const results = []; for await (const image of renderProposalImages(multi, 1)) results.push(image);
      expect(results).toHaveLength(1); expect(results[0]!.filename).toBe('zamerok-offer-2.png');
    } finally { vi.unstubAllGlobals(); }
  });
  it.each([false, true])('revokes download URL/removes anchor after click failure=%s', async (fail) => {
    const { link } = environment(false); vi.useFakeTimers();
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test'); const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    if (fail) link.click.mockImplementation(() => { throw new Error('download'); });
    try {
      const pending = downloadProposalImage({ blob: new Blob(), filename: 'zamerok-offer.png', width: 1080, height: 1000, pageCount: 1, index: 0 });
      if (fail) await expect(pending).rejects.toThrow('download'); else { await vi.runAllTimersAsync(); await pending; }
      expect(link.remove).toHaveBeenCalledOnce(); expect(revoke).toHaveBeenCalledWith('blob:test'); expect(create).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); create.mockRestore(); revoke.mockRestore(); vi.unstubAllGlobals(); }
  });
});
