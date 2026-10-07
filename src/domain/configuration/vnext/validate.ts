import { validateWorkPrice } from '../../works/vnext';
import type { CalculatorSettings, CatalogEntry, FinishConfiguration, GlazingConfiguration } from './types';

export function nonnegative(value: number): void {
  if (!Number.isFinite(value) || value < 0) throw new Error('Ожидается конечное неотрицательное число.');
}
export function positive(value: number): void {
  nonnegative(value);
  if (value === 0) throw new Error('Ожидается положительное число.');
}
export function uniqueIds(items: readonly { id: string }[]): void {
  const ids = new Set<string>();
  for (const item of items) {
    if (typeof item.id !== 'string' || !item.id.trim() || ids.has(item.id)) throw new Error('ID должны быть непустыми и уникальными внутри списка.');
    ids.add(item.id);
  }
}
function catalog(items: readonly CatalogEntry[]): void {
  uniqueIds(items);
  for (const item of items) {
    if (!item.name.trim() || !['active', 'hidden'].includes(item.status)) throw new Error('Некорректный элемент каталога.');
  }
}
function forbid(value: object, keys: readonly string[]): void {
  if (keys.some((key) => Object.hasOwn(value, key))) throw new Error('Параметр прежней модели запрещён в vNext.');
}
export function validateGlazingConfiguration(value: GlazingConfiguration): void {
  if (value.currency !== 'RUB') throw new Error('Неизвестная валюта.');
  catalog(value.profiles); catalog(value.hardware); catalog(value.colors);
  nonnegative(value.installationRatesPerM2.pvc); nonnegative(value.installationRatesPerM2.aluminium);
  for (const hardware of value.hardware) if (hardware.material !== 'pvc') throw new Error('Фурнитура vNext предназначена для ПВХ.');
  for (const color of value.colors) {
    if (!['none', 'one_side', 'two_sides'].includes(color.lamination) || color.materials.length === 0
      || new Set(color.materials).size !== color.materials.length
      || color.materials.some((material) => !['pvc', 'aluminium'].includes(material))) throw new Error('Некорректный цвет.');
  }
  for (const profile of value.profiles) {
    forbid(profile, ['installationRatePerM2', 'activityPercent']);
    [profile.basePricePerM2, profile.extensionPercent, profile.connectorPercent, profile.productMarkupPercent].forEach(nonnegative);
    uniqueIds(profile.colorRules.map((rule) => ({ id: rule.colorId })));
    for (const rule of profile.colorRules) {
      nonnegative(rule.colorPercent);
      if (!value.colors.some((color) => color.id === rule.colorId && color.materials.includes(profile.material))) throw new Error('Несовместимый цвет профиля.');
    }
    if (profile.material === 'pvc') {
      forbid(profile, ['activity']);
      uniqueIds(profile.hardwareActivity.map((relation) => ({ id: relation.hardwareId })));
      for (const relation of profile.hardwareActivity) {
        nonnegative(relation.activityPercent);
        if (!value.hardware.some((hardware) => hardware.id === relation.hardwareId && hardware.material === profile.material)) throw new Error('Несовместимая фурнитура профиля.');
      }
    } else if (profile.material === 'aluminium') {
      forbid(profile, ['hardwareActivity']);
      nonnegative(profile.activity.slidingPercent); nonnegative(profile.activity.swingPercent);
    } else throw new Error('Неизвестный материал профиля.');
  }
}
export const finishWorkTypes = ['interiorSlopes', 'interiorSlopesAndSill', 'sillOnly', 'exteriorSlopes', 'exteriorSlopesAndDrip', 'dripOnly'] as const;
export function validateFinishConfiguration(value: FinishConfiguration): void {
  if (value.currency !== 'RUB' || value.reservePercent !== 20) throw new Error('Запас отделки фиксирован: 20%.');
  forbid(value, ['wastePercent', 'purchaseStepMm', 'purchaseStep', 'materialMarkupPercent']);
  catalog(value.materials);
  nonnegative(value.finishMarkupPercent);
  finishWorkTypes.forEach((type) => nonnegative(value.baseInstallerPayByWorkType[type]));
  for (const element of ['slope', 'sill', 'drip'] as const) {
    const allowance = value.allowances[element];
    nonnegative(allowance.lengthMm); nonnegative(allowance.depthMm);
  }
  for (const material of value.materials) {
    forbid(material, ['purchaseStepMm', 'purchaseStep', 'materialMarkupPercent', 'wastePercent', 'sizing', 'pricing']);
    if (!['interior', 'exterior'].includes(material.side) || !['slope', 'sill', 'drip'].includes(material.element)
      || (material.element === 'sill' && material.side !== 'interior')
      || (material.element === 'drip' && material.side !== 'exterior')) throw new Error('Несовместимый вид отделки.');
    nonnegative(material.installerRatePerRunningMeter);
    uniqueIds(material.widthVariants);
    if (!material.widthVariants.length) throw new Error('Нужен вариант ширины материала.');
    for (const variant of material.widthVariants) {
      forbid(variant, ['purchaseStepMm', 'purchaseStep', 'materialMarkupPercent', 'wastePercent']);
      positive(variant.physicalWidthMm); positive(variant.maxUsableActualDepthMm);
      nonnegative(variant.purchaseCostPerRunningMeter);
    }
  }
}
export function validateCalculatorSettings(value: CalculatorSettings): void {
  if (value.schemaVersion !== 2) throw new Error('Неизвестная версия настроек.');
  validateGlazingConfiguration(value.glazing); validateFinishConfiguration(value.finish);
  catalog(value.additionalWorks); value.additionalWorks.forEach(validateWorkPrice);
  if (![10, 50, 100].includes(value.commercialRoundingStepRub)) throw new Error('Неизвестный шаг округления.');
  if (!['starter', 'custom'].includes(value.example.origin) || typeof value.example.containsExamplePrices !== 'boolean'
    || typeof value.pricesConfirmed !== 'boolean') throw new Error('Некорректные метаданные примерных цен.');
  const defaults = value.defaults;
  if (!['pvc', 'aluminium'].includes(defaults.material)) throw new Error('Неизвестный материал по умолчанию.');
  const pvc = value.glazing.profiles.find((profile) => profile.id === defaults.pvcProfileId && profile.status === 'active' && profile.material === 'pvc');
  const aluminium = value.glazing.profiles.find((profile) => profile.id === defaults.aluminiumSystemId && profile.status === 'active' && profile.material === 'aluminium');
  const hardware = value.glazing.hardware.find((entry) => entry.id === defaults.hardwareId && entry.status === 'active');
  const color = value.glazing.colors.find((entry) => entry.id === defaults.colorId && entry.status === 'active' && entry.materials.includes(defaults.material));
  if (!pvc || pvc.material !== 'pvc' || !aluminium || !hardware || !color
    || !pvc.hardwareActivity.some((relation) => relation.hardwareId === hardware.id)
    || !(defaults.material === 'pvc' ? pvc : aluminium).colorRules.some((rule) => rule.colorId === color.id)) throw new Error('Default отсутствует, скрыт или несовместим.');
}
