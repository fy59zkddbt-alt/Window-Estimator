import type { Calculation } from '../../domain/calculation-vnext';
import type { CommercialRoundingStepRub } from '../../domain/configuration/vnext/types';
import type { Discount } from '../../domain/discount';
import { commercialRoundMinor, multiplyMinorByQuantity, sumMinor } from '../../domain/money';
import { copyAdditionalWorks, type AdditionalWork } from '../../domain/works/vnext';
import { estimateDiscount, invalidateDiscount, normalizeDiscount } from './discount';
import { estimateCalculationGlazingVNext, type GlazingEstimateVNext } from './estimate-glazing-vnext';
import { estimateCalculationFinishVNext, type FinishEstimateVNext } from './estimate-finish-vnext';

export type WorkLocation = { scope: 'order' } | { scope: 'measurement'; measurementId: string };
export interface AdditionalWorkLineVNext {
  kind: 'additionalWork';
  location: WorkLocation;
  /** Independent price/name/unit snapshot, including ID and optional catalog provenance. */
  work: AdditionalWork;
  priceBeforeCommercialRoundingMinor: number;
  clientPriceMinor: number;
}
export interface MeasurementClientLineVNext {
  kind: 'glazingProduct' | 'glazingInstallation' | 'finish';
  measurementId: string;
  clientPriceMinor: number;
}
export type UnresolvedMeasurementVNext = {
  measurementId: string;
  reason: string;
  code: 'priceRequiresClarification' | 'manualPriceNeedsConfirmation';
};
type MeasurementPricing =
  | { kind: 'Window' | 'Balcony'; result: GlazingEstimateVNext }
  | { kind: 'WindowFinish'; result: FinishEstimateVNext };
export type MeasurementTotalsVNext = MeasurementPricing & {
  measurementId: string;
  pricingStatus: 'priced' | 'unresolved';
  clientLines: readonly MeasurementClientLineVNext[];
  additionalWorkLines: readonly AdditionalWorkLineVNext[];
  additionalWorksTotalMinor: number;
  basePriceMinor: number | null;
  measurementTotalMinor: number | null;
};

function priceWorks(works: readonly AdditionalWork[], location: WorkLocation,
  step: CommercialRoundingStepRub): AdditionalWorkLineVNext[] {
  return copyAdditionalWorks(works).map((work) => {
    const priceBeforeCommercialRoundingMinor = multiplyMinorByQuantity(work.unitPriceMinor, work.quantity);
    return { kind: 'additionalWork', location: { ...location }, work, priceBeforeCommercialRoundingMinor,
      clientPriceMinor: commercialRoundMinor(priceBeforeCommercialRoundingMinor, step) };
  });
}

function discountTotals(value: Discount, subtotalMinor: number | null, step: CommercialRoundingStepRub) {
  if (!value || typeof value !== 'object') throw new Error('В Calculation v4 должна быть задана скидка.');
  if (subtotalMinor === null) {
    // Reuse existing validation against the stored confirmation basis only. This
    // is not a current subtotal and must never authorize an unresolved final price.
    const discount = invalidateDiscount(normalizeDiscount(value,
      value.mode === 'fixedFinalPrice' ? value.confirmedSubtotalMinor : 0));
    return { discount, discountMode: discount.mode, discountAmountMinor: null, finalTotalMinor: null,
      rawDiscountedTotalMinor: null, commercialRoundingAdjustmentMinor: null,
      fixedFinalPriceConfirmation: discount.mode === 'fixedFinalPrice' ? discount.confirmation : null,
      fixedFinalPriceMinor: discount.mode === 'fixedFinalPrice' ? discount.fixedFinalPriceMinor : null,
      canConfirmFixedPrice: false, isFinalized: false };
  }
  const result = estimateDiscount(value, subtotalMinor);
  const rawDiscountedTotalMinor = result.finalTotalMinor;
  const finalTotalMinor = result.discountMode === 'percent' && rawDiscountedTotalMinor !== null
    ? commercialRoundMinor(rawDiscountedTotalMinor, step) : rawDiscountedTotalMinor;
  return { ...result, rawDiscountedTotalMinor, finalTotalMinor,
    // Signed adjustment keeps percentage discount and commercial rounding distinct.
    commercialRoundingAdjustmentMinor: finalTotalMinor === null || rawDiscountedTotalMinor === null
      ? null : finalTotalMinor - rawDiscountedTotalMinor };
}

