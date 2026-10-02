import type { WindowMeasurement } from './measurements/window/types';
import type { WindowFinishMeasurement } from './measurements/window-finish/types';
import type { UserConfiguration } from './configuration/types';
import type { WindowGeometry } from './geometry/types';
import type { InstalledGlazingPrice } from './pricing/glazing-pricing';
import type { FinishConfiguration, NormalizedFinishMaterial } from './configuration/finish-types';
import type { FinishGeometry } from './geometry/finish-geometry';
import type { FinishPrice } from './pricing/finish-pricing';
import type { BalconyMeasurement } from './measurements/balcony/types';
import type { BalconyGeometry } from './geometry/balcony-geometry';

export interface MeasurementTotals {
  basePriceMinor: number;
  additionalWorksTotalMinor: number;
  measurementTotalMinor: number;
}
export interface WindowEstimate extends MeasurementTotals {
  id: string;
  schemaVersion: 2;
  measurement: WindowMeasurement;
  configuration: UserConfiguration;
  geometry: WindowGeometry;
  price: InstalledGlazingPrice;
}

export interface FinishEstimate extends MeasurementTotals {
  id: string;
  schemaVersion: 2;
  measurement: WindowFinishMeasurement;
  configuration: FinishConfiguration;
  normalizedMaterials: readonly NormalizedFinishMaterial[];
  geometry: FinishGeometry;
  price: FinishPrice;
}

export interface BalconyEstimate extends MeasurementTotals {
  id: string;
  schemaVersion: 2;
  measurement: BalconyMeasurement;
  configuration: UserConfiguration;
  geometry: BalconyGeometry;
  price: InstalledGlazingPrice;
}
export type MeasurementEstimate = WindowEstimate | FinishEstimate | BalconyEstimate;
