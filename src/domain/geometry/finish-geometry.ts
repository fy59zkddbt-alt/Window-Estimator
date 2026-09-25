import type { FinishSizing, FinishType } from '../configuration/finish-types';
import { validateFinishSizing } from '../configuration/normalize-finish';
import type { FinishDimensions } from '../measurements/window-finish/types';
import { validateFinishDimensions } from '../measurements/window-finish/create-window-finish';

export interface FinishPiece {
  part: 'top' | 'left' | 'right' | 'sill';
  installedLengthMm: number;
  requiredLengthMm: number;
  purchaseLengthMm: number;
  requiredDepthMm: number;
}
export interface FinishMaterialGeometry {
  finishType: FinishType;
  materialId: string;
  pieces: readonly FinishPiece[];
  actualInstalledLengthM: number;
  requiredDepthMm: number;
  /** Sum of cut lengths after per-piece allowance. */
  requiredLengthMm: number;
  purchaseLengthMm: number;
  purchaseLengthM: number;
  requiredAreaM2: number;
}
export interface FinishGeometry {
  slopeLengthM: number;
  sillLengthM: number;
  materials: readonly FinishMaterialGeometry[];
}

export function roundPurchaseLength(requiredLengthMm: number, purchaseStepMm: number): number {
  if (!Number.isFinite(requiredLengthMm) || requiredLengthMm <= 0 || !Number.isFinite(purchaseStepMm) || purchaseStepMm < 0) throw new Error('Некорректная длина или закупочный шаг.');
  if (purchaseStepMm === 0) return requiredLengthMm;
  const quotient = requiredLengthMm / purchaseStepMm;
  const nearest = Math.round(quotient);
  // Avoid an extra whole step caused ONLY by floating-point noise at an exact multiple.
  const steps = nearest > 0 && Math.abs(quotient - nearest) <= 8 * Number.EPSILON * Math.max(1, Math.abs(quotient)) ? nearest : Math.ceil(quotient);
  const result = steps * purchaseStepMm;
  if (!Number.isSafeInteger(steps) || !Number.isFinite(result) || result <= 0) throw new Error('Закупочная длина вне числового диапазона.');
  return result;
}

/** Reusable independently of WindowFinishMeasurement or a future window flow. No rates or money here. */
export function getFinishGeometry(dimensions: FinishDimensions, materials: readonly { finishType: FinishType; materialId: string; sizing: FinishSizing }[]): FinishGeometry {
  validateFinishDimensions(dimensions);
  if (materials.length < 1 || materials.length > 2 || new Set(materials.map((item) => item.finishType)).size !== materials.length) throw new Error('Выберите уникальные виды отделки.');
  const geometry = materials.map(({ finishType, materialId, sizing }): FinishMaterialGeometry => {
    if (!['slope', 'sill'].includes(finishType)) throw new Error('Неизвестный тип отделки.');
    validateFinishSizing(sizing);
    const lengths: { part: FinishPiece['part']; length: number }[] = finishType === 'slope'
      ? [{ part: 'top', length: dimensions.widthMm }, { part: 'left', length: dimensions.heightMm }, { part: 'right', length: dimensions.heightMm }]
      : [{ part: 'sill', length: dimensions.widthMm }];
    const requiredDepthMm = dimensions.depthMm + sizing.depthAllowanceMm;
    const pieces = lengths.map(({ part, length }) => {
      const requiredLengthMm = length + sizing.lengthAllowancePerPieceMm;
      return { part, installedLengthMm: length, requiredLengthMm, requiredDepthMm,
        purchaseLengthMm: roundPurchaseLength(requiredLengthMm, sizing.purchaseStepMm) };
    });
    const actualInstalledLengthM = lengths.reduce((sum, item) => sum + item.length, 0) / 1000;
    const requiredLengthMm = pieces.reduce((sum, piece) => sum + piece.requiredLengthMm, 0);
    const purchaseLengthMm = pieces.reduce((sum, piece) => sum + piece.purchaseLengthMm, 0);
    const requiredAreaM2 = (requiredLengthMm / 1000) * (requiredDepthMm / 1000);
    const purchaseLengthM = purchaseLengthMm / 1000;
    if ([requiredDepthMm, actualInstalledLengthM, requiredAreaM2, purchaseLengthM].some((value) => !Number.isFinite(value) || value <= 0)) throw new Error('Геометрия отделки вне числового диапазона.');
    return { finishType, materialId, pieces, actualInstalledLengthM, requiredDepthMm, requiredLengthMm, purchaseLengthMm, purchaseLengthM, requiredAreaM2 };
  });
  return { slopeLengthM: geometry.find((item) => item.finishType === 'slope')?.actualInstalledLengthM ?? 0,
    sillLengthM: geometry.find((item) => item.finishType === 'sill')?.actualInstalledLengthM ?? 0, materials: geometry };
}
