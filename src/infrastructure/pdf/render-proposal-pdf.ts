import { jsPDF } from 'jspdf';
import type { ProposalDocument, ProposalPlane } from '../../domain/documents/proposal-document';
import { paginate, type LayoutBlock } from './layout';
import fontData from './fonts/noto-sans-base64';

type Row = { kind: 'text'; text: string; size: number; height: number; accent: boolean; keepWithNext: boolean } |
  { kind: 'drawing'; plane: ProposalPlane; height: number };
const money = (minor: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(minor / 100);

/** Sole business input is the detached commercial DTO. No calculation/settings access. */
export async function renderProposalPdf(document: ProposalDocument): Promise<Blob> {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  pdf.addFileToVFS('NotoSans.ttf', fontData);
  pdf.addFont('NotoSans.ttf', 'NotoSans', 'normal');
  pdf.setFont('NotoSans');
  pdf.setProperties({ title: 'Коммерческое предложение', author: document.seller.sellerName });
  const blocks = proposalBlocks(document, (value, size) => {
    pdf.setFontSize(size);
    return pdf.splitTextToSize(value, 170) as string[];
  });
  return paintPdf(pdf, blocks);
}

export function proposalBlocks(document: ProposalDocument, wrap: (text: string, size: number) => string[]): LayoutBlock<Row>[] {
  const blocks: LayoutBlock<Row>[] = [];
  let rows: Row[] = [];
  function text(value: string, size = 10, accent = false, keepWithNext = false) {
    const lines = wrap(value.replace(/[\r\n\t]/g, ' '), size);
    lines.forEach((line, i) => rows.push({ kind: 'text', text: line, size, height: size * 0.3528 * 1.45 + 1, accent, keepWithNext: keepWithNext || i < lines.length - 1 }));
  }
  function flush() { if (rows.length) blocks.push({ rows, heights: rows.map((r) => r.height), keepWithNext: rows.map((r) => r.kind === 'text' && r.keepWithNext) }); rows = []; }
  function optional(label: string, value?: string) { if (value?.trim()) text(`${label}${value.trim()}`); }
  text('Коммерческое предложение', 22, true, true);
  text(`Дата: ${new Date(document.generatedAt).toLocaleDateString('ru-RU')}`, 10);
  const seller = document.seller;
  optional('', seller.companyName); optional('ИНН: ', seller.inn);
  optional('Специалист: ', seller.sellerName); optional('Телефон: ', seller.sellerPhone);
  for (const [label, value] of [['Телефон компании: ', seller.companyPhone], ['Telegram: ', seller.telegram], ['WhatsApp: ', seller.whatsapp], ['Email: ', seller.email], ['Сайт: ', seller.website]]) optional(label!, value);
  flush();
  const customer = document.customer;
  if (Object.values(customer).some((v) => v?.trim())) {
    text('Клиент и объект', 14, true, true);
    optional('Клиент: ', customer.clientName); optional('Телефон: ', customer.clientPhone); optional('Объект: ', customer.objectAddress); flush();
  }
  document.items.forEach((item, index) => {
    text(`${index + 1}. ${item.name} · ${item.room}`, 14, true, true);
    text(item.description); text(item.dimensionsText);
    if (item.kind === 'WindowFinish') {
      item.finishes.forEach((finish) => {
        text(`${finish.label}: ${finish.materialName}; установленная длина ${finish.installedLengthM.toLocaleString('ru-RU')} м`);
        finish.pieces.forEach((p) => text(`${p.label}: ${p.installedLengthMm} × ${p.depthMm} мм`, 9));
      });
      text(`Материалы и работа: ${money(item.basePriceMinor)}`);
    } else {
      text(`Система: ${item.profileName} · ${item.materialLabel}`);
      text(`${item.laminationLabel} · Площадь: ${item.areaM2.toLocaleString('ru-RU', { maximumFractionDigits: 3 })} м²`);
      item.planes.forEach((plane) => {
        text(`${plane.name}: ${plane.bounds.widthMm} × ${plane.bounds.heightMm} мм`, 10, true, true);
        rows.push({ kind: 'drawing', plane, height: 57 });
        plane.sections.forEach((s) => text([s.label, s.openingLabel, s.hingeLabel, s.hardwareName, s.fillLabel].filter(Boolean).join(' · '), 9));
        if (plane.transom) text(plane.transom.label, 9);
      });
      text(`Стоимость конструкции: ${money(item.productPriceMinor)}`);
      text(`Монтаж: ${money(item.installationPriceMinor)}`);
    }
    item.additionalWorks.forEach((work) => text(`Допработа: ${work.name} — ${money(work.priceMinor)}`));
    text(`Итого по замеру: ${money(item.measurementTotalMinor)}`, 12, true);
    flush();
  });
  if (document.orderWorks.length) {
    text('Общие дополнительные работы', 14, true, true);
    document.orderWorks.forEach((w) => text(`${w.name} — ${money(w.priceMinor)}`)); flush();
  }
  text(`Стоимость до скидки: ${money(document.totals.subtotalMinor)}`, 12);
  if (document.totals.discountMode !== 'none') text(`Скидка${document.totals.discountPercent !== undefined ? ` ${document.totals.discountPercent}%` : ''}: ${money(document.totals.discountAmountMinor)}`, 12);
  text(`Итого: ${money(document.totals.finalTotalMinor)}`, 18, true); flush();
  return blocks;
}

function paintPdf(pdf: jsPDF, blocks: LayoutBlock<Row>[]): Blob {
  const layout = paginate(blocks);
  let page = 0;
  for (const placement of layout) {
    while (page < placement.page) { pdf.addPage(); page++; }
    const row = placement.row;
    if (row.kind === 'text') {
      pdf.setFontSize(row.size);
      if (row.accent) pdf.setTextColor(25, 74, 99); else pdf.setTextColor(40, 48, 55);
      pdf.text(row.text, 20, placement.y + row.size * 0.3528);
    } else drawPlane(pdf, row.plane, placement.y);
  }
  const count = pdf.getNumberOfPages();
  for (let i = 1; i <= count; i++) {
    pdf.setPage(i); pdf.setDrawColor(210, 220, 225); pdf.line(20, 283, 190, 283);
    pdf.setFontSize(8); pdf.setTextColor(95, 105, 115);
    pdf.text(`Коммерческое предложение · ${i} / ${count}`, 20, 289);
  }
  return pdf.output('blob');
}

function drawPlane(pdf: jsPDF, plane: ProposalPlane, y: number) {
  const b = plane.bounds, scale = Math.min(160 / b.widthMm, 49 / b.heightMm);
  const x = 20 + (170 - b.widthMm * scale) / 2;
  pdf.setDrawColor(55, 85, 100); pdf.setFillColor(241, 248, 251); pdf.setLineWidth(0.35);
  const rect = (r: ProposalPlane['bounds']) => pdf.rect(x + (r.xMm - b.xMm) * scale, y + (r.yMm - b.yMm) * scale, r.widthMm * scale, r.heightMm * scale, 'FD');
  for (const s of plane.sections) {
    rect(s);
    for (const symbol of s.symbols) {
      pdf.setLineDashPattern(symbol.kind === 'tilt' ? [1.4, 1] : [], 0);
      symbol.points.slice(1).forEach((p, i) => {
        const prev = symbol.points[i]!;
        pdf.line(x + (prev.xMm - b.xMm) * scale, y + (prev.yMm - b.yMm) * scale, x + (p.xMm - b.xMm) * scale, y + (p.yMm - b.yMm) * scale);
      });
    }
    pdf.setLineDashPattern([], 0);
  }
  if (plane.transom) rect(plane.transom);
  plane.splitLine?.slice(1).forEach((p, i) => {
    const prev = plane.splitLine![i]!;
    pdf.line(x + (prev.xMm - b.xMm) * scale, y + (prev.yMm - b.yMm) * scale, x + (p.xMm - b.xMm) * scale, y + (p.yMm - b.yMm) * scale);
  });
}
