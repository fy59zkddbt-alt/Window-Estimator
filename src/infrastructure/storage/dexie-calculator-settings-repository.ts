import type { CalculatorSettingsRepository } from '../../application/settings/calculator-settings';
import { copyCalculatorSettings, createDefaultCalculatorSettings, type CalculatorSettings } from '../../domain/configuration/calculator-settings';
import type { EstimatorDatabase } from './database';

const key = 'calculatorSettings';

/** Reuses the v3 key/value store without changing calculation records or migrations. */
export class DexieCalculatorSettingsRepository implements CalculatorSettingsRepository {
  constructor(private readonly database: EstimatorDatabase) {}
  async load(): Promise<CalculatorSettings> {
    const record = await this.database.settings.get(key);
    if (!record) return createDefaultCalculatorSettings();
    try { return copyCalculatorSettings(JSON.parse(record.value) as CalculatorSettings); }
    catch { throw new Error('Сохранённые настройки калькулятора повреждены. Исходная запись не изменена.'); }
  }
  async save(settings: CalculatorSettings): Promise<void> {
    const copy = copyCalculatorSettings(settings);
    await this.database.settings.put({ key, value: JSON.stringify(copy) });
  }
}
