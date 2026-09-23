import type { GlazingPlane, Material, MeasurementIdentity } from '../shared';

// Contract only: no balcony creation, geometry or pricing flow in this iteration.
export interface BalconyMeasurement extends MeasurementIdentity {
  kind: 'Balcony';
  material: Material;
  planes: readonly GlazingPlane[];
}
