import type { CommercialRoundingStepRub, GlazingConfiguration } from '../configuration/vnext/types';
import { validateGlazingConfiguration } from '../configuration/vnext/validate';
import type { Material } from '../measurements/shared';
import type { AluminiumPlaneMode } from '../measurements/vnext';
import { commercialRoundMinor, moneyFromRub, sumMinor } from '../money';

/** Geometry supplies areas; pricing does not derive dimensions or opening semantics. */
export type ActiveGlazingArea = { areaM2: number } & (
  | { material: 'pvc'; hardwareId: string }
  | { material: 'aluminium'; mode: AluminiumPlaneMode }
);
export interface GlazingPricingInput {
  material: Material;
  profileId: string;
  colorId: string;
  extensions: boolean;
  connectors: boolean;
  totalAreaM2: number;
  activeAreas: readonly ActiveGlazingArea[];
}
/** RUB breakdown remains unrounded; only completed lines cross into integer money. */
export interface GlazingPriceVNext {
  baseAmount: number;
  activityAmount: number;
  colorAmount: number;
  extensionAmount: number;
  connectorAmount: number;
  subtotal: number;
  markupAmount: number;
  productPriceBeforeCommercialRounding: number;
  productPriceBeforeCommercialRoundingMinor: number;
  productPriceMinor: number;
  installationPriceBeforeCommercialRounding: number;
  installationPriceBeforeCommercialRoundingMinor: number;
  installationPriceMinor: number;
  totalMinor: number;
}

export function priceInstalledGlazingVNext(input: GlazingPricingInput, configuration: GlazingConfiguration,
  stepRub: CommercialRoundingStepRub): GlazingPriceVNext {
  validateGlazingConfiguration(configuration);
  if (!Number.isFinite(input.totalAreaM2) || input.totalAreaM2 <= 0) throw new Error('Некорректная площадь.');
  if (typeof input.extensions !== 'boolean' || typeof input.connectors !== 'boolean') throw new Error('Некорректные параметры изделия.');
  const profile = configuration.profiles.find((entry) => entry.id === input.profileId && entry.material === input.material);
  if (!profile) throw new Error('Профиль не найден или не соответствует материалу.');
  const color = configuration.colors.find((entry) => entry.id === input.colorId && entry.materials.includes(input.material));
  const colorRule = profile.colorRules.find((rule) => rule.colorId === input.colorId);
  if (!color || !colorRule) throw new Error('Цвет не найден или не настроен для профиля.');

  const rate = moneyFromRub(profile.basePricePerM2);
  const base = rate.times(input.totalAreaM2);
  let activeArea = 0;
  let activity = moneyFromRub(0);
  for (const entry of input.activeAreas) {
    if (!Number.isFinite(entry.areaM2) || entry.areaM2 <= 0 || entry.material !== input.material) throw new Error('Некорректная активная площадь.');
    activeArea += entry.areaM2;
    let percent: number;
    if (entry.material === 'pvc' && profile.material === 'pvc') {
      const hardware = configuration.hardware.find((hardware) => hardware.id === entry.hardwareId);
      const relation = profile.hardwareActivity.find((relation) => relation.hardwareId === entry.hardwareId);
      if (!hardware || !relation) throw new Error('Не настроена активность пары профиль/фурнитура.');
      percent = relation.activityPercent;
    } else if (entry.material === 'aluminium' && profile.material === 'aluminium') {
      if (entry.mode !== 'sliding' && entry.mode !== 'swing') throw new Error('Неизвестный механизм плоскости.');
      percent = entry.mode === 'sliding' ? profile.activity.slidingPercent : profile.activity.swingPercent;
    } else throw new Error('Активность несовместима с материалом.');
    activity = activity.plus(rate.times(entry.areaM2).percentage(percent));
  }
  if (!Number.isFinite(activeArea) || activeArea - input.totalAreaM2 > 32 * Number.EPSILON * input.totalAreaM2) throw new Error('Активная площадь превышает общую.');
  const colorAmount = base.percentage(colorRule.colorPercent);
  const extensions = base.percentage(input.extensions ? profile.extensionPercent : 0);
  const connectors = base.percentage(input.connectors ? profile.connectorPercent : 0);
  const subtotal = base.plus(activity).plus(colorAmount).plus(extensions).plus(connectors);
  const markup = subtotal.percentage(profile.productMarkupPercent);
  const product = subtotal.plus(markup);
  const installation = moneyFromRub(configuration.installationRatesPerM2[input.material]).times(input.totalAreaM2);
  const productPriceBeforeCommercialRoundingMinor = product.toMinor();
  const installationPriceBeforeCommercialRoundingMinor = installation.toMinor();
  // The only commercial boundaries: completed product and completed installation.
  const productPriceMinor = commercialRoundMinor(productPriceBeforeCommercialRoundingMinor, stepRub);
  const installationPriceMinor = commercialRoundMinor(installationPriceBeforeCommercialRoundingMinor, stepRub);
  return {
    baseAmount: base.toRub(), activityAmount: activity.toRub(), colorAmount: colorAmount.toRub(),
    extensionAmount: extensions.toRub(), connectorAmount: connectors.toRub(), subtotal: subtotal.toRub(), markupAmount: markup.toRub(),
    productPriceBeforeCommercialRounding: product.toRub(), productPriceBeforeCommercialRoundingMinor, productPriceMinor,
    installationPriceBeforeCommercialRounding: installation.toRub(), installationPriceBeforeCommercialRoundingMinor, installationPriceMinor,
    totalMinor: sumMinor([productPriceMinor, installationPriceMinor]),
  };
}
