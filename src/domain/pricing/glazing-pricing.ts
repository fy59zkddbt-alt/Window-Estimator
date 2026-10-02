import type { ProfileConfiguration } from '../configuration/types';
import type { GlazingGeometry } from '../geometry/types';
import type { Lamination } from '../measurements/shared';

export interface GlazingPrice {
  baseAmount: number; activityAmount: number; colorAmount: number;
  subtotal: number; markupAmount: number;
  /** Rounded only once, after markup, to RUB minor units. */
  totalMinor: number;
}

export interface InstalledGlazingPrice extends GlazingPrice {
  productPriceMinor: number;
  installationPriceMinor: number;
}

/** Installation is charged on total area, without product/color/activity markups. */
export function priceInstalledGlazing(geometry: GlazingGeometry, profile: ProfileConfiguration, lamination: Lamination): InstalledGlazingPrice {
  const product = priceGlazing(geometry, profile, lamination);
  // Historical snapshots predate installation and retain their original price.
  const rate = profile.installationRatePerM2 === undefined ? 0 : profile.installationRatePerM2;
  if (!Number.isFinite(rate) || rate < 0) throw new Error('Тариф монтажа должен быть конечным числом не меньше нуля.');
  const installationAmount = geometry.totalAreaM2 * rate;
  const installationPriceMinor = Math.round((installationAmount + Number.EPSILON * installationAmount) * 100);
  const totalMinor = product.totalMinor + installationPriceMinor;
  if (!Number.isSafeInteger(installationPriceMinor) || !Number.isSafeInteger(totalMinor)) throw new Error('Стоимость вне допустимого числового диапазона.');
  return { ...product, productPriceMinor: product.totalMinor, installationPriceMinor, totalMinor };
}

export function priceGlazing(geometry: GlazingGeometry, profile: ProfileConfiguration, lamination: Lamination): GlazingPrice {
  const { totalAreaM2: totalArea, activeAreaM2: activeArea } = geometry;
  if (!Number.isFinite(totalArea) || totalArea <= 0 || !Number.isFinite(activeArea) || activeArea < 0 || activeArea > totalArea) throw new Error('Некорректная площадь.');
  const rates = [profile.basePricePerM2, profile.activityPercent, profile.laminateOneSidePercent, profile.laminateTwoSidesPercent, profile.productMarkupPercent];
  if (rates.some((value) => !Number.isFinite(value) || value < 0)) throw new Error('Тарифы должны быть конечными неотрицательными числами.');
  if (!['none', 'one_side', 'two_sides'].includes(lamination)) throw new Error('Неизвестная ламинация.');
  const colorPercent = lamination === 'none' ? 0 : lamination === 'one_side' ? profile.laminateOneSidePercent : profile.laminateTwoSidesPercent;
  const baseAmount = totalArea * profile.basePricePerM2;
  const activityAmount = activeArea * profile.basePricePerM2 * profile.activityPercent / 100;
  const colorAmount = totalArea * profile.basePricePerM2 * colorPercent / 100;
  const subtotal = baseAmount + activityAmount + colorAmount;
  const total = subtotal * (1 + profile.productMarkupPercent / 100);
  const totalMinor = Math.round((total + Number.EPSILON * total) * 100);
  if (!Number.isSafeInteger(totalMinor)) throw new Error('Стоимость вне допустимого числового диапазона.');
  return { baseAmount, activityAmount, colorAmount, subtotal, markupAmount: total - subtotal, totalMinor };
}
