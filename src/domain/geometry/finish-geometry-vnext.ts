import type { FinishConfiguration, FinishElement } from '../configuration/vnext/types';
import type { WindowFinishMeasurement } from '../measurements/vnext';
import { validateFinishMeasurement } from '../measurements/vnext';
import { nonnegative, positive } from '../configuration/vnext/validate';
import { finishInstalledPieces } from './finish-geometry';

export interface FinishElementGeometryVNext {
  element: FinishElement;
  materialId: string;
  widthVariantId?: string;
  actualDepthMm: number;
  requiredDepthMm: number;
  pieces: readonly { part: 'top' | 'left' | 'right' | 'sill' | 'drip'; installedLengthMm: number; requiredLengthMm: number }[];
  installedLengthM: number;
  calculatedMaterialQuantityM: number;
}
export interface FinishGeometryVNext { elements: readonly FinishElementGeometryVNext[] }

/** Allowance once per physical piece. No purchase multiples or material reserve here. */
export function getFinishGeometryVNext(measurement: WindowFinishMeasurement,
  allowances: FinishConfiguration['allowances']): FinishGeometryVNext {
  validateFinishMeasurement(measurement);
  // Stable physical order, independent of selection-array order.
  const elements = (['slope', 'sill', 'drip'] as const).flatMap((element) => {
    const selection = measurement.selections.find((selection) => selection.element === element);
    if (!selection) return [];
    const allowance = allowances[element];
    nonnegative(allowance.lengthMm); nonnegative(allowance.depthMm);
    const pieces = finishInstalledPieces(measurement, element).map(({ part, length }) => ({
      part, installedLengthMm: length, requiredLengthMm: length + allowance.lengthMm,
    }));
    const requiredDepthMm = measurement.depthMm + allowance.depthMm;
    const installedLengthM = pieces.reduce((sum, piece) => sum + piece.installedLengthMm, 0) / 1000;
    const calculatedMaterialQuantityM = pieces.reduce((sum, piece) => sum + piece.requiredLengthMm, 0) / 1000;
    [requiredDepthMm, installedLengthM, calculatedMaterialQuantityM, ...pieces.map((piece) => piece.requiredLengthMm)].forEach(positive);
    return [{ ...selection, actualDepthMm: measurement.depthMm, requiredDepthMm, pieces, installedLengthM, calculatedMaterialQuantityM }];
  });
  return { elements };
}
