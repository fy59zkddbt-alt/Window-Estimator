import type { Calculation, Measurement, MeasurementConfiguration } from '../../domain/calculation';
import type { MeasurementEstimate } from '../../domain/measurement-estimate';
import { configurationOf, estimateMeasurement } from './estimate-measurement';
import { normalizeAdditionalWorks, type AdditionalWork } from '../../domain/works/types';
import { additionalWorksTotal, sumMinor } from './additional-works';
import { estimateDiscount, invalidateDiscount, setDiscount } from './discount';
import type { DiscountInput } from '../../domain/discount';

function checkDate(value: string) { if (!Number.isFinite(Date.parse(value))) throw new Error('Некорректная дата расчёта.'); }
export function createCalculation(id: string, now: string): Calculation {
  if (!id.trim()) throw new Error('ID расчёта обязателен.');
  checkDate(now);
  return { id, schemaVersion: 3, createdAt: now, updatedAt: now, measurements: [], orderAdditionalWorks: [], configuration: {}, discount: { mode: 'none' } };
}
export function estimateCalculation(calculation: Calculation) {
  if (calculation.schemaVersion !== 3 || !calculation.id.trim()) throw new Error('Некорректный расчёт.');
  checkDate(calculation.createdAt); checkDate(calculation.updatedAt);
  if (Date.parse(calculation.updatedAt) < Date.parse(calculation.createdAt)) throw new Error('Дата изменения раньше создания.');
  const orderWorksTotalMinor = additionalWorksTotal(calculation.orderAdditionalWorks);
  if (new Set(calculation.measurements.map((m) => m.id)).size !== calculation.measurements.length) throw new Error('ID замеров должны быть уникальны.');
  if (Object.keys(calculation.configuration).length !== calculation.measurements.length) throw new Error('Набор тарифов не соответствует замерам.');
  const lines = calculation.measurements.map((measurement) => {
    if (!Object.hasOwn(calculation.configuration, measurement.id)) throw new Error('Нет снимка тарифов замера.');
    const result = estimateMeasurement(measurement, calculation.configuration[measurement.id]!);
    return { id: measurement.id, name: measurement.name, room: measurement.room, ...describeMeasurement(measurement), totalMinor: result.measurementTotalMinor, result };
  });
  const measurementsSubtotalMinor = sumMinor(lines.map((line) => line.totalMinor));
  const subtotalMinor = sumMinor([measurementsSubtotalMinor, orderWorksTotalMinor]);
  return { lines, measurementsSubtotalMinor, orderWorksTotalMinor, subtotalMinor, ...estimateDiscount(calculation.discount, subtotalMinor) };
}
function describeMeasurement(m: Measurement) {
  if (m.kind === 'Balcony') return { description: `Балкон ${m.balconyType}${m.side ? ` · ${m.side === 'left' ? 'левый' : 'правый'}` : ''} · ${m.material === 'pvc' ? 'ПВХ' : 'Алюминий'}`, dimensions: m.planes.map((p) => `${p.name}: ${p.widthMm} × ${p.heightMm} мм`).join('; ') };
  if (m.kind === 'WindowFinish') return { description: m.selections.map((s) => s.finishType === 'slope' ? 'Откосы' : 'Подоконник').join(' + '), dimensions: `${m.widthMm} × ${m.heightMm} × ${m.depthMm} мм` };
  const material = m.material === 'pvc' ? 'ПВХ' : 'Алюминий';
  if (m.windowType === 'balconyBlock') return { description: `Балконный блок · ${material}`, dimensions: `Дверь ${m.doorWidthMm} × ${m.doorHeightMm} мм; окна ${m.plane.sections.map((s) => `${s.widthMm} × ${m.windowHeightMm}`).join(', ')} мм` };
  const names = { single: 'Одностворчатое окно', double: 'Двустворчатое окно', triple: 'Трёхстворчатое окно' };
  return { description: `${names[m.windowType]} · ${material}`, dimensions: `${m.widthMm} × ${m.heightMm} мм` };
}
export function normalizeCalculation(value: Calculation): Calculation {
  const estimate = estimateCalculation(value);
  const configuration: Record<string, MeasurementConfiguration> = {};
  for (const line of estimate.lines) Object.defineProperty(configuration, line.id, { value: configurationOf(line.result), enumerable: true, writable: true, configurable: true });
  return { ...value, discount: estimate.discount, measurements: estimate.lines.map((line) => line.result.measurement), orderAdditionalWorks: normalizeAdditionalWorks(value.orderAdditionalWorks), configuration };
}
function updated(value: Calculation, now: string): Calculation { return normalizeCalculation({ ...value, updatedAt: now }); }
export function saveMeasurement(value: Calculation, result: MeasurementEstimate, now: string, mode: 'add' | 'edit'): Calculation {
  const exists = value.measurements.some((m) => m.id === result.measurement.id);
  if (exists !== (mode === 'edit')) throw new Error('Замер уже существует или отсутствует для редактирования.');
  return updated({ ...value, discount: invalidateDiscount(value.discount),
    measurements: exists ? value.measurements.map((m) => m.id === result.measurement.id ? result.measurement : m) : [...value.measurements, result.measurement],
    configuration: { ...value.configuration, [result.measurement.id]: configurationOf(result) },
  }, now);
}
export function copyMeasurement(value: Calculation, id: string, newId: string, now: string): Calculation {
  if (!newId.trim() || value.measurements.some((m) => m.id === newId)) throw new Error('Копии нужен новый уникальный ID.');
  const original = value.measurements.find((m) => m.id === id);
  if (!original) throw new Error('Замер не найден.');
  const existingIds = new Set(value.measurements.flatMap((m) => (m.additionalWorks ?? []).map((work) => work.id)));
  const additionalWorks = normalizeAdditionalWorks(original.additionalWorks).map((work, index) => {
    let workId = `${newId}:work:${index + 1}`;
    while (existingIds.has(workId)) workId += '-copy';
    existingIds.add(workId);
    return { ...work, id: workId };
  });
  return saveMeasurement(value, estimateMeasurement({ ...original, id: newId, additionalWorks }, value.configuration[id]!), now, 'add');
}
export function deleteMeasurement(value: Calculation, id: string, now: string): Calculation {
  if (!value.measurements.some((m) => m.id === id)) throw new Error('Замер не найден.');
  const configuration = { ...value.configuration }; delete configuration[id];
  return updated({ ...value, discount: invalidateDiscount(value.discount), measurements: value.measurements.filter((m) => m.id !== id), configuration }, now);
}
export function updateCalculationDetails(value: Calculation, details: Pick<Calculation, 'clientName' | 'clientPhone' | 'objectAddress'>, now: string): Calculation {
  return updated({ ...value, ...details }, now);
}
export function updateOrderAdditionalWorks(value: Calculation, works: readonly AdditionalWork[], now: string): Calculation {
  return updated({ ...value, discount: invalidateDiscount(value.discount), orderAdditionalWorks: normalizeAdditionalWorks(works) }, now);
}

export function updateCalculationDiscount(value: Calculation, input: DiscountInput, now: string): Calculation {
  const subtotal = estimateCalculation(value).subtotalMinor;
  return updated({ ...value, discount: setDiscount(input, subtotal) }, now);
}
export function confirmFixedFinalPrice(value: Calculation, now: string): Calculation {
  const estimate = estimateCalculation(value);
  if (estimate.discount.mode !== 'fixedFinalPrice') throw new Error('Фиксированная цена не установлена.');
  return updateCalculationDiscount(value, { mode: 'fixedFinalPrice', fixedFinalPriceMinor: estimate.discount.fixedFinalPriceMinor }, now);
}
export function resetCalculationDiscount(value: Calculation, now: string): Calculation {
  return updateCalculationDiscount(value, { mode: 'none' }, now);
}
