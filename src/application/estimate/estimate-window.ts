import type { WindowEstimate } from '../../domain/measurement-estimate';
import type { UserConfiguration } from '../../domain/configuration/types';
import { getWindowGeometry } from '../../domain/geometry/window-geometry';
import { createWindow, getWindowOpeningElements, type WindowInput } from '../../domain/measurements/window/create-window';
import { priceInstalledGlazing } from '../../domain/pricing/glazing-pricing';
import { measurementTotals } from './additional-works';

export function estimateWindow(input: WindowInput, configuration: UserConfiguration): WindowEstimate {
  const measurement = createWindow(input);
  const profiles = configuration.profiles.filter((item) => item.id === measurement.profileId);
  const profile = profiles[0];
  if (profiles.length !== 1 || !profile || profile.material !== measurement.material) throw new Error('Профиль не найден или не соответствует материалу.');
  for (const section of getWindowOpeningElements(measurement)) {
    if (section.openingType === 'fixed') continue;
    const hardware = configuration.hardware.filter((item) => item.id === section.hardwareId);
    if (hardware.length !== 1 || hardware[0]?.material !== measurement.material) throw new Error('Фурнитура не соответствует материалу.');
  }
  const geometry = getWindowGeometry(measurement);
  const price = priceInstalledGlazing(geometry, profile, measurement.lamination);
  return { id: input.id, schemaVersion: 2, measurement, geometry, price, ...measurementTotals(price.totalMinor, measurement.additionalWorks),
    configuration: { currency: configuration.currency, profiles: configuration.profiles.map((item) => ({ ...item })), hardware: configuration.hardware.map((item) => ({ ...item })) } };
}
