import type { MeasurementIdentity } from '../shared';
import type { FinishType } from '../../configuration/finish-types';
import type { AdditionalWork } from '../../works/types';

export interface FinishDimensions { widthMm: number; heightMm: number; depthMm: number }
export interface FinishSelection { finishType: FinishType; materialId: string }
export interface WindowFinishMeasurement extends MeasurementIdentity, FinishDimensions {
  kind: 'WindowFinish';
  additionalWorks: readonly AdditionalWork[];
  /** One or both finish types; each at most once. */
  selections: readonly FinishSelection[];
}
