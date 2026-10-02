import { expect, it } from 'vitest';
import { renderProposalPdf, proposalBlocks } from '../src/infrastructure/pdf/render-proposal-pdf';
import { paginate } from '../src/infrastructure/pdf/layout';
import { proposalFilename } from '../src/application/documents/proposal-pdf';
import { canShareProposal } from '../src/ui/proposal-file';
import type { ProposalDocument } from '../src/domain/documents/proposal-document';

function document(count = 1): ProposalDocument {
  return {
    id: 'pdf', generatedAt: '2026-10-02T07:00:00Z', currency: 'RUB',
    seller: { sellerName: 'Анна Замерщик', sellerPhone: '+7 913 1234567' }, customer: {}, orderWorks: [],
    items: Array.from({ length: count }, (_, i) => ({
      id: `w${i}`, kind: 'Window', name: `Окно ${i + 1}`, room: 'Кухня', description: 'Окно · ПВХ',
      dimensionsText: '1400 × 1500 мм', dimensions: [{ label: 'Окно', widthMm: 1400, heightMm: 1500 }],
      materialLabel: 'ПВХ', profileName: 'Система 70', laminationLabel: 'Без ламинации', areaM2: 2.1,
      basePriceMinor: 200000, productPriceMinor: 180000, installationPriceMinor: 20000,
      additionalWorks: [], additionalWorksTotalMinor: 0, measurementTotalMinor: 200000,
      planes: [{ id: 'p', name: 'Окно', areaM2: 2.1, bounds: { xMm: 0, yMm: 0, widthMm: 1400, heightMm: 1500 }, transom: null,
        sections: [{ id: 's', label: 'Секция 1', openingLabel: 'Глухое', fillLabel: 'Стекло', symbols: [], xMm: 0, yMm: 0, widthMm: 1400, heightMm: 1500 }] }],
    })),
    totals: { measurementsSubtotalMinor: 200000 * count, orderWorksTotalMinor: 0, subtotalMinor: 200000 * count,
      discountMode: 'none', discountAmountMinor: 0, finalTotalMinor: 200000 * count },
  };
}
const content = (d: ProposalDocument) => proposalBlocks(d, (s) => [s]).flatMap((b) => b.rows).flatMap((r) => r.kind === 'text' ? [r.text] : []).join('\n');

it.each([1, 3, 25])('generates a real A4 PDF from a Cyrillic ProposalDocument with %i items', async (count) => {
  const value = document(count), before = structuredClone(value);
  const blob = await renderProposalPdf(value);
  const raw = new TextDecoder('latin1').decode(await blob.arrayBuffer());
  expect(blob.type).toBe('application/pdf');
  expect(raw.startsWith('%PDF-')).toBe(true);
  expect(raw).toContain('/FontFile2');
  expect(raw).toContain('/ToUnicode');
  const pages = raw.match(/\/Type \/Page\b/g)?.length ?? 0;
  expect(pages).toBeGreaterThanOrEqual(count === 25 ? 10 : 1);
  if (count === 1) expect(pages).toBe(1);
  expect(value).toEqual(before);
});

it('renders supplied commercial sums, both work levels and percent discount without recomputing them', () => {
  const value = document();
  value.items = [{ ...value.items[0]!, additionalWorks: [{ id: 'a', name: 'Демонтаж', priceMinor: 12345 }], measurementTotalMinor: 98765 }];
  value.orderWorks = [{ id: 'b', name: 'Доставка', priceMinor: 54321 }];
  value.totals = { ...value.totals, discountMode: 'percent', discountPercent: 12.345, discountAmountMinor: 11111, finalTotalMinor: 22222 };
  const result = content(value);
  expect(result).toContain('Демонтаж'); expect(result).toContain('Общие дополнительные работы'); expect(result).toContain('Доставка');
  expect(result).toContain('Скидка 12.345%'); expect(result).toContain('111,11'); expect(result).toContain('222,22'); expect(result).toContain('987,65');
  expect(result).toContain('Стоимость конструкции'); expect(result).toContain('Монтаж');
  expect(result).not.toMatch(/markup|закупоч|activityPercent/);
});

