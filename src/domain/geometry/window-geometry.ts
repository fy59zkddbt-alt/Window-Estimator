import { validateWindow } from '../measurements/window/create-window';
import type { WindowMeasurement } from '../measurements/window/types';
import type { Opening, OpeningElement } from '../measurements/shared';
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
  if (window.windowType === 'balconyBlock') return getBlockGeometry(window);
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

function getBlockGeometry(window: Extract<WindowMeasurement, { windowType: 'balconyBlock' }>): WindowGeometry {
  // Explicit layout rule: common top edge, no inferred sill offset or artificial infill.
  const windows = window.plane.sections.map((section) => ({ element: section, widthMm: section.widthMm, heightMm: window.windowHeightMm, areaM2: area(section.widthMm, window.windowHeightMm) }));
  const door = { element: window.door, widthMm: window.doorWidthMm, heightMm: window.doorHeightMm, areaM2: area(window.doorWidthMm, window.doorHeightMm) };
  // Price areas in stable identity order, so door placement cannot change floating-point summation.
  const allElements = [...windows, door];
  const ordered: { element: OpeningElement; widthMm: number; heightMm: number; areaM2: number }[] = [...windows];
  const doorIndex = window.doorPosition === 'left' ? 0 : window.doorPosition === 'middle' ? 1 : ordered.length;
  ordered.splice(doorIndex, 0, door);
  let xMm = 0;
  const sections: SectionGeometry[] = ordered.map(({ element, widthMm, heightMm, areaM2 }) => {
    const rectangle = { xMm, yMm: 0, widthMm, heightMm };
    xMm += widthMm;
    return { ...element, ...rectangle, areaM2, symbols: openingSymbols(rectangle, element) };
  });
  const totalAreaM2 = allElements.reduce((sum, item) => sum + item.areaM2, 0);
  const activeAreaM2 = allElements.reduce((sum, item) => sum + (item.element.openingType === 'fixed' ? 0 : item.areaM2), 0);
  if (!Number.isFinite(xMm) || !Number.isFinite(totalAreaM2)) throw new Error('Размеры блока вне допустимого числового диапазона.');
  return {
    totalAreaM2, activeAreaM2, sections, transom: null,
    bounds: { xMm: 0, yMm: 0, widthMm: xMm, heightMm: Math.max(window.doorHeightMm, window.windowHeightMm) },
  };
}
