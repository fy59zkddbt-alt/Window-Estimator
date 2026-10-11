import type { ProposalDocumentV2, ProposalSchemeGeometryV2, ProposalWorkV2 } from '../../domain/documents/proposal-document-v2';
import { customerMoney } from '../../presentation/customer-money';
import { itemPresentation, proposalLabels as labels, sellerLines, summaryLines, workQuantity } from '../../presentation/proposal-presentation';
import { schemeColumnWidths } from '../../presentation/glazing-drawing';

export const PDF_PAGE = { width: 210, height: 297, margin: 16, bottom: 281, gap: 4 } as const;
export const PDF_WIDTH = PDF_PAGE.width - 2 * PDF_PAGE.margin;
// Feature 13 annotation/construction coordinates retain one uniform transform.
export const SCHEME_UNIT = 0.18;
export const PDF_STYLES = {
  // Font sizes are approved and unchanged; only unused vertical leading is tightened.
  title: { size: 20, height: 9, color: '#18322e', strong: true },
  heading: { size: 14, height: 6.5, color: '#18322e', strong: true },
  body: { size: 10.5, height: 5.2, color: '#18322e', strong: false },
  small: { size: 9.5, height: 4.5, color: '#536b62', strong: false },
  caption: { size: 8.5, height: 4.5, color: '#7b8d85', strong: false },
  itemTotal: { size: 12, height: 6.5, color: '#18322e', strong: true },
  final: { size: 22, height: 12, color: '#236653', strong: true },
  notice: { size: 10.5, height: 6, color: '#755015', strong: true },
} as const;
export type PdfStyle = keyof typeof PDF_STYLES;
export type PdfMeasure = (text: string, style: PdfStyle) => number;
export type PdfRow = { kind: 'text'; text: string; style: PdfStyle; height: number; amount?: string; right?: boolean }
  | { kind: 'schemes'; schemes: { geometry: ProposalSchemeGeometryV2; width: number; titles: string[] }[]; headingHeight: number; drawingHeight: number; height: number };
export interface PdfBlock { rows: PdfRow[]; height: number }
export interface PdfCard { blocks: PdfBlock[]; height: number; summary: boolean; continuation: boolean; closing: boolean }
export interface PdfPage { cards: { card: PdfCard; y: number }[] }

/** Measured wrapping, including arbitrary unbroken client/catalog names. */
export function wrapPdfText(value: string, style: PdfStyle, measure: PdfMeasure, width = PDF_WIDTH): string[] {
  const result: string[] = [];
  for (const paragraph of value.replace(/\t/g, ' ').split(/\r?\n/u)) {
    let line = '';
    for (const word of paragraph.split(/ +/u).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate, style) <= width) { line = candidate; continue; }
      if (line) { result.push(line); line = ''; }
      for (const glyph of word) {
        if (line && measure(line + glyph, style) > width) { result.push(line); line = ''; }
        line += glyph;
      }
    }
    result.push(line);
  }
  return result;
}

