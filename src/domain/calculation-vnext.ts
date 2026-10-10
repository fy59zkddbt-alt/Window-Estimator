import type { Discount } from './discount';
import type { Measurement } from './measurements/vnext';
import type { AdditionalWork } from './works/vnext';
import type { CalculatorSettings, CommercialRoundingStepRub, FinishConfiguration, GlazingConfiguration } from './configuration/vnext/types';
import { copyDomainValue } from './configuration/vnext/copy';
import { validateFinishConfiguration, validateGlazingConfiguration } from './configuration/vnext/validate';

export type MeasurementConfiguration =
  | { kind: 'Window' | 'Balcony'; configuration: GlazingConfiguration }
  | { kind: 'WindowFinish'; configuration: FinishConfiguration };
/** Active calculator container. Pricing always uses owned configuration snapshots. */
export interface Calculation {
  schemaVersion: 4;
  id: string;
  name?: string;
  createdAt: string;
  updatedAt: string;
  clientName?: string;
  clientPhone?: string;
  objectAddress?: string;
  measurements: readonly Measurement[];
  orderAdditionalWorks: readonly AdditionalWork[];
  discount: Discount;
  commercialRoundingStepRub: CommercialRoundingStepRub;
  configuration: Readonly<Record<string, MeasurementConfiguration>>;
  /** Creation-time defaults/catalog for adding measurements; optional for pre-transition v4 fixtures. */
  settingsSnapshot?: CalculatorSettings;
}
/** Hidden identities remain valid here; defaults/new-selection policy is intentionally absent. */
export function copyMeasurementConfiguration(value: MeasurementConfiguration): MeasurementConfiguration {
  if (value.kind === 'WindowFinish') validateFinishConfiguration(value.configuration);
  else if (value.kind === 'Window' || value.kind === 'Balcony') validateGlazingConfiguration(value.configuration);
  else throw new Error('Неизвестный вид снимка.');
  return copyDomainValue(value);
}
/** Ownership helper only: no estimates, migrations, totals or commercial rounding. */
export function copyCalculation(value: Calculation): Calculation {
  return copyDomainValue(value);
}
