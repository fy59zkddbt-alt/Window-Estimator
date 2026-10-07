import type { GeometryOpening, Rectangle, OpeningSymbol } from './types';

/** Symbol coordinates are derived here, not recomputed by a renderer. Interior view.
 * Turn: triangle apex at the hinge side. Tilt: apex at the top, hinges at the bottom.
 * Insets and hinge markers are symbolic; no physical profile thickness is implied.
 */
export function openingSymbols(rectangle: Rectangle, opening: GeometryOpening): OpeningSymbol[] {
  if (opening.openingType === 'fixed') return [];
  const { xMm: x, yMm: y, widthMm: w, heightMm: h } = rectangle;
  if (opening.openingType === 'sliding') return [{ kind: 'sliding', points: [
    { xMm: x + w * 0.2, yMm: y + h * 0.5 }, { xMm: x + w * 0.8, yMm: y + h * 0.5 },
    { xMm: x + w * 0.65, yMm: y + h * 0.4 }, { xMm: x + w * 0.8, yMm: y + h * 0.5 },
    { xMm: x + w * 0.65, yMm: y + h * 0.6 },
  ] }];
  const left = x + w * 0.1;
  const right = x + w * 0.9;
  const top = y + h * 0.1;
  const bottom = y + h * 0.9;
  const hingeX = opening.hingeSide === 'left' ? left : right;
  const freeX = opening.hingeSide === 'left' ? right : left;
  const symbols: OpeningSymbol[] = [
    { kind: 'turn', points: [{ xMm: freeX, yMm: top }, { xMm: hingeX, yMm: y + h / 2 }, { xMm: freeX, yMm: bottom }] },
    ...[0.25, 0.75].map((fraction): OpeningSymbol => ({ kind: 'hinge', points: [
      { xMm: hingeX, yMm: y + h * (fraction - 0.04) }, { xMm: hingeX, yMm: y + h * (fraction + 0.04) },
    ] })),
  ];
  if (opening.openingType === 'tilt_turn') symbols.push({ kind: 'tilt', points: [
    { xMm: left, yMm: bottom }, { xMm: x + w / 2, yMm: top }, { xMm: right, yMm: bottom },
  ] });
  return symbols;
}