/** Layout arithmetic only. All customer words and money come from the shared presentation / DTO. */
export function layoutProposalPdfV2(document: ProposalDocumentV2, measure: PdfMeasure): PdfPage[] {
  const text = (value: string, style: PdfStyle = 'body'): PdfRow[] => wrapPdfText(value, style, measure)
    .map(text => ({ kind: 'text', text, style, height: PDF_STYLES[style].height }));
  const price = (label: string, amount: string, style: PdfStyle = 'body'): PdfRow[] => {
    const width = PDF_WIDTH - measure(amount, style) - 6;
    if (width < PDF_WIDTH * 0.35) return [...text(label, 'small'), ...text(amount, style).map(row => ({ ...row, right: true }))];
    const labels = wrapPdfText(label, style, measure, width);
    return labels.map((text, index) => ({ kind: 'text', text, style, height: PDF_STYLES[style].height, ...(index === labels.length - 1 ? { amount } : {}) }));
  };
  const spacer = (height = 1): PdfRow => ({ kind: 'text', text: '', style: 'caption', height });
  const block = (rows: PdfRow[]): PdfBlock => ({ rows, height: rows.reduce((sum, row) => sum + row.height, 0) });
  const work = (work: ProposalWorkV2) => price(`${work.name} · ${workQuantity(work)}`, customerMoney(work.amount));
  const groups: { label: string; blocks: PdfBlock[]; summary?: boolean; closing?: boolean; flow?: boolean }[] = [];
  groups.push({ label: 'Предложение', blocks: [block([
    ...text(document.context.name || labels.title, 'title'),
    ...(document.context.clientName ? text(document.context.clientName) : []),
    ...[document.context.objectAddress, document.context.clientPhone].filter((v): v is string => !!v).flatMap(v => text(v, 'small')),
    ...sellerLines(document.seller).flatMap(v => text(v, 'small')),
    ...(document.summary.message ? text(document.summary.message, 'notice') : []),
  ])] });
  document.items.forEach((item, index) => {
    const presentation = itemPresentation(item);
    const heading = [
      ...text(item.name, 'heading'),
      ...(presentation.subtitle ? text(presentation.subtitle, 'small') : []),
      ...(presentation.room ? text(presentation.room, 'small') : []),
      ...(presentation.schemes.length ? text(labels.viewpoint, 'caption') : []),
    ];
    const blocks: PdfBlock[] = [];
    const dense = presentation.schemes.some(s => new Set(s.geometry.sections.map(section => section.xMm)).size > 4);
    const columns = dense ? 1 : 3;
    for (let start = 0; start < presentation.schemes.length; start += columns) {
      const row = presentation.schemes.slice(start, start + columns);
      const widths = schemeColumnWidths(row.map(s => s.geometry), PDF_WIDTH / SCHEME_UNIT).map(w => w * SCHEME_UNIT);
      const schemes = row.map((s, i) => ({ geometry: s.geometry, width: widths[i]!, titles: s.heading === labels.viewpoint ? []
        : wrapPdfText(`${s.heading}${s.note ? ` · ${s.note}` : ''}`, 'small', measure, widths[i]! - 3) }));
      const headingHeight = Math.max(...schemes.map(s => s.titles.length)) * PDF_STYLES.small.height;
      const drawingHeight = dense ? 78 : row.length > 1 ? 80 : 70;
      blocks.push(block([...(start === 0 ? heading : []), { kind: 'schemes', schemes, headingHeight, drawingHeight, height: headingHeight + drawingHeight }]));
    }
    const closing = [
      spacer(), ...presentation.lines.flatMap(v => text(v, 'small')),
      ...(item.clarification ? text(item.clarification, 'notice') : []), spacer(),
      ...item.priceLines.flatMap(line => price(line.label, customerMoney(line.amount))),
      ...(item.additionalWorks.length ? [...text(labels.works, 'body'), ...item.additionalWorks.flatMap(work)] : []),
      ...(presentation.showTotal ? price(labels.total, customerMoney(item.total!), 'itemTotal') : []),
    ];
    blocks.push(block([...(blocks.length ? [] : heading), ...closing]));
    groups.push({ label: `Позиция ${index + 1}`, blocks, closing: item.kind === 'WindowFinish', flow: item.kind === 'Balcony' });
  });
  if (document.orderAdditionalWorks.length) groups.push({ label: 'Работы по заказу', closing: true,
    blocks: [block([...text(labels.orderWorks, 'heading'), ...document.orderAdditionalWorks.flatMap(work)])] });
  groups.push({ label: labels.summary, summary: true, blocks: [block([
    ...text(labels.summary, 'heading'), spacer(),
    ...summaryLines(document.summary).flatMap(line => price(line.label, line.value)),
    ...(document.summary.total ? price(labels.total, customerMoney(document.summary.total), 'final')
      : text(document.summary.message || labels.clarification, 'notice')),
  ])] });

  const capacity = PDF_PAGE.bottom - PDF_PAGE.margin;
  const pages: PdfPage[] = [];
  let page: PdfPage = { cards: [] }; let y: number = PDF_PAGE.margin;
  const flush = () => { if (page.cards.length) { pages.push(page); page = { cards: [] }; y = PDF_PAGE.margin; } };
  const place = (card: PdfCard) => {
    if (y + card.height > PDF_PAGE.bottom) flush();
    page.cards.push({ card, y }); y += card.height + PDF_PAGE.gap;
  };
  for (const group of groups) {
    const height = group.blocks.reduce((sum, b) => sum + b.height, 0);
    const fitsHere = y + height <= PDF_PAGE.bottom;
    const firstFitsHere = y + group.blocks[0]!.height <= PDF_PAGE.bottom;
    // Small items stay whole. A balcony may start with title + whole plane group
    // in the remaining space rather than leave a large blank area for its tail.
    if (fitsHere || height <= capacity && !(group.flow && firstFitsHere)) {
      // Carry a useful closing card along with a short summary when they fit together.
      if (group.summary && y + height > PDF_PAGE.bottom && page.cards.length > 1) {
        const tail = page.cards.at(-1)!;
        if (tail.card.closing && tail.card.height + PDF_PAGE.gap + height <= capacity) {
          page.cards.pop(); flush(); place(tail.card);
        }
      }
      place({ blocks: group.blocks, height, summary: !!group.summary, continuation: false, closing: !!group.closing });
      continue;
    }
    // Flow logical blocks into the actual remaining height, not a fresh-page capacity.
    // Each plane group and the configuration/price tail are atomic.
    let blocks: PdfBlock[] = []; let used = 0; let continuation = false;
    const next = () => {
      if (blocks.length) {
        place({ blocks, height: used, summary: !!group.summary, continuation, closing: false });
        continuation = true;
      }
      flush();
      const context = continuation ? [block(text(`${group.label} · продолжение`, 'small'))] : [];
      blocks = context; used = context.reduce((sum, b) => sum + b.height, 0);
    };
    for (const b of group.blocks) {
      if (b.height <= capacity - PDF_STYLES.small.height) {
        if (y + used + b.height > PDF_PAGE.bottom) next();
        blocks.push(b); used += b.height;
      } else {
        // Pathological long names / work lists: wrap and flow text, never cut a scheme.
        for (let i = 0; i < b.rows.length; i++) {
          const row = b.rows[i]!; const following = b.rows[i + 1];
          const attached = row.kind === 'text' && row.style === 'heading' && following ? following.height : 0;
          if (row.height + attached > capacity - PDF_STYLES.small.height) throw new Error('Proposal block exceeds page');
          if (y + used + row.height + attached > PDF_PAGE.bottom) next();
          blocks.push(block([row])); used += row.height;
        }
      }
    }
    if (blocks.length) place({ blocks, height: used, summary: !!group.summary, continuation, closing: !!group.closing });
  }
  flush();
  return pages;
}
