export type Material = 'pvc' | 'aluminium';
export type Lamination = 'none' | 'one_side' | 'two_sides';
export type OpeningType = 'fixed' | 'turn' | 'tilt_turn';
export type HingeSide = 'left' | 'right';

export type Opening =
  | { openingType: 'fixed'; hingeSide?: never }
  | { openingType: 'turn' | 'tilt_turn'; hingeSide: HingeSide };

export type Section = { id: string; widthMm: number; heightMm: number } & Opening;
export interface GlazingPlane { id: string; sections: readonly Section[] }
export interface MeasurementIdentity { id: string; room: string; name: string }
