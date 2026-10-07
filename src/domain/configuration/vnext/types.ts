import type { Lamination, Material } from '../../measurements/shared';
import type { AdditionalWorkCatalogEntry } from '../../works/vnext';

/** Temporary parallel contracts for the controlled transition to UX/Pricing v1.2. */
export interface CatalogEntry {
  id: string;
  name: string;
  status: 'active' | 'hidden';
}
export interface HardwareConfiguration extends CatalogEntry { material: 'pvc' }
export interface ColorConfiguration extends CatalogEntry {
  materials: readonly Material[];
  lamination: Lamination;
}
interface ProfileCommon extends CatalogEntry {
  basePricePerM2: number;
  colorRules: readonly { colorId: string; colorPercent: number }[];
  extensionPercent: number;
  connectorPercent: number;
  productMarkupPercent: number;
}
export type ProfileConfiguration = ProfileCommon & (
  | { material: 'pvc'; hardwareActivity: readonly { hardwareId: string; activityPercent: number }[] }
  | { material: 'aluminium'; activity: { slidingPercent: number; swingPercent: number } }
);
export interface GlazingConfiguration {
  currency: 'RUB';
  profiles: readonly ProfileConfiguration[];
  hardware: readonly HardwareConfiguration[];
  colors: readonly ColorConfiguration[];
  /** RUB/m², independent of all product markups and profile identities. */
  installationRatesPerM2: Record<Material, number>;
}
export interface GlazingDefaults {
  material: Material;
  pvcProfileId: string;
  hardwareId: string;
  aluminiumSystemId: string;
  colorId: string;
}
export type FinishSide = 'interior' | 'exterior';
export type FinishElement = 'slope' | 'sill' | 'drip';
export type FinishWork =
  | { side: 'interior'; workType: 'interiorSlopes' | 'interiorSlopesAndSill' | 'sillOnly' }
  | { side: 'exterior'; workType: 'exteriorSlopes' | 'exteriorSlopesAndDrip' | 'dripOnly' };
export type FinishWorkType = FinishWork['workType'];
export const FINISH_RESERVE_PERCENT = 20 as const;
export interface FinishWidthVariant {
  id: string;
  physicalWidthMm: number;
  /** Inclusive limit of ACTUAL measured depth; allowances do not affect selection. */
  maxUsableActualDepthMm: number;
  /** RUB per running metre of the complete set, including consumables. */
  purchaseCostPerRunningMeter: number;
}
export interface FinishMaterialConfiguration extends CatalogEntry {
  side: FinishSide;
  element: FinishElement;
  widthVariants: readonly FinishWidthVariant[];
  installerRatePerRunningMeter: number;
}
export interface FinishConfiguration {
  currency: 'RUB';
  materials: readonly FinishMaterialConfiguration[];
  reservePercent: typeof FINISH_RESERVE_PERCENT;
  baseInstallerPayByWorkType: Record<FinishWorkType, number>;
  /** Required cut-size allowances, separate from reserve and installed work length. */
  allowances: Record<FinishElement, { lengthMm: number; depthMm: number }>;
  finishMarkupPercent: number;
}
/** RUB, not minor units. Implementation of rounding belongs to a later feature. */
export type CommercialRoundingStepRub = 10 | 50 | 100;
export interface CalculatorSettings {
  schemaVersion: 2;
  glazing: GlazingConfiguration;
  defaults: GlazingDefaults;
  finish: FinishConfiguration;
  additionalWorks: readonly AdditionalWorkCatalogEntry[];
  commercialRoundingStepRub: CommercialRoundingStepRub;
  example: { origin: 'starter' | 'custom'; containsExamplePrices: boolean };
  pricesConfirmed: boolean;
}
