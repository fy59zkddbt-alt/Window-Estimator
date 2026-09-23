import type { Opening } from '../measurements/shared';

/** Areas in square metres, without intermediate rounding. */
export interface GlazingGeometry { totalAreaM2: number; activeAreaM2: number }
/** Millimetres, origin at the outer top-left corner. */
export interface Rectangle { xMm: number; yMm: number; widthMm: number; heightMm: number }
export interface Point { xMm: number; yMm: number }
export interface OpeningSymbol { kind: 'turn' | 'tilt' | 'hinge'; points: readonly Point[] }
export type SectionGeometry = Rectangle & Opening & { id: string; areaM2: number; symbols: readonly OpeningSymbol[] };
export interface TransomGeometry extends Rectangle { openingType: 'fixed'; areaM2: number }
export interface WindowGeometry extends GlazingGeometry {
  bounds: Rectangle;
  sections: readonly SectionGeometry[];
  transom: TransomGeometry | null;
}
