import type { Calculation, MeasurementConfiguration } from '../../domain/calculation-vnext';
import type { Measurement } from '../../domain/measurements/vnext';
import type { CalculatorSettings, CommercialRoundingStepRub } from '../../domain/configuration/vnext/types';
import { copyCalculatorSettings } from '../../domain/configuration/vnext/settings';
import { copyDomainValue } from '../../domain/configuration/vnext/copy';
import { copyAdditionalWorks, type AdditionalWork } from '../../domain/works/vnext';
import type { DiscountInput } from '../../domain/discount';
import { invalidateDiscount, setDiscount } from './discount';
import { estimateCalculationVNext } from './estimate-calculation-vnext';
export { estimateCalculationVNext as estimateCalculation } from './estimate-calculation-vnext';

/** Preview existing editor input through the same canonical aggregation as saved calculations. */
export function estimateDraft(measurement: Measurement, snapshot: MeasurementConfiguration, step: CommercialRoundingStepRub) {
  return estimateCalculationVNext({ schemaVersion: 4, id: 'draft', createdAt: '2026-01-01', updatedAt: '2026-01-01',
    measurements: [measurement], configuration: { [measurement.id]: snapshot }, orderAdditionalWorks: [], discount: { mode: 'none' }, commercialRoundingStepRub: step }).measurements[0]!;
}

export interface ActiveCalculationRepository {
  save(value: Calculation): Promise<void>;
  get(id: string): Promise<Calculation | undefined>;
  list(): Promise<Calculation[]>;
  getActiveId(): Promise<string | undefined>;
  setActiveId(id: string): Promise<void>;
}
export function normalizeCalculation(value: Calculation): Calculation {
  const copy = copyDomainValue(value);
  if (copy.settingsSnapshot) copy.settingsSnapshot = copyCalculatorSettings(copy.settingsSnapshot);
  const totals = estimateCalculationVNext(copy);
  return { ...copy, discount: totals.discount };
}
export function createCalculation(id: string, now: string, settings: CalculatorSettings): Calculation {
  const snapshot = copyCalculatorSettings(settings);
  return normalizeCalculation({ id, schemaVersion: 4, createdAt: now, updatedAt: now,
    measurements: [], configuration: {}, orderAdditionalWorks: [], discount: { mode: 'none' },
    commercialRoundingStepRub: snapshot.commercialRoundingStepRub, settingsSnapshot: snapshot });
}
export function measurementSnapshot(value: Calculation, kind: Measurement['kind']): MeasurementConfiguration {
  if (!value.settingsSnapshot) throw new Error('Нет снимка настроек создания расчёта.');
  return copyDomainValue(kind === 'WindowFinish'
    ? { kind, configuration: value.settingsSnapshot.finish }
    : { kind, configuration: value.settingsSnapshot.glazing });
}
function updated(value: Calculation, now: string) { return normalizeCalculation({ ...value, updatedAt: now }); }
export function saveMeasurement(value: Calculation, measurement: Measurement, snapshot: MeasurementConfiguration, now: string, mode: 'add' | 'edit') {
  const exists = value.measurements.some((item) => item.id === measurement.id);
  if (exists !== (mode === 'edit') || snapshot.kind !== measurement.kind) throw new Error('Неверный замер или снимок.');
  return updated({ ...value, discount: invalidateDiscount(value.discount),
    measurements: exists ? value.measurements.map((item) => item.id === measurement.id ? measurement : item) : [...value.measurements, measurement],
    configuration: { ...value.configuration, [measurement.id]: snapshot } }, now);
}
export function copyMeasurement(value: Calculation, id: string, newId: string, now: string) {
  const original = value.measurements.find((item) => item.id === id);
  if (!original || !newId.trim() || value.measurements.some((item) => item.id === newId)) throw new Error('Неверный ID копии.');
  const measurement = copyDomainValue(original);
  measurement.id = newId;
  if (measurement.kind === 'Window') measurement.plane.id = `${newId}:plane`;
  const ids = new Set([...value.measurements.flatMap((item) => item.additionalWorks.map((work) => work.id)), ...value.orderAdditionalWorks.map((work) => work.id)]);
  measurement.additionalWorks = measurement.additionalWorks.map((work, index) => {
    let id = `${newId}:work:${index + 1}`;
    while (ids.has(id)) id += '-copy';
    ids.add(id); return { ...work, id };
  });
  return saveMeasurement(value, measurement, value.configuration[id]!, now, 'add');
}
export function deleteMeasurement(value: Calculation, id: string, now: string) {
  if (!value.measurements.some((item) => item.id === id)) throw new Error('Замер не найден.');
  const configuration = { ...value.configuration }; delete configuration[id];
  return updated({ ...value, configuration, measurements: value.measurements.filter((item) => item.id !== id), discount: invalidateDiscount(value.discount) }, now);
}
export function updateCalculationDetails(value: Calculation, details: Pick<Calculation, 'clientName' | 'clientPhone' | 'objectAddress'>, now: string) {
  return updated({ ...value, ...details }, now);
}
export function updateOrderAdditionalWorks(value: Calculation, works: readonly AdditionalWork[], now: string) {
  return updated({ ...value, orderAdditionalWorks: copyAdditionalWorks(works), discount: invalidateDiscount(value.discount) }, now);
}
export function updateCalculationDiscount(value: Calculation, input: DiscountInput, now: string) {
  const subtotal = estimateCalculationVNext(value).subtotalMinor;
  if (subtotal === null && input.mode !== 'none') throw new Error('Сначала уточните цены замеров.');
  return updated({ ...value, discount: setDiscount(input, subtotal ?? 0) }, now);
}
export function confirmFixedFinalPrice(value: Calculation, now: string) {
  if (value.discount.mode !== 'fixedFinalPrice') throw new Error('Фиксированная цена не установлена.');
  return updateCalculationDiscount(value, { mode: 'fixedFinalPrice', fixedFinalPriceMinor: value.discount.fixedFinalPriceMinor }, now);
}
export function resetCalculationDiscount(value: Calculation, now: string) { return updateCalculationDiscount(value, { mode: 'none' }, now); }
