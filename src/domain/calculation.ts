import type { WindowMeasurement } from './measurements/window/types';
import type { WindowFinishMeasurement } from './measurements/window-finish/types';
import type { UserConfiguration } from './configuration/types';
import type { FinishConfiguration } from './configuration/finish-types';
import type { AdditionalWork } from './works/types';
import type { BalconyMeasurement } from './measurements/balcony/types';
import type { Discount } from './discount';

export type Measurement = WindowMeasurement | WindowFinishMeasurement | BalconyMeasurement;
export type MeasurementConfiguration =
  | { kind: 'Balcony'; configuration: UserConfiguration }
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
  orderAdditionalWorks: readonly AdditionalWork[];
  discount: Discount;
  /** Independent tariff snapshots keyed by measurement ID. */
  configuration: Readonly<Record<string, MeasurementConfiguration>>;
}
