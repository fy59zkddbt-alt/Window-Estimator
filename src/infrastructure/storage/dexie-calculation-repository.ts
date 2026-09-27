import type { CalculationRepository } from '../../application/estimate/calculation-repository';
import type { Calculation } from '../../domain/calculation';
import { EstimatorDatabase } from './database';
import { normalizeCalculation } from '../../application/estimate/calculation-service';

export class DexieCalculationRepository implements CalculationRepository {
  constructor(private readonly database: EstimatorDatabase) {}
  async save(calculation: Calculation): Promise<void> {
    const snapshot = normalizeCalculation(calculation);
    await this.database.transaction('rw', this.database.calculations, this.database.settings, async () => {
      await this.database.calculations.put(snapshot);
      await this.database.settings.put({ key: 'activeCalculationId', value: snapshot.id });
    });
  }
  async get(id: string): Promise<Calculation | undefined> {
    const saved = await this.database.calculations.get(id);
    return saved ? normalizeCalculation(saved) : undefined;
  }
  async list(): Promise<Calculation[]> { return (await this.database.calculations.orderBy('updatedAt').reverse().toArray()).map(normalizeCalculation); }
  async getActiveId(): Promise<string | undefined> { return (await this.database.settings.get('activeCalculationId'))?.value; }
  async setActiveId(id: string): Promise<void> {
    if (!await this.database.calculations.get(id)) throw new Error('Расчёт не найден.');
    await this.database.settings.put({ key: 'activeCalculationId', value: id });
  }
}
