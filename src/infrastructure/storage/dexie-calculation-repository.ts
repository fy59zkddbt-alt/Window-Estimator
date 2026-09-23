import type { CalculationRepository } from '../../application/estimate/calculation-repository';
import type { Calculation } from '../../domain/calculation';
import { EstimatorDatabase } from './database';

export class DexieCalculationRepository implements CalculationRepository {
  constructor(private readonly database: EstimatorDatabase) {}
  async save(calculation: Calculation): Promise<void> {
    await this.database.calculations.put(calculation);
  }
  get(id: string): Promise<Calculation | undefined> {
    return this.database.calculations.get(id);
  }
}
