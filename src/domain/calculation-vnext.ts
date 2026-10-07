import type { Discount } from './discount';
import type { Measurement } from './measurements/vnext';
import type { AdditionalWork } from './works/vnext';
import type { CommercialRoundingStepRub, FinishConfiguration, GlazingConfiguration } from './configuration/vnext/types';
import { copyDomainValue } from './configuration/vnext/copy';
import { validateFinishConfiguration, validateGlazingConfiguration } from './configuration/vnext/validate';

export type MeasurementConfiguration =
  | { kind: 'Window' | 'Balcony'; configuration: GlazingConfiguration }
  | { kind: 'WindowFinish'; configuration: FinishConfiguration };
/** Future local container. Production repository remains on Calculation v3 until controlled transition. */
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
