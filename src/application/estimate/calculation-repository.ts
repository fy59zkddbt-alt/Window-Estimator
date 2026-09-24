import type { Calculation, WindowCalculation, FinishCalculation } from '../../domain/calculation';

export function isWindowCalculation(value: Calculation): value is WindowCalculation {
  return value.measurement.kind === 'Window';
}
export function isFinishCalculation(value: Calculation): value is FinishCalculation {
  return value.measurement.kind === 'WindowFinish';
}

export interface CalculationRepository {
  save(calculation: Calculation): Promise<void>;
  get(id: string): Promise<Calculation | undefined>;
}
