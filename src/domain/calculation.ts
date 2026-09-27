import type { WindowMeasurement } from './measurements/window/types';
import type { WindowFinishMeasurement } from './measurements/window-finish/types';
import type { UserConfiguration } from './configuration/types';
import type { FinishConfiguration } from './configuration/finish-types';

export type Measurement = WindowMeasurement | WindowFinishMeasurement;
export type MeasurementConfiguration =
  | { kind: 'Window'; configuration: UserConfiguration }
  | { kind: 'WindowFinish'; configuration: FinishConfiguration };
export interface Calculation {
  id: string;
  schemaVersion: 3;
  createdAt: string;
  updatedAt: string;
  clientName?: string;
  clientPhone?: string;
  objectAddress?: string;
  measurements: readonly Measurement[];
  orderAdditionalWorks: readonly never[];
  /** Independent tariff snapshots keyed by measurement ID. */
  configuration: Readonly<Record<string, MeasurementConfiguration>>;
}
