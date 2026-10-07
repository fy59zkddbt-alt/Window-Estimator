import { normalizeAdditionalWorks, type AdditionalWork } from '../../domain/works/types';
import type { MeasurementTotals } from '../../domain/measurement-estimate';
import { sumMinor } from '../../domain/money';

export { sumMinor } from '../../domain/money';
export function additionalWorksTotal(works: readonly AdditionalWork[] | undefined): number {
  return sumMinor(normalizeAdditionalWorks(works).map((work) => work.priceMinor));
}
export function measurementTotals(basePriceMinor: number, works: readonly AdditionalWork[]): MeasurementTotals {
  const additionalWorksTotalMinor = additionalWorksTotal(works);
  return { basePriceMinor, additionalWorksTotalMinor, measurementTotalMinor: sumMinor([basePriceMinor, additionalWorksTotalMinor]) };
}
