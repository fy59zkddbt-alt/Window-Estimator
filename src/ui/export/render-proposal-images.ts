import type { ProposalDocumentV2, ProposalSchemeGeometryV2 } from '../../domain/documents/proposal-document-v2';
import { customerConstruction, customerSchemeLayout, glazingPrimitives, schemeColumnWidths } from '../glazing-drawing';
import { IMAGE_WIDTH, IMAGE_MARGIN, imageContentWidth, imageFont, imageFilename, layoutProposalImages, textStyles, type ImagePage } from './proposal-image-layout';

function drawScheme(ctx: CanvasRenderingContext2D, geometry: ProposalSchemeGeometryV2, x: number, y: number, width: number) {
  const b = geometry.bounds;
  const layout = customerSchemeLayout(geometry, width, 380);
  const scale = layout.scale;
  const left = x + layout.plot.x;
  const top = y + layout.plot.y;
  const px = (v: number) => left + (v - b.xMm) * scale;
  const py = (v: number) => top + (v - b.yMm) * scale;
  const primitives = glazingPrimitives(geometry, true);
  const construction = customerConstruction(geometry, layout);
  ctx.save();
  for (const { rectangle: r } of primitives.rectangles) {
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#244d50'; ctx.lineWidth = 3.2;
    ctx.fillRect(px(r.xMm), py(r.yMm), r.widthMm * scale, r.heightMm * scale);
    ctx.strokeRect(px(r.xMm), py(r.yMm), r.widthMm * scale, r.heightMm * scale);
  }
  for (const r of construction.contours) {
    ctx.fillStyle = r.fill; ctx.strokeStyle = '#53706e'; ctx.lineWidth = r.weight;
    ctx.fillRect(x + r.x, y + r.y, r.width, r.height); ctx.strokeRect(x + r.x, y + r.y, r.width, r.height);
  }
  for (const line of construction.lines) {
    ctx.strokeStyle = '#65817b'; ctx.lineWidth = 1.1; ctx.setLineDash(line.dashed ? [3, 3] : []); ctx.beginPath();
    line.points.forEach((p, i) => { if (i === 0) ctx.moveTo(x + p.x, y + p.y); else ctx.lineTo(x + p.x, y + p.y); });
    ctx.stroke();
  }
  ctx.setLineDash([]); ctx.strokeStyle = '#9aa9a3'; ctx.lineWidth = 0.6;
  for (const d of layout.dimensions) {
    ctx.font = `400 ${d.primary ? 22 : 18}px Arial, sans-serif`; ctx.fillStyle = d.primary ? '#536b62' : '#7b8d85';
    const horizontal = d.axis === 'width';
    const x1 = x + (horizontal ? d.start : d.cross); const y1 = y + (horizontal ? d.cross : d.start);
    const x2 = x + (horizontal ? d.end : d.cross); const y2 = y + (horizontal ? d.cross : d.end);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    for (const [tx, ty] of [[x1, y1], [x2, y2]] as const) { ctx.moveTo(tx - 3, ty - 3); ctx.lineTo(tx + 3, ty + 3); }
    ctx.stroke(); ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (horizontal) ctx.fillText(d.text, x + (d.start + d.end) / 2, y + d.cross + 20);
    else { ctx.translate(x + d.cross + 17, y + (d.start + d.end) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(d.text, 0, 0); }
    ctx.restore();
  }
  ctx.restore();
}
export function drawImagePage(ctx: CanvasRenderingContext2D, page: ImagePage) {
  ctx.fillStyle = '#f3f6f4'; ctx.fillRect(0, 0, IMAGE_WIDTH, page.height);
  ctx.textBaseline = 'top';
  for (const { card, y } of page.cards) {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(IMAGE_MARGIN, y, IMAGE_WIDTH - 2 * IMAGE_MARGIN, card.height);
    if (card.summary) { ctx.fillStyle = '#236653'; ctx.fillRect(IMAGE_MARGIN, y, 5, card.height); }
    let top = y + 24;
    for (const atom of card.atoms) {
      if (atom.kind === 'text') {
        ctx.font = imageFont(atom.style); ctx.fillStyle = textStyles[atom.style].color;
        ctx.textAlign = atom.align === 'right' ? 'right' : 'left';
        ctx.fillText(atom.text, atom.align === 'right' ? IMAGE_WIDTH - IMAGE_MARGIN - 24 : IMAGE_MARGIN + 24, top);
        if (atom.amount) { ctx.textAlign = 'right'; ctx.fillText(atom.amount, IMAGE_WIDTH - IMAGE_MARGIN - 24, top); }
        ctx.textAlign = 'left';
      } else {
        const widths = schemeColumnWidths(atom.geometries, imageContentWidth); let offset = 0;
        atom.geometries.forEach((g, i) => {
          ctx.font = imageFont('small'); ctx.fillStyle = textStyles.small.color;
          atom.titles[i]!.forEach((line, lineIndex) => ctx.fillText(line, IMAGE_MARGIN + 24 + offset, top + lineIndex * textStyles.small.lineHeight));
          drawScheme(ctx, g, IMAGE_MARGIN + 24 + offset, top + atom.headingHeight, widths[i]!); offset += widths[i]!;
        });
      }
      top += atom.height;
    }
  }
}
export interface ProposalImage { blob: Blob; filename: string; width: number; height: number; pageCount: number; index: number }
/** One bounded canvas at a time. No DOM capture, settings, storage or calculation input. */
export async function* renderProposalImages(document: ProposalDocumentV2, onlyPage?: number): AsyncGenerator<ProposalImage> {
  if (document.version !== 2) throw new Error('Unsupported proposal version');
  const canvas = globalThis.document.createElement('canvas');
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    const pages = layoutProposalImages(document, (text, style) => { ctx.font = imageFont(style); return ctx.measureText(text).width; });
    for (const [index, page] of pages.entries()) {
      if (onlyPage !== undefined && index !== onlyPage) continue;
      canvas.width = IMAGE_WIDTH; canvas.height = page.height;
      drawImagePage(ctx, page);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG encoding failed')), 'image/png'));
      // Release pixel backing before consumer/download work; next page reuses the canvas.
      canvas.width = 0; canvas.height = 0;
      yield { blob, filename: imageFilename(index, pages.length), width: IMAGE_WIDTH, height: page.height, pageCount: pages.length, index };
    }
  } finally { canvas.width = 0; canvas.height = 0; canvas.remove(); }
}

/** Download URLs live only for the browser's handoff, never in React/storage. */
export async function downloadProposalImage(image: ProposalImage): Promise<void> {
  const link = document.createElement('a');
  const url = URL.createObjectURL(image.blob);
  try {
    link.href = url; link.download = image.filename; link.hidden = true; document.body.append(link); link.click();
    await new Promise<void>((resolve) => setTimeout(resolve, 1000));
  } finally { link.remove(); URL.revokeObjectURL(url); }
}
