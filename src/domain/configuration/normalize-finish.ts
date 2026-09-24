import type { FinishMaterialConfiguration, FinishSizing, NormalizedFinishMaterial } from './finish-types';

export function nonnegative(value: number): void {
  if (!Number.isFinite(value) || value < 0) throw new Error('Параметры отделки должны быть конечными неотрицательными числами.');
}
export function validateFinishSizing(sizing: FinishSizing): void {
  [sizing.lengthAllowancePerPieceMm, sizing.depthAllowanceMm, sizing.wastePercent, sizing.purchaseStepMm].forEach(nonnegative);
}
export function validateNormalizedFinishMaterial(material: NormalizedFinishMaterial): void {
  if (!material.id.trim() || !material.name.trim()) throw new Error('Укажите ID и название материала отделки.');
  if (!['slope', 'sill'].includes(material.finishType)) throw new Error('Неизвестный тип отделки.');
  validateFinishSizing(material.sizing);
  [material.purchasePricePerM, material.materialMarkupPercent, material.workRatePerM].forEach(nonnegative);
  let previous = 0;
  for (const band of material.depthBands) {
    if (!Number.isFinite(band.maxDepthMm) || band.maxDepthMm <= previous) throw new Error('Диапазоны глубины должны иметь положительные возрастающие границы.');
    nonnegative(band.purchasePricePerM);
    previous = band.maxDepthMm;
  }
}

export function normalizeFinishMaterial(source: FinishMaterialConfiguration): NormalizedFinishMaterial {
  const pricing = source.pricing;
  if (pricing.mode !== 'simple' && pricing.mode !== 'advanced') throw new Error('Неизвестный режим настройки отделки.');
  if (pricing.mode === 'simple') {
    nonnegative(pricing.materialSellingPricePerM);
    nonnegative(pricing.depthCoefficient ?? 1);
    pricing.depthBands?.forEach((band) => nonnegative(band.coefficient));
  }
  const material: NormalizedFinishMaterial = {
    id: source.id, name: source.name, finishType: source.finishType, sizing: { ...source.sizing },
    purchasePricePerM: pricing.mode === 'simple' ? pricing.materialSellingPricePerM * (pricing.depthCoefficient ?? 1) : pricing.materialPurchasePricePerM,
    materialMarkupPercent: pricing.mode === 'simple' ? 0 : pricing.materialMarkupPercent,
    workRatePerM: pricing.workRatePerM,
    depthBands: pricing.mode === 'simple'
      ? (pricing.depthBands ?? []).map((band) => ({ maxDepthMm: band.maxDepthMm, purchasePricePerM: pricing.materialSellingPricePerM * (pricing.depthCoefficient ?? 1) * band.coefficient }))
      : (pricing.depthBands ?? []).map((band) => ({ ...band })),
  };
  validateNormalizedFinishMaterial(material);
  return material;
}
