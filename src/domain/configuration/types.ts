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
}
export interface HardwareConfiguration { id: string; name: string; material: Material }
export interface UserConfiguration {
  currency: 'RUB';
  profiles: readonly ProfileConfiguration[];
  hardware: readonly HardwareConfiguration[];
}
