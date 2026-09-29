import { createBalcony, type BalconyInput } from '../../domain/measurements/balcony/create-balcony';
import type { UserConfiguration } from '../../domain/configuration/types';
import type { BalconyEstimate } from '../../domain/measurement-estimate';
import { getBalconyGeometry } from '../../domain/geometry/balcony-geometry';
import { priceGlazing } from '../../domain/pricing/glazing-pricing';
import { measurementTotals } from './additional-works';
export type { BalconyInput } from '../../domain/measurements/balcony/create-balcony';

export function estimateBalcony(input: BalconyInput, configuration: UserConfiguration): BalconyEstimate {
  const measurement = createBalcony(input);
  if (configuration.currency !== 'RUB') throw new Error('Поддерживается только RUB.');
  const profile = configuration.profiles.find((p) => p.id === measurement.profileId);
  if (!profile || profile.material !== measurement.material) throw new Error('Выберите совместимый профиль/систему.');
  for (const plane of measurement.planes) for (const section of plane.sections) {
    if (section.openingType === 'turn' || section.openingType === 'tilt_turn') {
      const hardware = configuration.hardware.find((h) => h.id === section.hardwareId);
      if (!hardware || hardware.material !== measurement.material) throw new Error('Выберите совместимую фурнитуру.');
    }
  }
  const geometry = getBalconyGeometry(measurement);
  const price = priceGlazing(geometry, profile, measurement.lamination);
  return { id: measurement.id, schemaVersion: 2, measurement, geometry, price, ...measurementTotals(price.totalMinor, measurement.additionalWorks),
    configuration: { currency: configuration.currency, profiles: configuration.profiles.map((p) => ({ ...p })), hardware: configuration.hardware.map((h) => ({ ...h })) } };
}
