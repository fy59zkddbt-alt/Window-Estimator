import type { CalculatorSettings } from './types';
import { copyDomainValue } from './copy';
import { validateCalculatorSettings } from './validate';

/** Ordinary copying/saving preserves explicit price confirmation. */
export function copyCalculatorSettings(value: CalculatorSettings): CalculatorSettings {
  validateCalculatorSettings(value);
  return copyDomainValue(value);
}
export function confirmExamplePrices(value: CalculatorSettings): CalculatorSettings {
  return copyCalculatorSettings({ ...value, pricesConfirmed: true });
}
/** Call only for explicit creation/restoration from the example, never on load/save. */
export function createStarterCalculatorSettings(): CalculatorSettings {
  const colorRules = [{ colorId: 'white', colorPercent: 0 }, { colorId: 'laminated', colorPercent: 10 }, { colorId: 'laminated-two', colorPercent: 25 }];
  return copyCalculatorSettings({
    schemaVersion: 2,
    glazing: {
      currency: 'RUB',
      profiles: [
        { id: 'pvc-standard', name: 'VEKA Softline 70', status: 'active', material: 'pvc', basePricePerM2: 5700,
          hardwareActivity: [{ hardwareId: 'standard', activityPercent: 125 }, { hardwareId: 'premium', activityPercent: 30 }],
          colorRules, extensionPercent: 20, connectorPercent: 5, productMarkupPercent: 40 },
        { id: 'aluminium-example', name: 'Алюминиевая система — пример', status: 'active', material: 'aluminium', basePricePerM2: 13000,
          activity: { slidingPercent: 15, swingPercent: 25 }, colorRules: [{ colorId: 'white', colorPercent: 0 }],
          extensionPercent: 5, connectorPercent: 20, productMarkupPercent: 20 },
      ],
      hardware: [{ id: 'standard', name: 'Mako', material: 'pvc', status: 'active' },
        { id: 'premium', name: 'Премиум', material: 'pvc', status: 'active' }],
      colors: [{ id: 'white', name: 'Белый', status: 'active', materials: ['pvc', 'aluminium'], lamination: 'none' },
        { id: 'laminated', name: 'Ламинация с одной стороны', status: 'active', materials: ['pvc'], lamination: 'one_side' },
        { id: 'laminated-two', name: 'Ламинация с двух сторон', status: 'active', materials: ['pvc'], lamination: 'two_sides' }],
      installationRatesPerM2: { pvc: 3000, aluminium: 3000 },
    },
    defaults: { material: 'pvc', pvcProfileId: 'pvc-standard', hardwareId: 'standard', colorId: 'white', aluminiumSystemId: 'aluminium-example' },
    finish: {
      currency: 'RUB', reservePercent: 20, finishMarkupPercent: 20,
      materials: [
        { id: 'sandwich', name: 'Сэндвич-панель', status: 'active', side: 'interior', element: 'slope', installerRatePerRunningMeter: 400,
          widthVariants: [{ id: '200', physicalWidthMm: 200, maxUsableActualDepthMm: 220, purchaseCostPerRunningMeter: 600 },
            { id: '300', physicalWidthMm: 300, maxUsableActualDepthMm: 320, purchaseCostPerRunningMeter: 800 }] },
        { id: 'sill-standard', name: 'Подоконник Стандарт', status: 'active', side: 'interior', element: 'sill', installerRatePerRunningMeter: 300,
          widthVariants: [{ id: '300', physicalWidthMm: 300, maxUsableActualDepthMm: 300, purchaseCostPerRunningMeter: 700 }] },
        { id: 'sill-premium', name: 'Подоконник Премиум', status: 'active', side: 'interior', element: 'sill', installerRatePerRunningMeter: 400,
          widthVariants: [{ id: '300', physicalWidthMm: 300, maxUsableActualDepthMm: 300, purchaseCostPerRunningMeter: 1000 }] },
      ],
      baseInstallerPayByWorkType: { interiorSlopes: 1000, interiorSlopesAndSill: 1300, sillOnly: 500,
        exteriorSlopes: 1000, exteriorSlopesAndDrip: 1300, dripOnly: 500 },
      allowances: { slope: { lengthMm: 0, depthMm: 0 }, sill: { lengthMm: 100, depthMm: 50 }, drip: { lengthMm: 100, depthMm: 30 } },
    },
    additionalWorks: [{ id: 'delivery', name: 'Доставка', status: 'active', unitPriceMinor: 150000, unit: 'unit' }],
    commercialRoundingStepRub: 100,
    example: { origin: 'starter', containsExamplePrices: true }, pricesConfirmed: false,
  });
}
