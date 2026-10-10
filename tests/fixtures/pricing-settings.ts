import { createStarterCalculatorSettings } from '../../src/domain/configuration/vnext/settings';

/** Stable numerical fixture for Features 3–5; independent of starter UX prices. */
export function createPricingTestSettings() {
  const value = createStarterCalculatorSettings();
  value.glazing.installationRatesPerM2 = { pvc: 1000, aluminium: 800 };
  const pvc = value.glazing.profiles[0]!;
  if (pvc.material !== 'pvc') throw new Error('Fixture');
  Object.assign(pvc, { basePricePerM2: 10000, extensionPercent: 5, connectorPercent: 5, productMarkupPercent: 20,
    hardwareActivity: [{ hardwareId: 'standard', activityPercent: 20 }, { hardwareId: 'premium', activityPercent: 30 }],
    colorRules: [{ colorId: 'white', colorPercent: 0 }, { colorId: 'laminated', colorPercent: 20 }] });
  Object.assign(value.glazing.profiles[1]!, { basePricePerM2: 8000, extensionPercent: 5, connectorPercent: 5 });
  return value;
}
