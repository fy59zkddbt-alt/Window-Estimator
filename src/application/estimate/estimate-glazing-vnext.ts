import type { Calculation } from '../../domain/calculation-vnext';
import { copyDomainValue } from '../../domain/configuration/vnext/copy';
import type { CommercialRoundingStepRub, GlazingConfiguration } from '../../domain/configuration/vnext/types';
import { getWindowGeometryVNext } from '../../domain/geometry/window-geometry';
import { getBalconyGeometryVNext, type BalconyGeometry } from '../../domain/geometry/balcony-geometry';
import type { WindowGeometry } from '../../domain/geometry/types';
import type { WindowMeasurement, BalconyMeasurement } from '../../domain/measurements/vnext';
import { priceInstalledGlazingVNext, type ActiveGlazingArea, type GlazingPriceVNext } from '../../domain/pricing/glazing-pricing-vnext';

type GlazingMeasurement = WindowMeasurement | BalconyMeasurement;
export type GlazingEstimateVNext = {
  id: string;
  configuration: GlazingConfiguration;
  commercialRoundingStepRub: CommercialRoundingStepRub;
  price: GlazingPriceVNext;
} & (
  | { measurement: WindowMeasurement; geometry: WindowGeometry }
  | { measurement: BalconyMeasurement; geometry: BalconyGeometry }
);

/** Canonical vNext glazing entry point, also used by production Calculation totals. */
export function estimateGlazingVNext(input: GlazingMeasurement, configuration: GlazingConfiguration,
  stepRub: CommercialRoundingStepRub): GlazingEstimateVNext {
  const measurement = copyDomainValue(input);
  const snapshot = copyDomainValue(configuration);
  const activeAreas: ActiveGlazingArea[] = [];
  const add = (areaM2: number, hardwareId: string | undefined, mode?: 'sliding' | 'swing') => {
    if (measurement.material === 'pvc') {
      if (!hardwareId) throw new Error('Для активной створки нужна фурнитура.');
      activeAreas.push({ material: 'pvc', areaM2, hardwareId });
    } else {
      if (!mode) throw new Error('Укажите механизм плоскости.');
      activeAreas.push({ material: 'aluminium', areaM2, mode });
    }
  };
  if (measurement.kind === 'Window') {
    const geometry = getWindowGeometryVNext(measurement);
    // Stable model order prevents door placement from changing activity summation.
    const elements = measurement.windowType === 'balconyBlock' ? [...measurement.plane.sections, measurement.door] : measurement.plane.sections;
    for (const element of elements) {
      if (element.openingType === 'fixed') continue;
      const section = geometry.sections.find((section) => section.id === element.id)!;
      add(section.areaM2, element.hardwareId, measurement.material === 'aluminium' ? measurement.plane.mode : undefined);
    }
    return { id: measurement.id, measurement, geometry, configuration: snapshot, commercialRoundingStepRub: stepRub,
      price: priceInstalledGlazingVNext({ ...measurement, totalAreaM2: geometry.totalAreaM2, activeAreas }, snapshot, stepRub) };
  }
  const geometry = getBalconyGeometryVNext(measurement);
  measurement.planes.forEach((plane, index) => {
    for (const element of plane.sections) {
      if (element.openingType === 'fixed') continue;
      const section = geometry.planes[index]!.sections.find((section) => section.id === `upper:${element.id}`)!;
      add(section.areaM2, element.hardwareId, 'mode' in plane ? plane.mode : undefined);
    }
  });
  return { id: measurement.id, measurement, geometry, configuration: snapshot, commercialRoundingStepRub: stepRub,
    price: priceInstalledGlazingVNext({ ...measurement, totalAreaM2: geometry.totalAreaM2, activeAreas }, snapshot, stepRub) };
}

/** Price one glazing measurement exclusively from its Calculation v4 snapshot. No order totals. */
export function estimateCalculationGlazingVNext(calculation: Calculation, measurementId: string): GlazingEstimateVNext {
  if (calculation.schemaVersion !== 4) throw new Error('Неизвестная версия расчёта.');
  const matches = calculation.measurements.filter((measurement) => measurement.id === measurementId);
  const measurement = matches[0];
  const snapshot = calculation.configuration[measurementId];
  if (matches.length !== 1 || !measurement || measurement.kind === 'WindowFinish' || !snapshot || snapshot.kind !== measurement.kind) throw new Error('Замер или снимок остекления не найден.');
  return estimateGlazingVNext(measurement, snapshot.configuration, calculation.commercialRoundingStepRub);
}
