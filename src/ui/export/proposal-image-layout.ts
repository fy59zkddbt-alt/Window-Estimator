import type { ProposalDocumentV2, ProposalSchemeGeometryV2, ProposalWorkV2 } from '../../domain/documents/proposal-document-v2';
import { itemPresentation, sellerLines, summaryLines, workQuantity } from '../proposal-presentation';
import { customerMoney } from '../../presentation/customer-money';
import { schemeColumnWidths } from '../glazing-drawing';

export const IMAGE_WIDTH = 1080;
export const MAX_IMAGE_HEIGHT = 3200;
export const IMAGE_MARGIN = 48;
const CARD_PADDING = 24;
const GAP = 20;
const CONTENT_WIDTH = IMAGE_WIDTH - 2 * (IMAGE_MARGIN + CARD_PADDING);
export type TextStyle = 'title' | 'heading' | 'body' | 'small' | 'caption' | 'price' | 'itemTotal' | 'final' | 'notice';
export const textStyles: Record<TextStyle, { size: number; weight: number; color: string; lineHeight: number }> = {
  title: { size: 42, weight: 700, color: '#18322e', lineHeight: 52 },
  heading: { size: 30, weight: 700, color: '#18322e', lineHeight: 40 },
  body: { size: 26, weight: 400, color: '#18322e', lineHeight: 35 },
  small: { size: 22, weight: 400, color: '#536b62', lineHeight: 30 },
  caption: { size: 18, weight: 400, color: '#7b8d85', lineHeight: 26 },
  price: { size: 26, weight: 400, color: '#18322e', lineHeight: 38 },
  itemTotal: { size: 28, weight: 700, color: '#18322e', lineHeight: 44 },
  final: { size: 42, weight: 700, color: '#236653', lineHeight: 54 },
  notice: { size: 28, weight: 700, color: '#755015', lineHeight: 38 },
};
export const imageFont = (style: TextStyle) => `${textStyles[style].weight} ${textStyles[style].size}px Arial, sans-serif`;
type TextAtom = { kind: 'text'; text: string; style: TextStyle; height: number; amount?: string; align?: 'right' };
type SchemeAtom = { kind: 'schemes'; geometries: readonly ProposalSchemeGeometryV2[]; titles: string[][]; headingHeight: number; height: number };
export type ImageAtom = TextAtom | SchemeAtom;
export interface ImageCard { atoms: ImageAtom[]; height: number; continuation: boolean; summary: boolean; closing?: boolean }
export interface ImagePage { cards: { card: ImageCard; y: number }[]; height: number }
export type MeasureText = (text: string, style: TextStyle) => number;

