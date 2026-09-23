import type { Calculation } from '../../domain/calculation';
import type { UserConfiguration } from '../../domain/configuration/types';
import { getWindowGeometry } from '../../domain/geometry/window-geometry';
import { createWindow, type WindowInput } from '../../domain/measurements/window/create-window';
import { priceGlazing } from '../../domain/pricing/glazing-pricing';

export function estimateWindow(input: WindowInput, configuration: UserConfiguration): Calculation {
  const measurement = createWindow(input);
  const profiles = configuration.profiles.filter((item) => item.id === measurement.profileId);
  const profile = profiles[0];
  if (profiles.length !== 1 || !profile || profile.material !== measurement.material) throw new Error('Профиль не найден или не соответствует материалу.');
  for (const section of measurement.plane.sections) {
    if (section.openingType === 'fixed') continue;
    const hardware = configuration.hardware.filter((item) => item.id === section.hardwareId);
    if (hardware.length !== 1 || hardware[0]?.material !== measurement.material) throw new Error('Фурнитура не соответствует материалу.');
  }
  const geometry = getWindowGeometry(measurement);
  const price = priceGlazing(geometry, profile, measurement.lamination);
  return { id: input.id, schemaVersion: 2, measurement, geometry, price,
    configuration: { currency: configuration.currency, profiles: configuration.profiles.map((item) => ({ ...item })), hardware: configuration.hardware.map((item) => ({ ...item })) } };
}
