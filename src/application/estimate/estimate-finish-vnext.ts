import type { Calculation } from '../../domain/calculation-vnext';
import { copyDomainValue } from '../../domain/configuration/vnext/copy';
import type { CommercialRoundingStepRub, FinishConfiguration } from '../../domain/configuration/vnext/types';
import { validateFinishConfiguration } from '../../domain/configuration/vnext/validate';
import { getFinishGeometryVNext, type FinishGeometryVNext } from '../../domain/geometry/finish-geometry-vnext';
import { validateFinishMeasurement, type WindowFinishMeasurement } from '../../domain/measurements/vnext';
import { priceFinishVNext, type FinishPriceVNext } from '../../domain/pricing/finish-pricing-vnext';

export interface FinishEstimateVNext {
  id: string;
  measurement: WindowFinishMeasurement;
  configuration: FinishConfiguration;
  commercialRoundingStepRub: CommercialRoundingStepRub;
  geometry: FinishGeometryVNext;
  price: FinishPriceVNext;
}

/** Standalone vNext entry point; no production totals or repository transition. */
export function estimateFinishVNext(input: WindowFinishMeasurement, configuration: FinishConfiguration,
  stepRub: CommercialRoundingStepRub): FinishEstimateVNext {
  const measurement = copyDomainValue(input);
  const snapshot = copyDomainValue(configuration);
  validateFinishMeasurement(measurement); validateFinishConfiguration(snapshot);
  for (const selection of measurement.selections) {
    if (!snapshot.materials.some((material) => material.id === selection.materialId && material.side === measurement.side
      && material.element === selection.element)) throw new Error('Материал не соответствует виду отделки.');
  }
  const geometry = getFinishGeometryVNext(measurement, snapshot.allowances);
  const price = priceFinishVNext(geometry, measurement, measurement.priceState, snapshot, stepRub);
  measurement.priceState = copyDomainValue(price.priceState);
  return { id: measurement.id, measurement, configuration: snapshot, commercialRoundingStepRub: stepRub, geometry, price };
}

export function estimateCalculationFinishVNext(calculation: Calculation, measurementId: string): FinishEstimateVNext {
  if (calculation.schemaVersion !== 4) throw new Error('Неизвестная версия расчёта.');
  const matches = calculation.measurements.filter((measurement) => measurement.id === measurementId);
  const measurement = matches[0];
  const snapshot = calculation.configuration[measurementId];
  if (matches.length !== 1 || !measurement || measurement.kind !== 'WindowFinish' || snapshot?.kind !== 'WindowFinish') throw new Error('Замер или снимок отделки не найден.');
  return estimateFinishVNext(measurement, snapshot.configuration, calculation.commercialRoundingStepRub);
}

/** Future editor boundary: material changes invalidate an existing manual override, metadata changes do not. */
export function reviseFinishMeasurementVNext(previous: WindowFinishMeasurement, input: WindowFinishMeasurement): WindowFinishMeasurement {
  const next = copyDomainValue(input);
  const composition = (value: WindowFinishMeasurement) => JSON.stringify({ width: value.widthMm, height: value.heightMm,
    depth: value.depthMm, side: value.side, work: value.workType,
    selections: [...value.selections].sort((a, b) => a.element.localeCompare(b.element)), additionalWorks: value.additionalWorks });
  if (previous.priceState.mode === 'manual' && next.priceState.mode === 'manual' && composition(previous) !== composition(next)) {
    next.priceState.confirmation = 'needsConfirmation';
  }
  validateFinishMeasurement(next);
  return next;
}
