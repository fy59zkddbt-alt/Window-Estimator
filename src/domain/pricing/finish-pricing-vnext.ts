import type { CommercialRoundingStepRub, FinishConfiguration, FinishWidthVariant, FinishWork } from '../configuration/vnext/types';
import { FINISH_RESERVE_PERCENT } from '../configuration/vnext/types';
import { positive, validateFinishConfiguration } from '../configuration/vnext/validate';
import type { FinishGeometryVNext } from '../geometry/finish-geometry-vnext';
import type { FinishPriceState } from '../measurements/vnext';
import { assertMinor, commercialRoundMinor, moneyFromRub } from '../money';

export type FinishPriceVNext =
  | { priceState: Extract<FinishPriceState, { mode: 'automatic' }>; materialCost: number; materialsWithReserve: number;
      installerSalary: number; costBasis: number; finishPriceBeforeCommercialRounding: number;
      finishPriceBeforeCommercialRoundingMinor: number; clientFinishPriceMinor: number;
      selectedVariants: readonly { element: string; materialId: string; widthVariantId: string }[] }
  | { priceState: Extract<FinishPriceState, { mode: 'priceRequiresClarification' }>; clientFinishPriceMinor: null }
  | { priceState: Extract<FinishPriceState, { mode: 'manual' }>; clientFinishPriceMinor: number | null };

/** Inclusive actual-depth fit; narrowest physical width, then usable depth, then ID. */
export function selectFinishWidthVariant(variants: readonly FinishWidthVariant[], actualDepthMm: number,
  overrideId?: string): FinishWidthVariant | undefined {
  positive(actualDepthMm);
  const fitting = variants.filter((variant) => variant.maxUsableActualDepthMm >= actualDepthMm);
  if (overrideId !== undefined) return fitting.find((variant) => variant.id === overrideId);
  return [...fitting].sort((a, b) => a.physicalWidthMm - b.physicalWidthMm
    || a.maxUsableActualDepthMm - b.maxUsableActualDepthMm || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
}

/** Accepts ready geometry; exact money expressions retain fractional kopecks until the final boundary. */
export function priceFinishVNext(geometry: FinishGeometryVNext, work: FinishWork, state: FinishPriceState,
  configuration: FinishConfiguration, stepRub: CommercialRoundingStepRub): FinishPriceVNext {
  validateFinishConfiguration(configuration);
  if (![10, 50, 100].includes(stepRub)) throw new Error('Неизвестный шаг округления.');
  if (state.mode === 'manual') {
    assertMinor(state.finalPriceMinor);
    if (state.finalPriceMinor === 0 || !['confirmed', 'needsConfirmation'].includes(state.confirmation)) throw new Error('Некорректная ручная цена отделки.');
    return { priceState: { ...state }, clientFinishPriceMinor: state.confirmation === 'confirmed' ? state.finalPriceMinor : null };
  }
  let materialCost = moneyFromRub(0);
  let installerSalary = moneyFromRub(configuration.baseInstallerPayByWorkType[work.workType]);
  const selectedVariants = [];
  for (const element of geometry.elements) {
    positive(element.calculatedMaterialQuantityM); positive(element.installedLengthM);
    const material = configuration.materials.find((entry) => entry.id === element.materialId);
    if (!material || material.side !== work.side || material.element !== element.element) throw new Error('Материал не соответствует виду отделки.');
    const variant = selectFinishWidthVariant(material.widthVariants, element.actualDepthMm, element.widthVariantId);
    if (!variant) return { priceState: { mode: 'priceRequiresClarification',
      reason: `Для глубины ${element.actualDepthMm} мм нет подходящего варианта материала «${material.name}».` }, clientFinishPriceMinor: null };
    selectedVariants.push({ element: element.element, materialId: material.id, widthVariantId: variant.id });
    materialCost = materialCost.plus(moneyFromRub(variant.purchaseCostPerRunningMeter).times(element.calculatedMaterialQuantityM));
    installerSalary = installerSalary.plus(moneyFromRub(material.installerRatePerRunningMeter).times(element.installedLengthM));
  }
  const materialsWithReserve = materialCost.plus(materialCost.percentage(FINISH_RESERVE_PERCENT));
  const costBasis = materialsWithReserve.plus(installerSalary);
  const final = costBasis.plus(costBasis.percentage(configuration.finishMarkupPercent));
  const finishPriceBeforeCommercialRoundingMinor = final.toMinor();
  return { priceState: { mode: 'automatic' }, materialCost: materialCost.toRub(), materialsWithReserve: materialsWithReserve.toRub(),
    installerSalary: installerSalary.toRub(), costBasis: costBasis.toRub(), finishPriceBeforeCommercialRounding: final.toRub(),
    finishPriceBeforeCommercialRoundingMinor, clientFinishPriceMinor: commercialRoundMinor(finishPriceBeforeCommercialRoundingMinor, stepRub), selectedVariants };
}
