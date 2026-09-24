export type Material = 'pvc' | 'aluminium';
export type Lamination = 'none' | 'one_side' | 'two_sides';
export type OpeningType = 'fixed' | 'turn' | 'tilt_turn';
export type HingeSide = 'left' | 'right';

export type Opening =
  | { openingType: 'fixed'; hingeSide?: never; hardwareId?: never }
  | { openingType: 'turn' | 'tilt_turn'; hingeSide: HingeSide; hardwareId: string };

export type OpeningElement = { id: string } & Opening;
/** Window section: its height is derived from the window, never duplicated here. */
export type Section = OpeningElement & { widthMm: number };
export interface GlazingPlane { id: string; sections: readonly Section[] }
export interface MeasurementIdentity { id: string; room: string; name: string }
