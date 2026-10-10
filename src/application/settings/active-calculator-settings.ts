import type { CalculatorSettingsRepository as EnvelopeRepository, CalculatorSettings as Envelope } from './calculator-settings';
import { copyCalculatorSettings as copyEnvelope, createDefaultCalculatorSettings } from '../../domain/configuration/calculator-settings';
import { openSettingsV2, stageSettingsV2 } from './settings-v2';
import type { CalculatorSettings } from '../../domain/configuration/vnext/types';

/** The existing cloud payload is retained only as a compatibility envelope. */
export function activateCalculatorSettings(value: Envelope): Envelope {
  // Validate v2 first. A corrupt explicitly configured v2 must never be discarded.
  const active = openSettingsV2(value);
  try { return stageSettingsV2(copyEnvelope(value), active); }
  catch {
    // Retired v1 tariffs cannot prevent a valid v2 catalog from becoming active.
    // Only calculator-specific compatibility fields are replaced; no other records.
    if (!value.settingsV2) throw new Error('Повреждён envelope настроек калькулятора.');
    return stageSettingsV2(createDefaultCalculatorSettings(), active);
  }
}
export interface ActiveSettingsRepository {
  load(): Promise<CalculatorSettings>;
  reload?(): Promise<CalculatorSettings>;
  save(value: CalculatorSettings): Promise<void>;
  readonly notice?: string;
}
/** Uses the same owner/revision-aware save path; never writes around CloudSettingsSync. */
export class ActiveCalculatorSettingsRepository implements ActiveSettingsRepository {
  private envelope: Envelope | undefined;
  constructor(private readonly repository: EnvelopeRepository) {}
  get notice() { return this.repository.notice ?? ''; }
  async load() { this.envelope = await this.repository.load(); return openSettingsV2(this.envelope); }
  async reload() { this.envelope = await (this.repository.reload?.() ?? this.repository.load()); return openSettingsV2(this.envelope); }
  async save(value: CalculatorSettings) {
    if (!this.envelope) throw new Error('Сначала загрузите настройки.');
    const next = stageSettingsV2(this.envelope, value);
    await this.repository.save(next);
    this.envelope = next;
  }
}
