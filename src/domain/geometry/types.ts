import type { GlazingOpening, HingeSide } from '../measurements/shared';

/** Areas in square metres, without intermediate rounding. */
export interface GlazingGeometry { totalAreaM2: number; activeAreaM2: number }
/** Millimetres, origin at the outer top-left corner. */
export interface Rectangle { xMm: number; yMm: number; widthMm: number; heightMm: number }
export interface Point { xMm: number; yMm: number }
export interface OpeningSymbol { kind: 'turn' | 'tilt' | 'hinge' | 'sliding'; points: readonly Point[] }
/** Aluminium swing has hinges but deliberately has no PVC hardware identity. */
export type GeometryOpening = GlazingOpening | { openingType: 'turn'; hingeSide: HingeSide; hardwareId?: never };
export type SectionGeometry = Rectangle & GeometryOpening & { id: string; areaM2: number; symbols: readonly OpeningSymbol[]; fill?: 'glass' | 'sandwich' };
export interface TransomGeometry extends Rectangle { openingType: 'fixed'; areaM2: number }
export interface WindowGeometry extends GlazingGeometry {
  /** Display extent only. Never use bounding area to price a balcony block. */
  bounds: Rectangle;
  /** Ordered glazed elements, including the door for balconyBlock. */
  sections: readonly SectionGeometry[];
  transom: TransomGeometry | null;
  splitLine?: readonly Point[];
}