it('omits empty seller/customer fields and renders filled optional fields and fixed-price discount', () => {
  const value = document();
  expect(content(value)).not.toMatch(/ИНН|Email|Клиент и объект/);
  value.seller = { ...value.seller, companyName: 'Окна Сибири', inn: '1234567890', email: 'mail@example.com', website: 'https://example.com', telegram: '@seller', whatsapp: '+7', companyPhone: '7654321' };
  value.customer = { clientName: 'Иван', clientPhone: '1234567', objectAddress: 'ул. Ленина, 1' };
  value.totals = { ...value.totals, discountMode: 'fixedFinalPrice', discountAmountMinor: 10000, finalTotalMinor: 190000 };
  const result = content(value);
  for (const text of ['Окна Сибири', '1234567890', 'mail@example.com', 'https://example.com', '@seller', '7654321', 'Иван', 'ул. Ленина, 1', 'Скидка:', '1\u00a0900,00']) expect(result).toContain(text);
});

it('renders independent finish dimensions and installed pieces', async () => {
  const value = document();
  const { kind: _kind, ...common } = value.items[0]!;
  value.items = [{ ...common, kind: 'WindowFinish', dimensionsText: '1400 × 1500 × 250 мм',
    finishes: [{ label: 'Откосы', materialName: 'Белые панели', installedLengthM: 4.4, pieces: [{ label: 'Верхний откос', installedLengthMm: 1400, depthMm: 250 }] }] }];
  expect(content(value)).toContain('Верхний откос: 1400 × 250 мм');
  expect(content(value)).toContain('Материалы и работа');
  expect((await renderProposalPdf(value)).size).toBeGreaterThan(1000);
});

it('sanitizes filenames and chooses customer, object or neutral name', () => {
  const value = document();
  expect(proposalFilename(value)).toBe('КП_Предложение_2026-10-02.pdf');
  value.customer.objectAddress = 'Ленина/1'; expect(proposalFilename(value)).toBe('КП_Ленина_1_2026-10-02.pdf');
  value.customer.clientName = ' Иван: "Петров"<>|?*\\\u0001 ';
  const name = proposalFilename(value);
  expect(name).not.toMatch(/[<>:"/\\|?*\u0000-\u001f]/);
  expect(name).toContain('Иван');
  value.customer.clientName = 'Я'.repeat(500); expect(proposalFilename(value).length).toBeLessThan(110);
});

it('moves a fitting measurement together; oversized blocks split without empty pages or isolated headings', () => {
  const result = paginate([
    { rows: ['intro'], heights: [180] },
    { rows: ['heading', 'diagram', 'total'], heights: [10, 60, 10] },
  ]);
  expect(result.map((r) => r.page)).toEqual([0, 1, 1, 1]);
  const long = paginate([{ rows: ['title', ...Array.from({ length: 60 }, (_, i) => `${i}`), 'total'], heights: [10, ...Array(60).fill(10), 10] }]);
  expect(new Set(long.map((r) => r.page))).toEqual(new Set([0, 1, 2]));
  expect(long.every((r) => r.y >= 20 && r.y + 10 <= 277)).toBe(true);
  const attached = paginate([{ rows: ['body', 'plane', 'drawing', 'end'], heights: [210, 10, 57, 10], keepWithNext: [false, true, false, false] }]);
  expect(attached[1]!.page).toBe(attached[2]!.page);
  expect(paginate([])).toEqual([]);
  const wrapped = paginate([{ rows: Array(60).fill('long text'), heights: Array(60).fill(10), keepWithNext: Array(60).fill(true) }]);
  expect(new Set(wrapped.map((r) => r.page)).size).toBe(3);
  expect(() => paginate([{ rows: [1], heights: [300] }])).toThrow();
});

it('shares only when the browser supports this PDF file, including unsupported and throwing capability probes', () => {
  const file = new File(['pdf'], 'КП.pdf', { type: 'application/pdf' });
  expect(canShareProposal(file, {} as Navigator)).toBe(false);
  expect(canShareProposal(file, { share: async () => {}, canShare: (data) => data?.files?.[0] === file })).toBe(true);
  expect(canShareProposal(file, { share: async () => {}, canShare: () => false })).toBe(false);
  expect(canShareProposal(file, { share: async () => {}, canShare: () => { throw new Error(); } })).toBe(false);
});
