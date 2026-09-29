import type { GlazingPlane, GlazingOpening, Section, Material, Lamination, MeasurementIdentity } from '../shared';
import type { AdditionalWork } from '../../works/types';

export type BalconySection = Section<GlazingOpening>;
export type PlanePosition = 'left' | 'facade' | 'right';
export type BalconyLevels = { mode: 'oneLevel'; splitHeightMm?: never; lowerFill?: never }
  | { mode: 'twoLevel'; splitHeightMm: number; lowerFill: 'glass' | 'sandwich' };
export interface BalconyPlane extends GlazingPlane<BalconySection> {
  name: string;
  position: PlanePosition;
  widthMm: number;
  heightMm: number;
  sectionCount: number;
  levels: BalconyLevels;
}
export interface BalconyMeasurement extends MeasurementIdentity {
  kind: 'Balcony';
  balconyType: 'straight' | 'L' | 'U';
  side?: 'left' | 'right';
  material: Material;
  profileId: string;
  lamination: Lamination;
  planes: readonly BalconyPlane[];
  additionalWorks: readonly AdditionalWork[];
}
