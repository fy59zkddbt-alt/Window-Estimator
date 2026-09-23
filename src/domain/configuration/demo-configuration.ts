import type { UserConfiguration } from './types';

// Illustrative values, not a supplier price list.
export const demoConfiguration: UserConfiguration = {
  currency: 'RUB',
  profiles: ['pvc', 'aluminium'].map((material) => ({
    id: material, name: material === 'pvc' ? 'Демо ПВХ' : 'Демо алюминий',
    material: material as 'pvc' | 'aluminium', basePricePerM2: 10000,
    activityPercent: 20, laminateOneSidePercent: 10,
    laminateTwoSidesPercent: 20, productMarkupPercent: 15,
  })),
  hardware: [
    { id: 'pvc-standard', name: 'Демо фурнитура ПВХ', material: 'pvc' },
    { id: 'aluminium-standard', name: 'Демо фурнитура алюминий', material: 'aluminium' },
  ],
};
