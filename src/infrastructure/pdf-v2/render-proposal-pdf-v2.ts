import { jsPDF } from 'jspdf';
import type { ProposalDocumentV2, ProposalSchemeGeometryV2 } from '../../domain/documents/proposal-document-v2';
import { customerConstruction, customerSchemeLayout, glazingPrimitives } from '../../presentation/glazing-drawing';
import { proposalLabels } from '../../presentation/proposal-presentation';
import fontData from './fonts/zamerok-sans-base64';
import { layoutProposalPdfV2, PDF_PAGE, PDF_STYLES, PDF_WIDTH, SCHEME_UNIT, type PdfStyle } from './layout';

/** OFL derivative of the existing Noto Sans, adding the missing −. No network/font loading. */
export function createProposalPdfV2() {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true, putOnlyUsedFonts: true });
  pdf.addFileToVFS('ZamerokSans.ttf', fontData);
  pdf.addFont('ZamerokSans.ttf', 'ZamerokSans', 'normal'); pdf.setFont('ZamerokSans');
  return pdf;
}
export function pdfTextMeasure(pdf: jsPDF) {
  return (text: string, style: PdfStyle) => { pdf.setFontSize(PDF_STYLES[style].size); return pdf.getTextWidth(text); };
}

/** Pure browser-compatible PDF bytes from the detached v2 DTO; all text and schemes are vector. */
export async function renderProposalPdfV2(document: ProposalDocumentV2): Promise<Blob> {
  if (document.version !== 2) throw new Error('Unsupported proposal version');
  const pdf = createProposalPdfV2();
  pdf.setProperties({ title: document.context.name || proposalLabels.title, creator: 'ЗамерОк' });
  const pages = layoutProposalPdfV2(document, pdfTextMeasure(pdf));
  pages.forEach((page, pageIndex) => {
    if (pageIndex) pdf.addPage();
    for (const { card, y } of page.cards) {
      if (card.summary) { pdf.setDrawColor('#236653'); pdf.setLineWidth(0.8); pdf.line(12, y, 12, y + card.height); }
      let top = y;
      for (const block of card.blocks) for (const row of block.rows) {
        if (row.kind === 'text') {
          const style = PDF_STYLES[row.style];
          pdf.setFontSize(style.size); pdf.setTextColor(style.color); pdf.setDrawColor(style.color);
          // Restrained synthetic weight with the existing embedded font, no second font download.
          pdf.setLineWidth(style.strong ? 0.08 : 0);
          const baseline = top + style.size * 0.352778;
          const options = { renderingMode: style.strong ? 'fillThenStroke' as const : 'fill' as const };
          if (row.text) pdf.text(row.text, row.right ? PDF_PAGE.margin + PDF_WIDTH : PDF_PAGE.margin, baseline,
            { ...options, align: row.right ? 'right' : 'left' });
          if (row.amount) pdf.text(row.amount, PDF_PAGE.margin + PDF_WIDTH, baseline, { ...options, align: 'right' });
        } else {
          let x: number = PDF_PAGE.margin;
          for (const scheme of row.schemes) {
            pdf.setFontSize(PDF_STYLES.small.size); pdf.setTextColor(PDF_STYLES.small.color);
            scheme.titles.forEach((title, i) => pdf.text(title, x, top + i * PDF_STYLES.small.height + 3.35));
            drawPdfScheme(pdf, scheme.geometry, x, top + row.headingHeight, scheme.width, row.drawingHeight);
            x += scheme.width;
          }
        }
        top += row.height;
      }
    }
    pdf.setFontSize(8); pdf.setTextColor('#7b8d85');
    pdf.text(`Страница ${pageIndex + 1} из ${pages.length}`, PDF_PAGE.width / 2, 289, { align: 'center' });
  });
  return pdf.output('blob');
}

/** Adapter only: source symbols/contours/dimension placement are shared with Feature 13. */
function drawPdfScheme(pdf: jsPDF, geometry: ProposalSchemeGeometryV2, x: number, y: number, width: number, height: number) {
  const layout = customerSchemeLayout(geometry, width / SCHEME_UNIT, height / SCHEME_UNIT);
  const construction = customerConstruction(geometry, layout);
  const px = (v: number) => x + v * SCHEME_UNIT; const py = (v: number) => y + v * SCHEME_UNIT;
  const b = geometry.bounds;
  pdf.setLineDashPattern([], 0); pdf.setDrawColor('#244d50'); pdf.setFillColor('#ffffff'); pdf.setLineWidth(3.2 * SCHEME_UNIT);
  for (const { rectangle: r } of glazingPrimitives(geometry, true).rectangles) pdf.rect(
    px(layout.plot.x + (r.xMm - b.xMm) * layout.scale), py(layout.plot.y + (r.yMm - b.yMm) * layout.scale),
    r.widthMm * layout.scale * SCHEME_UNIT, r.heightMm * layout.scale * SCHEME_UNIT, 'FD');
  for (const r of construction.contours) {
    pdf.setDrawColor('#53706e'); pdf.setFillColor(r.fill); pdf.setLineWidth(r.weight * SCHEME_UNIT);
    pdf.rect(px(r.x), py(r.y), r.width * SCHEME_UNIT, r.height * SCHEME_UNIT, 'FD');
  }
  for (const line of construction.lines) {
    pdf.setDrawColor('#65817b'); pdf.setLineWidth(1.1 * SCHEME_UNIT); pdf.setLineDashPattern(line.dashed ? [0.54, 0.54] : [], 0);
    line.points.slice(1).forEach((p, i) => { const prev = line.points[i]!; pdf.line(px(prev.x), py(prev.y), px(p.x), py(p.y)); });
  }
  pdf.setLineDashPattern([], 0); pdf.setDrawColor('#9aa9a3'); pdf.setLineWidth(0.6 * SCHEME_UNIT);
  for (const d of layout.dimensions) {
    const horizontal = d.axis === 'width';
    const x1 = px(horizontal ? d.start : d.cross); const y1 = py(horizontal ? d.cross : d.start);
    const x2 = px(horizontal ? d.end : d.cross); const y2 = py(horizontal ? d.cross : d.end);
    pdf.line(x1, y1, x2, y2);
    for (const [tx, ty] of [[x1, y1], [x2, y2]]) pdf.line(tx! - 0.54, ty! - 0.54, tx! + 0.54, ty! + 0.54);
    pdf.setFontSize((d.primary ? 22 : 18) * SCHEME_UNIT / 0.352778); pdf.setTextColor(d.primary ? '#536b62' : '#7b8d85');
    if (horizontal) pdf.text(d.text, px((d.start + d.end) / 2), py(d.cross + 20) + 1, { align: 'center' });
    else pdf.text(d.text, px(d.cross + 17) + 1, py((d.start + d.end) / 2), { align: 'center', angle: 90 });
  }
}