/** Canonical Calculation v4 aggregation. No I/O, global settings or production v3 transition. */
export function estimateCalculationVNext(calculation: Calculation) {
  if (calculation.schemaVersion !== 4 || !calculation.id.trim()) throw new Error('Некорректный расчёт.');
  const created = Date.parse(calculation.createdAt); const updated = Date.parse(calculation.updatedAt);
  if (!Number.isFinite(created) || !Number.isFinite(updated) || updated < created) throw new Error('Некорректные даты расчёта.');
  const step = calculation.commercialRoundingStepRub;
  if (step !== 10 && step !== 50 && step !== 100) throw new Error('Неизвестный шаг округления.');
  const ids = calculation.measurements.map((measurement) => measurement.id);
  if (ids.some((id) => !id.trim()) || new Set(ids).size !== ids.length) throw new Error('ID замеров должны быть непустыми и уникальными.');
  if (Object.keys(calculation.configuration).length !== ids.length
    || ids.some((id) => !Object.hasOwn(calculation.configuration, id))) throw new Error('Набор тарифов не соответствует замерам.');

  const unresolvedMeasurements: UnresolvedMeasurementVNext[] = [];
  const measurements: MeasurementTotalsVNext[] = calculation.measurements.map((measurement) => {
    let pricing: MeasurementPricing;
    let basePriceMinor: number | null;
    const clientLines: MeasurementClientLineVNext[] = [];
    const measurementId = measurement.id;
    switch (measurement.kind) {
      case 'Window':
      case 'Balcony': {
        const result = estimateCalculationGlazingVNext(calculation, measurementId);
        pricing = { kind: measurement.kind, result };
        basePriceMinor = result.price.totalMinor;
        clientLines.push({ kind: 'glazingProduct', measurementId, clientPriceMinor: result.price.productPriceMinor },
          { kind: 'glazingInstallation', measurementId, clientPriceMinor: result.price.installationPriceMinor });
        break;
      }
      case 'WindowFinish': {
        const result = estimateCalculationFinishVNext(calculation, measurementId);
        pricing = { kind: 'WindowFinish', result };
        basePriceMinor = result.price.clientFinishPriceMinor;
        if (basePriceMinor !== null) clientLines.push({ kind: 'finish', measurementId, clientPriceMinor: basePriceMinor });
        else {
          const state = result.price.priceState;
          unresolvedMeasurements.push(state.mode === 'priceRequiresClarification'
            ? { measurementId, code: 'priceRequiresClarification', reason: state.reason }
            : { measurementId, code: 'manualPriceNeedsConfirmation', reason: 'Ручная цена отделки требует подтверждения.' });
        }
        break;
      }
      default: throw new Error('Неподдерживаемый вид замера.');
    }
    const additionalWorkLines = priceWorks(measurement.additionalWorks, { scope: 'measurement', measurementId }, step);
    const additionalWorksTotalMinor = sumMinor(additionalWorkLines.map((line) => line.clientPriceMinor));
    return { ...pricing, measurementId, pricingStatus: basePriceMinor === null ? 'unresolved' : 'priced',
      clientLines, additionalWorkLines, basePriceMinor, additionalWorksTotalMinor,
      measurementTotalMinor: basePriceMinor === null ? null : sumMinor([basePriceMinor, additionalWorksTotalMinor]) };
  });
  const orderAdditionalWorkLines = priceWorks(calculation.orderAdditionalWorks, { scope: 'order' }, step);
  const orderWorksTotalMinor = sumMinor(orderAdditionalWorkLines.map((line) => line.clientPriceMinor));
  // Known lines remain inspectable even when a finish price is unavailable. Never
  // expose their partial sum as a trustworthy Calculation subtotal.
  const knownMeasurementSum = sumMinor(measurements.flatMap((measurement) => [
    ...measurement.clientLines.map((line) => line.clientPriceMinor), measurement.additionalWorksTotalMinor,
  ]));
  const knownSum = sumMinor([knownMeasurementSum, orderWorksTotalMinor]);
  const pricingStatus = unresolvedMeasurements.length ? 'unresolved' as const : 'priced' as const;
  const measurementsSubtotalMinor = pricingStatus === 'priced' ? knownMeasurementSum : null;
  const subtotalMinor = pricingStatus === 'priced' ? knownSum : null;
  return { calculationId: calculation.id, commercialRoundingStepRub: step, pricingStatus, measurements,
    orderAdditionalWorkLines, orderWorksTotalMinor, measurementsSubtotalMinor, subtotalMinor, unresolvedMeasurements,
    ...discountTotals(calculation.discount, subtotalMinor, step) };
}
export type CalculationTotalsVNext = ReturnType<typeof estimateCalculationVNext>;
