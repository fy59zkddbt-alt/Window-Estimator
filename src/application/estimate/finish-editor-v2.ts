import type { FinishConfiguration, FinishElement, FinishSide, FinishWork, FinishWorkType } from '../../domain/configuration/vnext/types';
import { copyDomainValue } from '../../domain/configuration/vnext/copy';
import { validateFinishMeasurement, validateGlazingMeasurement, type WindowFinishMeasurement, type WindowMeasurement } from '../../domain/measurements/vnext';
import { selectFinishWidthVariant } from '../../domain/pricing/finish-pricing-vnext';
import { rubInputToMinor } from '../settings/settings-v2';
import { reviseFinishDraftVNext } from './estimate-finish-vnext';

export const finishWorkElements: Record<FinishWorkType, readonly FinishElement[]> = {
  interiorSlopes: ['slope'], interiorSlopesAndSill: ['slope', 'sill'], sillOnly: ['sill'],
  exteriorSlopes: ['slope'], exteriorSlopesAndDrip: ['slope', 'drip'], dripOnly: ['drip'],
};
export type FinishSeed = Pick<WindowFinishMeasurement, 'room' | 'name' | 'widthMm' | 'heightMm'>;
export const copyFinishEditorValue = copyDomainValue;
export { reviseFinishDraftVNext as reviseFinishDraft } from './estimate-finish-vnext';

export function finishDimensionFromText(text: string): number {
  if (!/^\d+(?:[.,]\d+)?$/.test(text.trim())) return NaN;
  const value = Number(text.trim().replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : NaN;
}

export function manualFinishPriceText(value: number): string {
  const minor = BigInt(value);
  return `${minor / 100n}.${String(minor % 100n).padStart(2, '0')}`;
}

export function finishMaterialChoices(configuration: FinishConfiguration, side: FinishSide, element: FinishElement, currentId?: string) {
  return configuration.materials.filter((material) => material.side === side && material.element === element
    && (material.status === 'active' || material.id === currentId));
}

/** New drafts are intentionally incomplete. Only readyFinishMeasurement may cross the save boundary. */
export function newFinishDraft(id: string, configuration: FinishConfiguration, seed?: FinishSeed): WindowFinishMeasurement {
  return { kind: 'WindowFinish', id, room: seed?.room ?? '', name: seed?.name ?? '',
    widthMm: seed?.widthMm ?? NaN, heightMm: seed?.heightMm ?? NaN, depthMm: NaN,
    side: 'interior', workType: 'interiorSlopesAndSill',
    selections: finishWorkElements.interiorSlopesAndSill.map((element) => ({ element,
      materialId: finishMaterialChoices(configuration, 'interior', element)[0]?.id ?? '' })),
    additionalWorks: [], priceState: { mode: 'automatic' } };
}

export function changeFinishWork(value: WindowFinishMeasurement, work: FinishWork, configuration: FinishConfiguration): WindowFinishMeasurement {
  const selections = finishWorkElements[work.workType].map((element) => {
    const previous = value.side === work.side ? value.selections.find((selection) => selection.element === element) : undefined;
    return previous ?? { element, materialId: finishMaterialChoices(configuration, work.side, element)[0]?.id ?? '' };
  });
  return reviseFinishDraftVNext(value, { ...value, ...work, selections });
}

export function readyFinishMeasurement(draft: WindowFinishMeasurement): WindowFinishMeasurement {
  const value = copyDomainValue(draft);
  value.room = value.room.trim() || 'Без помещения';
  value.name = value.name.trim() || 'Отделка окна';
  if (![value.widthMm, value.heightMm, value.depthMm].every((size) => Number.isFinite(size) && size > 0)) {
    throw new Error('Введите ширину, высоту проёма и фактическую глубину — положительные числа в мм.');
  }
  if (value.selections.some((selection) => !selection.materialId)) throw new Error('Выберите настроенный материал для каждого вида отделки.');
  validateFinishMeasurement(value);
  return value;
}

/** Display calls the SAME Feature 4 selector, including explicit overrides and inclusive depth boundaries. */
export function finishMaterialFit(value: WindowFinishMeasurement, configuration: FinishConfiguration, element: FinishElement) {
  const selection = value.selections.find((selection) => selection.element === element);
  const material = configuration.materials.find((item) => item.id === selection?.materialId && item.side === value.side && item.element === element);
  const variant = material && Number.isFinite(value.depthMm) && value.depthMm > 0
    ? selectFinishWidthVariant(material.widthVariants, value.depthMm, selection?.widthVariantId) : undefined;
  return { material, variant };
}

export function setManualFinishPrice(value: WindowFinishMeasurement, rubText: string): WindowFinishMeasurement {
  const finalPriceMinor = rubInputToMinor(rubText);
  if (!Number.isSafeInteger(finalPriceMinor) || finalPriceMinor <= 0) throw new Error('Введите цену больше 0 ₽, не более двух знаков после запятой.');
  return { ...copyDomainValue(value), priceState: { mode: 'manual', finalPriceMinor, confirmation: 'confirmed' } };
}

/** Separate finish; no link model and no assumed depth. Source is never mutated. */
export function finishSeedFromBalconyBlock(value: WindowMeasurement): FinishSeed {
  if (value.windowType !== 'balconyBlock') throw new Error('Отделка из этого действия доступна для балконного блока.');
  validateGlazingMeasurement(value);
  const widthMm = value.plane.sections.reduce((sum, section) => sum + section.widthMm, 0) + value.doorWidthMm;
  if (!Number.isFinite(widthMm)) throw new Error('Слишком большая ширина отделки.');
  return { widthMm, heightMm: value.doorHeightMm, room: value.room, name: `Отделка · ${value.name}` };
}
