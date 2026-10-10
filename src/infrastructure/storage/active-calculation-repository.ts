import type { Table } from 'dexie';
import type { Calculation } from '../../domain/calculation-vnext';
import { normalizeCalculation, type ActiveCalculationRepository } from '../../application/estimate/active-calculation';
import type { EstimatorDatabase } from './database';
import { ownedKey } from './local-ownership';

interface RecordEnvelope { key: string; userId: string; calculation: Calculation }
const marker = 'calculatorFoundation:v4';
/** One-way calculator-only transition, scoped to the current owner, in one transaction.
 * Anonymous stores/backups, settings envelopes, ownership and cloud metadata are untouched.
 */
export async function transitionCalculatorData(database: EstimatorDatabase, userId: string): Promise<void> {
  const key = ownedKey(userId, marker);
  await database.transaction('rw', database.ownedCalculations, database.ownedSettings, async () => {
    const version = await database.ownedSettings.get(key);
    if (version?.value === '1') return;
    if (version) throw new Error('Неизвестная версия перехода калькулятора.');
    const records = await database.ownedCalculations.where('userId').equals(userId).toArray();
    const removed = new Set<string>();
    for (const record of records) {
      if (record.key !== ownedKey(userId, record.calculation.id)) throw new Error('Повреждён envelope владельца расчёта.');
      const schema = Number(record.calculation.schemaVersion);
      if (schema === 4) normalizeCalculation(record.calculation as unknown as Calculation);
      else if ([1, 2, 3].includes(schema)) { await database.ownedCalculations.delete(record.key); removed.add(record.calculation.id); }
      else throw new Error('Неизвестная версия сохранённого расчёта. Переход отменён.');
    }
    const activeKey = ownedKey(userId, 'activeCalculationId');
    const active = await database.ownedSettings.get(activeKey);
    if (active && removed.has(active.value)) await database.ownedSettings.delete(activeKey);
    await database.ownedSettings.put({ key, value: '1' });
  });
}
/** Production v4 repository. No legacy pricing fallback. */
export class ActiveDexieCalculationRepository implements ActiveCalculationRepository {
  private readonly table: Table<RecordEnvelope, string>;
  constructor(private readonly database: EstimatorDatabase, private readonly userId: string) {
    ownedKey(userId, '');
    this.table = database.ownedCalculations as unknown as Table<RecordEnvelope, string>;
  }
  private prepare() { return transitionCalculatorData(this.database, this.userId); }
  private read(record: RecordEnvelope) {
    if (record.userId !== this.userId || record.key !== ownedKey(this.userId, record.calculation.id)) throw new Error('Неверный envelope владельца расчёта.');
    return normalizeCalculation(record.calculation);
  }
  async save(value: Calculation) {
    const calculation = normalizeCalculation(value);
    await this.prepare();
    await this.database.transaction('rw', this.table, this.database.ownedSettings, async () => {
      await this.table.put({ key: ownedKey(this.userId, calculation.id), userId: this.userId, calculation });
      await this.database.ownedSettings.put({ key: ownedKey(this.userId, 'activeCalculationId'), value: calculation.id });
    });
  }
  async get(id: string) {
    await this.prepare();
    const record = await this.table.get(ownedKey(this.userId, id));
    return record ? this.read(record) : undefined;
  }
  async list() {
    await this.prepare();
    return (await this.table.where('userId').equals(this.userId).toArray()).map((record) => this.read(record))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async getActiveId() { await this.prepare(); return (await this.database.ownedSettings.get(ownedKey(this.userId, 'activeCalculationId')))?.value; }
  async setActiveId(id: string) {
    if (!await this.get(id)) throw new Error('Расчёт не найден.');
    await this.database.ownedSettings.put({ key: ownedKey(this.userId, 'activeCalculationId'), value: id });
  }
}
