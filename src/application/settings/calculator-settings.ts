import { copyCalculatorSettings, type CalculatorSettings } from '../../domain/configuration/calculator-settings';

export { createDefaultCalculatorSettings, validateCalculatorSettings } from '../../domain/configuration/calculator-settings';
export type { CalculatorSettings } from '../../domain/configuration/calculator-settings';

export interface CalculatorSettingsRepository {
  reload?(): Promise<CalculatorSettings>;
  readonly notice?: string;
  load(): Promise<CalculatorSettings>;
  save(settings: CalculatorSettings): Promise<void>;
}

/** Capture current rates when opening a new editor; existing editors use their saved snapshot. */
export function createSettingsSnapshot(settings: CalculatorSettings) {
  const copy = copyCalculatorSettings(settings);
  return { glazing: copy.glazing, finish: copy.finish };
}
