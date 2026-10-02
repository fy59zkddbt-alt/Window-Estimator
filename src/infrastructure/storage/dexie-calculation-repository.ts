import type { CalculationRepository } from '../../application/estimate/calculation-repository';
import type { Calculation } from '../../domain/calculation';
import { EstimatorDatabase } from './database';
import { normalizeCalculation } from '../../application/estimate/calculation-service';
import { ownedKey } from './local-ownership';

export class DexieCalculationRepository implements CalculationRepository {
  // Anonymous mode is reserved for legacy migration/compatibility; bootstrap always supplies userId.
  constructor(private readonly database: EstimatorDatabase, private readonly userId?: string) {
    if (userId !== undefined) ownedKey(userId, '');
  }
  async save(calculation: Calculation): Promise<void> {
    const snapshot = normalizeCalculation(calculation);
    if (this.userId !== undefined) {
      const userId = this.userId;
      await this.database.transaction('rw', this.database.ownedCalculations, this.database.ownedSettings, async () => {
        await this.database.ownedCalculations.put({ key: ownedKey(userId, snapshot.id), userId, calculation: snapshot });
        await this.database.ownedSettings.put({ key: ownedKey(userId, 'activeCalculationId'), value: snapshot.id });
      });
      return;
    }
    await this.database.transaction('rw', this.database.calculations, this.database.settings, async () => {
      await this.database.calculations.put(snapshot);
      await this.database.settings.put({ key: 'activeCalculationId', value: snapshot.id });
    });
  }
  async get(id: string): Promise<Calculation | undefined> {
    const saved = this.userId === undefined ? await this.database.calculations.get(id)
      : (await this.database.ownedCalculations.get(ownedKey(this.userId, id)))?.calculation;
    return saved ? normalizeCalculation(saved) : undefined;
  }
  async list(): Promise<Calculation[]> {
    if (this.userId === undefined) return (await this.database.calculations.orderBy('updatedAt').reverse().toArray()).map(normalizeCalculation);
    return (await this.database.ownedCalculations.where('userId').equals(this.userId).toArray())
      .map((record) => normalizeCalculation(record.calculation)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async getActiveId(): Promise<string | undefined> {
    return this.userId === undefined ? (await this.database.settings.get('activeCalculationId'))?.value
      : (await this.database.ownedSettings.get(ownedKey(this.userId, 'activeCalculationId')))?.value;
  }
  async setActiveId(id: string): Promise<void> {
    if (!await this.get(id)) throw new Error('Расчёт не найден.');
    const table = this.userId === undefined ? this.database.settings : this.database.ownedSettings;
    await table.put({ key: this.userId === undefined ? 'activeCalculationId' : ownedKey(this.userId, 'activeCalculationId'), value: id });
  }
}
