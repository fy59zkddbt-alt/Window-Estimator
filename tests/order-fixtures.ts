import type { MeasurementEstimate } from '../src/domain/measurement-estimate';
import type { Calculation } from '../src/domain/calculation';
import { createCalculation, saveMeasurement, estimateCalculation } from '../src/application/estimate/calculation-service';
export const date = '2026-09-25T10:00:00.000Z';
export function pack(result: MeasurementEstimate): Calculation { return saveMeasurement(createCalculation(result.id, date), result, date, 'add'); }
export function firstEstimate(value: Calculation): MeasurementEstimate { return estimateCalculation(value).lines[0]!.result; }
