import type { Material } from '../measurements/shared';

export interface ProfileConfiguration {
  id: string;
  name: string;
  material: Material;
  basePricePerM2: number;
  activityPercent: number;
  laminateOneSidePercent: number;
  laminateTwoSidesPercent: number;
  productMarkupPercent: number;
  /** Reserved installation rate; not applied by glazing pricing. Optional in historical snapshots. */
  installationRatePerM2?: number;
}
export interface HardwareConfiguration { id: string; name: string; material: Material }
export interface UserConfiguration {
  currency: 'RUB';
  profiles: readonly ProfileConfiguration[];
  hardware: readonly HardwareConfiguration[];
}
