import type { CalculatorSettingsRepository } from '../../application/settings/calculator-settings';
import { copyCalculatorSettings, createDefaultCalculatorSettings, type CalculatorSettings } from '../../domain/configuration/calculator-settings';
import type { EstimatorDatabase } from './database';
import { ownedKey } from './local-ownership';

const key = 'calculatorSettings';

/** User-scoped cache; anonymous access is reserved for legacy compatibility. */
export class DexieCalculatorSettingsRepository implements CalculatorSettingsRepository {
  constructor(private readonly database: EstimatorDatabase, private readonly userId?: string) {
    if (userId !== undefined) ownedKey(userId, '');
  }
  private get table() { return this.userId === undefined ? this.database.settings : this.database.ownedSettings; }
  private get storageKey() { return this.userId === undefined ? key : ownedKey(this.userId, key); }
  async load(): Promise<CalculatorSettings> {
    const record = await this.table.get(this.storageKey);
    if (!record) return createDefaultCalculatorSettings();
    try { return copyCalculatorSettings(JSON.parse(record.value) as CalculatorSettings); }
    catch { throw new Error('Сохранённые настройки калькулятора повреждены. Исходная запись не изменена.'); }
  }
  async save(settings: CalculatorSettings): Promise<void> {
    const copy = copyCalculatorSettings(settings);
    await this.table.put({ key: this.storageKey, value: JSON.stringify(copy) });
  }
}
