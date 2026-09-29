import { normalizeAdditionalWorks, type AdditionalWork } from '../../domain/works/types';
import type { MeasurementTotals } from '../../domain/measurement-estimate';

export function sumMinor(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Некорректная денежная сумма.');
    total += value;
    if (!Number.isSafeInteger(total)) throw new Error('Сумма вне безопасного числового диапазона.');
  }
  return total;
}
export function additionalWorksTotal(works: readonly AdditionalWork[] | undefined): number {
  return sumMinor(normalizeAdditionalWorks(works).map((work) => work.priceMinor));
}
export function measurementTotals(basePriceMinor: number, works: readonly AdditionalWork[]): MeasurementTotals {
  const additionalWorksTotalMinor = additionalWorksTotal(works);
  return { basePriceMinor, additionalWorksTotalMinor, measurementTotalMinor: sumMinor([basePriceMinor, additionalWorksTotalMinor]) };
}
