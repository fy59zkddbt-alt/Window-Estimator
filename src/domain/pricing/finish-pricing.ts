import type { NormalizedFinishMaterial, FinishType } from '../configuration/finish-types';
import { validateNormalizedFinishMaterial } from '../configuration/normalize-finish';
import type { FinishGeometry } from '../geometry/finish-geometry';

export interface FinishPriceLine {
  materialId: string; finishType: FinishType; name: string;
  appliedPurchasePricePerM: number;
  materialPurchaseCost: number; materialMarkupAmount: number; materialSellingPrice: number;
  workPrice: number; totalMinor: number;
}
export interface FinishPrice {
  lines: readonly FinishPriceLine[];
  materialPurchaseCost: number; materialMarkupAmount: number; materialSellingPrice: number;
  workPrice: number; totalMinor: number;
}

function toMinor(value: number): number {
  const minor = Math.round((value + Number.EPSILON * value) * 100);
  if (!Number.isSafeInteger(minor) || minor < 0) throw new Error('Стоимость отделки вне числового диапазона.');
  return minor;
}

/** Only normalized rates: no simple/advanced switch and no quantity calculations. */
export function priceFinish(geometry: FinishGeometry, materials: readonly NormalizedFinishMaterial[]): FinishPrice {
  if (!geometry.materials.length || new Set(geometry.materials.map((item) => item.materialId)).size !== geometry.materials.length) throw new Error('Некорректный набор материалов отделки.');
  const lines = geometry.materials.map((quantity): FinishPriceLine => {
    const matches = materials.filter((item) => item.id === quantity.materialId);
    const material = matches[0];
    if (matches.length !== 1 || !material || material.finishType !== quantity.finishType) throw new Error('Материал не соответствует виду отделки.');
    validateNormalizedFinishMaterial(material);
    if ([quantity.purchaseLengthM, quantity.actualInstalledLengthM, quantity.requiredDepthMm].some((value) => !Number.isFinite(value) || value <= 0)) throw new Error('Некорректные количества отделки.');
    const band = material.depthBands.find((item) => quantity.requiredDepthMm <= item.maxDepthMm);
    if (material.depthBands.length && !band) throw new Error(`Для материала «${material.name}» нет цены на глубину ${quantity.requiredDepthMm} мм.`);
    const appliedPurchasePricePerM = band?.purchasePricePerM ?? material.purchasePricePerM;
    const materialPurchaseCost = quantity.purchaseLengthM * appliedPurchasePricePerM;
    const materialSellingPrice = materialPurchaseCost * (1 + material.materialMarkupPercent / 100);
    const workPrice = quantity.actualInstalledLengthM * material.workRatePerM;
    return { materialId: material.id, finishType: material.finishType, name: material.name, appliedPurchasePricePerM,
      materialPurchaseCost, materialMarkupAmount: materialSellingPrice - materialPurchaseCost,
      materialSellingPrice, workPrice, totalMinor: toMinor(materialSellingPrice + workPrice) };
  });
  const sum = (key: 'materialPurchaseCost' | 'materialMarkupAmount' | 'materialSellingPrice' | 'workPrice') => lines.reduce((total, line) => total + line[key], 0);
  const materialSellingPrice = sum('materialSellingPrice');
  const workPrice = sum('workPrice');
  return { lines, materialPurchaseCost: sum('materialPurchaseCost'), materialMarkupAmount: sum('materialMarkupAmount'), materialSellingPrice, workPrice, totalMinor: toMinor(materialSellingPrice + workPrice) };
}
