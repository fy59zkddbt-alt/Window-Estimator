import type { Calculation } from '../../domain/calculation';
import type { MeasurementEstimate, WindowEstimate, FinishEstimate, BalconyEstimate } from '../../domain/measurement-estimate';
export function isBalconyEstimate(value: MeasurementEstimate): value is BalconyEstimate { return value.measurement.kind === 'Balcony'; }
export function isWindowEstimate(value: MeasurementEstimate): value is WindowEstimate { return value.measurement.kind === 'Window'; }
export function isFinishEstimate(value: MeasurementEstimate): value is FinishEstimate { return value.measurement.kind === 'WindowFinish'; }
export interface CalculationRepository {
  save(calculation: Calculation): Promise<void>;
  get(id: string): Promise<Calculation | undefined>;
  list(): Promise<Calculation[]>;
  getActiveId(): Promise<string | undefined>;
  setActiveId(id: string): Promise<void>;
}
