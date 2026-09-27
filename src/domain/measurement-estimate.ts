import type { WindowMeasurement } from './measurements/window/types';
import type { WindowFinishMeasurement } from './measurements/window-finish/types';
import type { UserConfiguration } from './configuration/types';
import type { WindowGeometry } from './geometry/types';
import type { GlazingPrice } from './pricing/glazing-pricing';
import type { FinishConfiguration, NormalizedFinishMaterial } from './configuration/finish-types';
import type { FinishGeometry } from './geometry/finish-geometry';
import type { FinishPrice } from './pricing/finish-pricing';

export interface WindowEstimate {
  id: string;
  schemaVersion: 2;
  measurement: WindowMeasurement;
  configuration: UserConfiguration;
  geometry: WindowGeometry;
  price: GlazingPrice;
}

export interface FinishEstimate {
  id: string;
  schemaVersion: 2;
  measurement: WindowFinishMeasurement;
  configuration: FinishConfiguration;
  normalizedMaterials: readonly NormalizedFinishMaterial[];
  geometry: FinishGeometry;
  price: FinishPrice;
}

export type MeasurementEstimate = WindowEstimate | FinishEstimate;
