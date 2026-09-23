import type { GlazingPlane, Lamination, Material, MeasurementIdentity, Section } from '../shared';

export interface WindowMeasurement extends MeasurementIdentity {
  kind: 'Window';
  material: Material;
  profileId: string;
  hardwareId: string | null;
  lamination: Lamination;
  plane: GlazingPlane & { sections: readonly [Section] };
}
