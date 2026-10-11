import type { ProposalSchemeGeometryV2, ProposalRectangleV2 } from '../domain/documents/proposal-document-v2';
import { proposalMm } from './proposal-presentation';

export type GlazingDrawing = Pick<ProposalSchemeGeometryV2, 'bounds' | 'transom' | 'splitLine'> & {
  sections: readonly (ProposalRectangleV2 & { fill?: 'glass' | 'sandwich'; symbols: ProposalSchemeGeometryV2['sections'][number]['symbols'] })[];
};
/** Interior view: turn apex = hinge side; dashed tilt apex = top; sliding = arrow.
 * Customer drawings omit separate hinge bars. The original domain points are unchanged.
 * Editor drawings retain their existing markers and captions.
 */
export function glazingPrimitives(geometry: GlazingDrawing, customer = false) {
  return {
    rectangles: [
      ...(geometry.transom ? [{ rectangle: geometry.transom, className: 'glazing transom', fill: '#e2edef' }] : []),
      ...geometry.sections.map((rectangle) => ({ rectangle, className: `glazing section ${rectangle.fill === 'sandwich' ? 'sandwich' : ''}`, fill: rectangle.fill === 'sandwich' ? '#d6d1c4' : '#edf5f7' })),
    ],
    lines: [
      ...geometry.sections.flatMap((section) => section.symbols.filter((symbol) => !customer || symbol.kind !== 'hinge').map((symbol) => ({ points: symbol.points, kind: symbol.kind as string, width: symbol.kind === 'hinge' ? 5 : 1.5, dashed: symbol.kind === 'tilt' }))),
      ...(geometry.splitLine ? [{ points: geometry.splitLine, kind: '', width: 1.5, dashed: false }] : []),
    ],
  };
}
export interface SchemeDimension {
  axis: 'width' | 'height'; start: number; end: number; cross: number; text: string; primary?: boolean;
}
/** Annotation placement in presentation pixels, not new measurement geometry.
 * Original rectangles/symbols remain in mm; SVG/canvas apply this single fit transform.
 */
export function customerSchemeLayout(geometry: GlazingDrawing, width: number, height: number) {
  const b = geometry.bounds;
  const scale = Math.min((width - 120) / b.widthMm, (height - 118) / b.heightMm);
  const plot = { x: 12 + (width - 120 - b.widthMm * scale) / 2, y: 12 + (height - 118 - b.heightMm * scale) / 2,
    width: b.widthMm * scale, height: b.heightMm * scale };
  const px = (value: number) => plot.x + (value - b.xMm) * scale;
  const py = (value: number) => plot.y + (value - b.yMm) * scale;
  const dimensions: SchemeDimension[] = [];
  const spans = [...new Map(geometry.sections.map((s) => [`${s.xMm}:${s.widthMm}`, s])).values()].sort((a, c) => a.xMm - c.xMm);
  if (spans.length > 1) for (const s of spans) dimensions.push({ axis: 'width', start: px(s.xMm), end: px(s.xMm + s.widthMm), cross: plot.y + plot.height + 22, text: proposalMm(s.widthMm) });
  dimensions.push({ axis: 'width', start: plot.x, end: plot.x + plot.width, cross: plot.y + plot.height + (spans.length > 1 ? 68 : 24), text: proposalMm(b.widthMm), primary: true });
  const splitY = geometry.splitLine?.[0]?.yMm ?? (geometry.transom ? geometry.transom.yMm + geometry.transom.heightMm : undefined);
  if (splitY !== undefined) {
    for (const [from, to] of [[b.yMm, splitY], [splitY, b.yMm + b.heightMm]] as const) dimensions.push({ axis: 'height', start: py(from), end: py(to), cross: plot.x + plot.width + 26, text: proposalMm(to - from) });
  } else {
    const shortHeights = [...new Set(geometry.sections.map((s) => s.heightMm).filter((h) => h < b.heightMm))];
    for (const h of shortHeights) dimensions.push({ axis: 'height', start: plot.y, end: py(b.yMm + h), cross: plot.x + plot.width + 26, text: proposalMm(h) });
  }
  const separateHeight = dimensions.some((d) => d.axis === 'height');
  dimensions.push({ axis: 'height', start: plot.y, end: plot.y + plot.height, cross: plot.x + plot.width + (separateHeight ? 76 : 26), text: proposalMm(b.heightMm), primary: true });
  return { plot, scale, dimensions };
}

/** Symbolic pixel insets, never physical frame sizes or new measurement geometry.
 * The source section rectangles and supplied symbol points own size and handing.
 * Combined turn/tilt retains both full conventional diagonals inside the glazing.
 */
export function customerConstruction(geometry: GlazingDrawing, layout: ReturnType<typeof customerSchemeLayout>) {
  const b = geometry.bounds;
  const rectangles = glazingPrimitives(geometry, true).rectangles;
  const contours: { x: number; y: number; width: number; height: number; kind: 'sash' | 'glass'; fill: string; weight: number }[] = [];
  const lines: { kind: string; points: { x: number; y: number }[]; dashed: boolean }[] = [];
  for (const { rectangle: r, fill } of rectangles) {
    const symbols = 'symbols' in r ? (r as GlazingDrawing['sections'][number]).symbols.filter(s => s.kind !== 'hinge') : [];
    const active = symbols.length > 0;
    const x = layout.plot.x + (r.xMm - b.xMm) * layout.scale;
    const y = layout.plot.y + (r.yMm - b.yMm) * layout.scale;
    const width = r.widthMm * layout.scale; const height = r.heightMm * layout.scale;
    const inset = Math.min(active ? 10 : 6, width * 0.16, height * 0.16);
    if (active) contours.push({ x: x + inset / 2, y: y + inset / 2, width: width - inset, height: height - inset, kind: 'sash', fill: '#ffffff', weight: 1.8 });
    const glass = { x: x + inset, y: y + inset, width: width - 2 * inset, height: height - 2 * inset, kind: 'glass' as const, fill, weight: 1.1 };
    contours.push(glass);
    for (const symbol of symbols) {
      lines.push({ kind: symbol.kind, dashed: symbol.kind === 'tilt', points: symbol.points.map(p => {
        const nx = (p.xMm - r.xMm) / r.widthMm; const ny = (p.yMm - r.yMm) / r.heightMm;
        return { x: glass.x + nx * glass.width, y: glass.y + ny * glass.height };
      }) });
    }
  }
  return { contours, lines };
}

/** Coherent elevations: shared drawing scale where heights agree, wider facade slot.
 * Reserve the same annotation space per plane; divide remaining space by true widths.
 */
export function schemeColumnWidths(geometries: readonly GlazingDrawing[], width: number): number[] {
  const reserved = 120 * geometries.length;
  const total = geometries.reduce((sum, g) => sum + g.bounds.widthMm, 0);
  return geometries.map(g => 120 + (width - reserved) * g.bounds.widthMm / total);
}
