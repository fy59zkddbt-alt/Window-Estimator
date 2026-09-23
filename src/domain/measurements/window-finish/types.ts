import type { MeasurementIdentity } from '../shared';

// Contract only; finish dimensions and workflow are deliberately not designed yet.
export interface WindowFinishMeasurement extends MeasurementIdentity {
  kind: 'WindowFinish';
  additionalWorkIds: readonly string[];
}
