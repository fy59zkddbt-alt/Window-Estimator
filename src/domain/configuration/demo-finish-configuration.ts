import type { FinishConfiguration } from './finish-types';

/** Illustrative rates, not a supplier price list. Separate selections demonstrate both settings modes. */
export const demoFinishConfiguration: FinishConfiguration = {
  currency: 'RUB',
  materials: [
    { id: 'slope-simple', name: 'Откосы — Simple', finishType: 'slope',
      sizing: { lengthAllowancePerPieceMm: 0, depthAllowanceMm: 0, purchaseStepMm: 0 },
      pricing: { mode: 'simple', materialSellingPricePerM: 600, workRatePerM: 400, depthCoefficient: 1 } },
    { id: 'sill-simple', name: 'Подоконник — Simple', finishType: 'sill',
      sizing: { lengthAllowancePerPieceMm: 0, depthAllowanceMm: 0, purchaseStepMm: 0 },
      pricing: { mode: 'simple', materialSellingPricePerM: 1200, workRatePerM: 500, depthCoefficient: 1 } },
    { id: 'slope-advanced', name: 'Откосы — Advanced', finishType: 'slope',
      sizing: { lengthAllowancePerPieceMm: 20, depthAllowanceMm: 10, purchaseStepMm: 500 },
      pricing: { mode: 'advanced', materialPurchasePricePerM: 500, materialMarkupPercent: 20, workRatePerM: 400,
        depthBands: [{ maxDepthMm: 300, purchasePricePerM: 500 }, { maxDepthMm: 600, purchasePricePerM: 800 }] } },
    { id: 'sill-advanced', name: 'Подоконник — Advanced', finishType: 'sill',
      sizing: { lengthAllowancePerPieceMm: 100, depthAllowanceMm: 20, purchaseStepMm: 500 },
      pricing: { mode: 'advanced', materialPurchasePricePerM: 1000, materialMarkupPercent: 20, workRatePerM: 500,
        depthBands: [{ maxDepthMm: 300, purchasePricePerM: 1000 }, { maxDepthMm: 600, purchasePricePerM: 1600 }] } },
  ],
};
