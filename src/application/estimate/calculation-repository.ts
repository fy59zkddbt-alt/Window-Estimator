import type { Calculation } from '../../domain/calculation';

export interface CalculationRepository {
  save(calculation: Calculation): Promise<void>;
  get(id: string): Promise<Calculation | undefined>;
}
