export type FinishType = 'slope' | 'sill';

export interface FinishSizing {
  /** Added once to the length of EACH cut piece, not to installed work length. */
  lengthAllowancePerPieceMm: number;
  depthAllowanceMm: number;
  /** Zero means exact required length; positive rounds EACH physical piece up independently. */
  purchaseStepMm: number;
}
export type FinishPricingSettings =
  | { mode: 'simple'; materialSellingPricePerM: number; workRatePerM: number;
      depthCoefficient?: number;
      depthBands?: readonly { maxDepthMm: number; coefficient: number }[] }
  | { mode: 'advanced'; materialPurchasePricePerM: number; materialMarkupPercent: number; workRatePerM: number;
      depthBands?: readonly { maxDepthMm: number; purchasePricePerM: number }[] };

export interface FinishMaterialConfiguration {
  id: string;
  name: string;
  finishType: FinishType;
  sizing: FinishSizing;
  pricing: FinishPricingSettings;
}
export interface FinishConfiguration {
  currency: 'RUB';
  materials: readonly FinishMaterialConfiguration[];
}

/** Neither source mode nor UI settings are exposed to the Pricing Engine. */
export interface NormalizedFinishMaterial {
  id: string;
  name: string;
  finishType: FinishType;
  sizing: FinishSizing;
  purchasePricePerM: number;
  materialMarkupPercent: number;
  workRatePerM: number;
  /** Empty: flat rate at all depths. Nonempty: inclusive upper bounds, no fallback beyond last band. */
  depthBands: readonly { maxDepthMm: number; purchasePricePerM: number }[];
}
