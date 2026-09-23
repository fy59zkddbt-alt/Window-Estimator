import { validateWindow } from '../measurements/window/create-window';
import type { WindowMeasurement } from '../measurements/window/types';
import type { Opening } from '../measurements/shared';
import type { OpeningSymbol, Rectangle, SectionGeometry, WindowGeometry } from './types';

/** Symbol coordinates are derived here, not recomputed by a renderer. Interior view.
 * Turn: triangle apex at the hinge side. Tilt: apex at the top, hinges at the bottom.
 * Insets and hinge markers are symbolic; no physical profile thickness is implied.
 */
function openingSymbols(rectangle: Rectangle, opening: Opening): OpeningSymbol[] {
  if (opening.openingType === 'fixed') return [];
  const { xMm: x, yMm: y, widthMm: w, heightMm: h } = rectangle;
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

function area(widthMm: number, heightMm: number): number {
  const result = (widthMm / 1000) * (heightMm / 1000);
  if (!Number.isFinite(result) || result <= 0) throw new Error('Площадь вне допустимого числового диапазона.');
  return result;
}

export function getWindowGeometry(window: WindowMeasurement): WindowGeometry {
  validateWindow(window);
  const { widthMm, heightMm } = window;
  const transomHeight = window.transom?.heightMm ?? 0;
  const lowerHeight = heightMm - transomHeight;
  let xMm = 0;
  const sections: SectionGeometry[] = window.plane.sections.map((section) => {
    const rectangle = { xMm, yMm: transomHeight, widthMm: section.widthMm, heightMm: lowerHeight };
    xMm += section.widthMm;
    return { ...section, ...rectangle, areaM2: area(section.widthMm, lowerHeight), symbols: openingSymbols(rectangle, section) };
  });
  const transom = window.transom ? { xMm: 0, yMm: 0, widthMm, heightMm: transomHeight, openingType: 'fixed' as const, areaM2: area(widthMm, transomHeight) } : null;
  const totalAreaM2 = area(widthMm, heightMm);
  const rawActiveArea = sections.reduce((sum, section) => sum + (section.openingType === 'fixed' ? 0 : section.areaM2), 0);
  if (!Number.isFinite(rawActiveArea) || rawActiveArea - totalAreaM2 > 32 * Number.EPSILON * totalAreaM2) throw new Error('Активная площадь превышает общую.');
  // Width equality already validated. Cap only machine roundoff after area summation;
  // no entered dimensions, section rectangles or prices are corrected.
  const activeAreaM2 = Math.min(rawActiveArea, totalAreaM2);
  return { totalAreaM2, activeAreaM2, bounds: { xMm: 0, yMm: 0, widthMm, heightMm }, sections, transom };
}
