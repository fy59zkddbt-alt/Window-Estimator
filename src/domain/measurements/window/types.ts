import type { GlazingPlane, Lamination, Material, MeasurementIdentity } from '../shared';

export type WindowType = 'single' | 'double' | 'triple';
export interface Transom { heightMm: number; openingType: 'fixed' }

export interface WindowMeasurement extends MeasurementIdentity {
  kind: 'Window';
  windowType: WindowType;
  widthMm: number;
  heightMm: number;
  material: Material;
  profileId: string;
  lamination: Lamination;
  plane: GlazingPlane;
  transom?: Transom;
}