/** Wrap by measured glyphs, including long unbroken names; never truncate content. */
export function wrapImageText(text: string, style: TextStyle, measure: MeasureText, maxWidth = CONTENT_WIDTH): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.split(/ +/u).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate, style) <= maxWidth) { line = candidate; continue; }
      if (line) { lines.push(line); line = ''; }
      for (const glyph of word) {
        if (line && measure(line + glyph, style) > maxWidth) { lines.push(line); line = ''; }
        line += glyph;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Presentation only. The DTO's display strings are the sole source of money. */
export function layoutProposalImages(document: ProposalDocumentV2, measure: MeasureText): ImagePage[] {
  const groups: { atoms: ImageAtom[]; label: string; summary: boolean; closing?: boolean }[] = [];
  const text = (value: string, style: TextStyle = 'body'): TextAtom[] => wrapImageText(value, style, measure).map((line) => ({ kind: 'text', text: line, style, height: textStyles[style].lineHeight }));
  const price = (label: string, amount: string, style: TextStyle = 'price'): TextAtom[] => {
    const room = CONTENT_WIDTH - measure(amount, style) - 24;
    if (room < CONTENT_WIDTH * 0.35) return [...text(label, 'small'), ...text(amount, style).map(line => ({ ...line, align: 'right' as const }))];
    const labels = wrapImageText(label, style, measure, room);
    return labels.map((line, index) => ({ kind: 'text', text: line, style, height: textStyles[style].lineHeight, ...(index === labels.length - 1 ? { amount } : {}) }));
  };
  const works = (rows: readonly ProposalWorkV2[]) => rows.flatMap((work) => [
    ...price(`${work.name} · ${workQuantity(work)}`, customerMoney(work.amount)),
  ]);
  groups.push({ label: 'Предложение', summary: false, atoms: [
    ...text(document.context.name || 'Ваше предложение', 'title'),
    ...(document.context.clientName ? text(document.context.clientName) : []),
    ...([document.context.objectAddress, document.context.clientPhone].some(Boolean) ? text([document.context.objectAddress, document.context.clientPhone].filter(Boolean).join(' · '), 'small') : []),
    ...sellerLines(document.seller).flatMap((v) => text(v, 'small')),
    ...(document.items.some(item => item.schemes.length) ? text('Размеры в мм', 'caption') : []),
    ...(document.summary.message ? text(document.summary.message, 'notice') : []),
  ] });
  document.items.forEach((item, index) => {
    const presentation = itemPresentation(item);
    const atoms: ImageAtom[] = [
      ...text(item.name, 'heading'),
      ...(presentation.subtitle ? text(presentation.subtitle, 'small') : []),
      ...(presentation.room ? text(presentation.room, 'small') : []),
    ];
    if (item.schemes.length) atoms.push(...text('Вид из помещения', 'caption'));
    // Individual plane headings immediately precede their dimensioned drawings.
    // Dense planes get the full content width instead of shrinking section labels.
    const columns = item.schemes.some((s) => new Set(s.geometry.sections.map((section) => section.xMm)).size > 4) ? 1 : 3;
    for (let start = 0; start < presentation.schemes.length; start += columns) {
      const row = presentation.schemes.slice(start, start + columns);
      const widths = schemeColumnWidths(row.map(s => s.geometry), CONTENT_WIDTH);
      const titles = row.map((s, i) => s.heading === 'Вид из помещения' ? [] : wrapImageText(`${s.heading}${s.note ? ` · ${s.note}` : ''}`, 'small', measure, widths[i]! - 12));
      const headingHeight = Math.max(...titles.map((lines) => lines.length)) * textStyles.small.lineHeight;
      atoms.push({ kind: 'schemes', geometries: row.map((s) => s.geometry), titles, headingHeight, height: headingHeight + 380 });
    }
    atoms.push(...presentation.lines.flatMap((line) => text(line, 'small')));
    if (item.clarification) atoms.push(...text(item.clarification, 'notice'));
    atoms.push({ kind: 'text', text: '', style: 'caption', height: 10 });
    item.priceLines.forEach((line) => atoms.push(...price(line.label, customerMoney(line.amount))));
    if (item.additionalWorks.length) atoms.push(...text('Дополнительные работы', 'heading'), ...works(item.additionalWorks));
    if (presentation.showTotal) atoms.push(...price('Итого', customerMoney(item.total!), 'itemTotal'));
    groups.push({ label: `Позиция ${index + 1}`, atoms, summary: false, closing: item.kind === 'WindowFinish' });
  });
  if (document.orderAdditionalWorks.length) groups.push({ label: 'Работы по заказу', summary: false, closing: true, atoms: [
    ...text('Дополнительные работы по заказу', 'heading'), ...works(document.orderAdditionalWorks),
  ] });
  groups.push({ label: 'Стоимость предложения', summary: true, atoms: [
    ...text('Стоимость предложения', 'heading'),
    ...summaryLines(document.summary).flatMap((line) => price(line.label, line.value)),
    ...(document.summary.total ? price('Итого', customerMoney(document.summary.total), 'final')
      : text(document.summary.message || 'Стоимость требует уточнения', 'notice')),
  ] });

  const pages: ImagePage[] = [];
  let page: ImagePage = { cards: [], height: IMAGE_MARGIN };
  const capacity = MAX_IMAGE_HEIGHT - 2 * IMAGE_MARGIN;
  const flush = () => { if (page.cards.length) { page.height += IMAGE_MARGIN - GAP; pages.push(page); page = { cards: [], height: IMAGE_MARGIN }; } };
  const place = (card: ImageCard) => {
    if (page.height + card.height + IMAGE_MARGIN > MAX_IMAGE_HEIGHT) flush();
    page.cards.push({ card, y: page.height }); page.height += card.height + GAP;
  };
  for (const group of groups) {
    const height = group.atoms.reduce((sum, a) => sum + a.height, 2 * CARD_PADDING);
    if (height <= capacity - GAP) {
      // Keep a short final summary with intact closing cards instead of an orphan image.
      // Same bounded planner; move only cards that also fit together on the next page.
      if (group.summary && page.height + height + IMAGE_MARGIN > MAX_IMAGE_HEIGHT && page.cards.length > 1) {
        const tail: ImageCard[] = []; let tailHeight = height;
        while (page.cards.length > 1) {
          const last = page.cards.at(-1)!.card;
          if (last.continuation || tail.length && !last.closing || tailHeight + last.height + GAP > capacity - GAP) break;
          page.cards.pop(); page.height -= last.height + GAP; tail.unshift(last); tailHeight += last.height + GAP;
        }
        if (tail.length) { flush(); tail.forEach(place); }
      }
      place({ atoms: group.atoms, height, continuation: false, summary: group.summary, closing: !!group.closing }); continue;
    }
    // Only oversized cards split, at text-line/whole-diagram boundaries.
    let atoms: ImageAtom[] = []; let used = 2 * CARD_PADDING; let continuation = false;
    const next = () => {
      place({ atoms, height: used, continuation, summary: group.summary }); flush(); continuation = true;
      atoms = text(`${group.label} · продолжение`, 'small'); used = 2 * CARD_PADDING + atoms.reduce((sum, a) => sum + a.height, 0);
    };
    for (const atom of group.atoms) { if (used + atom.height > capacity - GAP) next(); atoms.push(atom); used += atom.height; }
    if (atoms.length) place({ atoms, height: used, continuation, summary: group.summary });
  }
  flush();
  return pages;
}
export function imageFilename(index: number, count: number): string {
  return count === 1 ? 'zamerok-offer.png' : `zamerok-offer-${index + 1}.png`;
}
export const imageContentWidth = CONTENT_WIDTH;
