import type { GlazingPlane, HingeSide, MeasurementIdentity, Opening, OpeningElement, Section } from './shared';
import type { WindowMeasurement as CurrentWindow } from './window/types';
import type { BalconyMeasurement as CurrentBalcony, BalconyPlane as CurrentPlane } from './balcony/types';
import type { FinishDimensions } from './window-finish/types';
import type { AdditionalWork } from '../works/vnext';
import type { FinishElement, FinishWork } from '../configuration/vnext/types';
import { positive, uniqueIds } from '../configuration/vnext/validate';
import { copyAdditionalWorks } from '../works/vnext';

export type AluminiumPlaneMode = 'sliding' | 'swing';
type Fixed = { openingType: 'fixed'; hingeSide?: never; hardwareId?: never };
type AluminiumSliding = { openingType: 'sliding'; hingeSide?: never; hardwareId?: never };
type AluminiumTurn = { openingType: 'turn'; hingeSide: HingeSide; hardwareId?: never };
export type AluminiumPlane =
  | (GlazingPlane<Section<Fixed | AluminiumSliding>> & { mode: 'sliding' })
  | (GlazingPlane<Section<Fixed | AluminiumTurn>> & { mode: 'swing' });
export type PvcPlane = GlazingPlane<Section<Opening>>;
type WindowShape<T> = T extends CurrentWindow ? Omit<T, 'material' | 'plane' | 'door' | 'additionalWorks' | 'lamination'>
  & (T extends { windowType: 'balconyBlock' } ? { door: OpeningElement } : object) : never;
type WindowDimensions = WindowShape<CurrentWindow>;
interface ProductOptions { colorId: string; extensions: boolean; connectors: boolean; additionalWorks: readonly AdditionalWork[] }
// A block door follows the selected aluminium plane mechanism; PVC retains its existing opening contract.
type AluminiumWindowShape<T> = T extends { windowType: 'balconyBlock' }
  ? Omit<T, 'door'> & (
    | { plane: Extract<AluminiumPlane, { mode: 'sliding' }>; door: { id: string } & (Fixed | AluminiumSliding) }
    | { plane: Extract<AluminiumPlane, { mode: 'swing' }>; door: { id: string } & (Fixed | AluminiumTurn) }
  ) : T & { plane: AluminiumPlane };
export type WindowMeasurement = ProductOptions & (
  | (WindowDimensions & { material: 'pvc'; plane: PvcPlane })
  | (AluminiumWindowShape<WindowDimensions> & { material: 'aluminium' })
);
type BalconyPlaneDimensions = Omit<CurrentPlane, 'sections'>;
export type BalconyMeasurement = Omit<CurrentBalcony, 'material' | 'planes' | 'additionalWorks' | 'lamination'> & ProductOptions & (
  | { material: 'pvc'; planes: readonly (BalconyPlaneDimensions & PvcPlane)[] }
  | { material: 'aluminium'; planes: readonly (BalconyPlaneDimensions & AluminiumPlane)[] }
);
/** Automatic is a request to calculate, not a stored or fabricated cost basis. */
export type FinishPriceState =
  | { mode: 'automatic' }
  | { mode: 'priceRequiresClarification'; reason: string }
  | { mode: 'manual'; finalPriceMinor: number; confirmation: 'confirmed' | 'needsConfirmation' };
export interface FinishSelection { element: FinishElement; materialId: string; widthVariantId?: string }
export type WindowFinishMeasurement = MeasurementIdentity & FinishDimensions & FinishWork & {
  kind: 'WindowFinish';
  selections: readonly FinishSelection[];
  additionalWorks: readonly AdditionalWork[];
  /** Changes to geometry/work/material must invalidate manual confirmation in future application operations. */
  priceState: FinishPriceState;
};
export type Measurement = WindowMeasurement | BalconyMeasurement | WindowFinishMeasurement;

function validateAluminiumOpening(mode: AluminiumPlaneMode, opening: Fixed | AluminiumSliding | AluminiumTurn): void {
  if (opening.hardwareId !== undefined) throw new Error('Алюминий не использует каталог ПВХ-фурнитуры.');
  if (opening.openingType === 'fixed' || (mode === 'sliding' && opening.openingType === 'sliding')) {
    if (opening.hingeSide !== undefined) throw new Error('Петли недопустимы.');
  } else if (mode === 'swing' && opening.openingType === 'turn') {
    if (!['left', 'right'].includes(opening.hingeSide)) throw new Error('Укажите петли.');
  } else throw new Error('Открывание несовместимо с механизмом плоскости.');
}
export function validateAluminiumPlane(plane: AluminiumPlane): void {
  if (!plane.id.trim() || !['sliding', 'swing'].includes(plane.mode) || !plane.sections.length) throw new Error('Некорректная алюминиевая плоскость.');
  uniqueIds(plane.sections);
  for (const section of plane.sections) {
    positive(section.widthMm);
    validateAluminiumOpening(plane.mode, section);
  }
}
/** Validate the separate block door against the SAME mechanism as its glazing plane. */
export function validateAluminiumWindow(value: Extract<WindowMeasurement, { material: 'aluminium' }>): void {
  validateAluminiumPlane(value.plane);
  if (value.windowType === 'balconyBlock') {
    uniqueIds([...value.plane.sections, value.door]);
    positive(value.doorWidthMm); positive(value.doorHeightMm); positive(value.windowHeightMm);
    validateAluminiumOpening(value.plane.mode, value.door);
  }
}
export function validateFinishMeasurement(value: WindowFinishMeasurement): void {
  if (value.kind !== 'WindowFinish' || !value.id.trim() || !value.room.trim() || !value.name.trim()) throw new Error('Укажите данные отделки.');
  [value.widthMm, value.heightMm, value.depthMm].forEach(positive);
  const elements: Record<FinishWork['workType'], readonly FinishElement[]> = {
    interiorSlopes: ['slope'], interiorSlopesAndSill: ['slope', 'sill'], sillOnly: ['sill'],
    exteriorSlopes: ['slope'], exteriorSlopesAndDrip: ['slope', 'drip'], dripOnly: ['drip'],
  };
  const expected = elements[value.workType];
  if (!expected || (value.side === 'interior' ? !['interiorSlopes', 'interiorSlopesAndSill', 'sillOnly'].includes(value.workType)
    : value.side !== 'exterior' || !['exteriorSlopes', 'exteriorSlopesAndDrip', 'dripOnly'].includes(value.workType))) throw new Error('Несовместимая сторона и вид работ.');
  uniqueIds(value.selections.map((selection) => ({ id: selection.element })));
  if (value.selections.length !== expected.length || value.selections.some((selection) => !expected.includes(selection.element)
    || !selection.materialId.trim() || (selection.widthVariantId !== undefined && !selection.widthVariantId.trim()))) throw new Error('Некорректный состав отделки.');
  copyAdditionalWorks(value.additionalWorks);
  const state = value.priceState;
  if (state.mode === 'manual') {
    if (!Number.isSafeInteger(state.finalPriceMinor) || state.finalPriceMinor <= 0
      || !['confirmed', 'needsConfirmation'].includes(state.confirmation)) throw new Error('Некорректная ручная цена отделки.');
  } else if (state.mode === 'priceRequiresClarification') {
    if (!state.reason.trim()) throw new Error('Укажите причину уточнения цены.');
  } else if (state.mode !== 'automatic') throw new Error('Неизвестное состояние цены.');
}
