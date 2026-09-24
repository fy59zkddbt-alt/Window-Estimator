import type { MeasurementIdentity } from '../shared';
import type { FinishType } from '../../configuration/finish-types';

export interface FinishDimensions { widthMm: number; heightMm: number; depthMm: number }
export interface FinishSelection { finishType: FinishType; materialId: string }
export interface WindowFinishMeasurement extends MeasurementIdentity, FinishDimensions {
  kind: 'WindowFinish';
  /** One or both finish types; each at most once. */
  selections: readonly FinishSelection[];
}
