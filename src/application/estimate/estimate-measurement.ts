import type { Measurement, MeasurementConfiguration } from '../../domain/calculation';
import type { MeasurementEstimate } from '../../domain/measurement-estimate';
import { estimateWindow } from './estimate-window';
import { estimateFinish } from './estimate-finish';
import { toWindowInput } from '../../domain/measurements/window/create-window';
import { isWindowEstimate, isBalconyEstimate } from './calculation-repository';
import { estimateBalcony } from './estimate-balcony';

export function estimateMeasurement(measurement: Measurement, snapshot: MeasurementConfiguration): MeasurementEstimate {
  if (measurement.kind === 'Balcony' && snapshot.kind === 'Balcony') return estimateBalcony(measurement, snapshot.configuration);
  if (measurement.kind === 'Window' && snapshot.kind === 'Window') return estimateWindow(toWindowInput(measurement), snapshot.configuration);
  if (measurement.kind === 'WindowFinish' && snapshot.kind === 'WindowFinish') return estimateFinish(measurement, snapshot.configuration);
  throw new Error('Тип замера не соответствует снимку тарифов.');
}
export function configurationOf(result: MeasurementEstimate): MeasurementConfiguration {
  if (isBalconyEstimate(result)) return { kind: 'Balcony', configuration: result.configuration };
  if (isWindowEstimate(result)) return { kind: 'Window', configuration: result.configuration };
  return { kind: 'WindowFinish', configuration: result.configuration };
}
