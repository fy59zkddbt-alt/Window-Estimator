import type { CalculatorSettings as LegacySettings } from './calculator-settings';
import type { CalculatorSettings, ProfileConfiguration, FinishMaterialConfiguration } from '../../domain/configuration/vnext/types';
import type { AdditionalWorkCatalogEntry } from '../../domain/works/vnext';
import { copyDomainValue } from '../../domain/configuration/vnext/copy';
import { copyCalculatorSettings, createStarterCalculatorSettings, confirmExamplePrices } from '../../domain/configuration/vnext/settings';
export { validateCalculatorSettings } from '../../domain/configuration/vnext/validate';
export { confirmExamplePrices };

/** Opening a form never writes defaults or replaces an existing user catalog. */
export function openSettingsV2(value: LegacySettings): CalculatorSettings {
  return value.settingsV2 ? copyCalculatorSettings(value.settingsV2) : createStarterCalculatorSettings();
}
/** Preserve production v1 rates and use the existing owned, revision-checked repository. */
export function stageSettingsV2(value: LegacySettings, next: CalculatorSettings): LegacySettings {
  return { ...value, settingsV2: copyCalculatorSettings(next) };
}
export function updateProfile(settings: CalculatorSettings, profile: ProfileConfiguration): CalculatorSettings {
  return { ...settings, glazing: { ...settings.glazing,
    profiles: settings.glazing.profiles.map((item) => item.id === profile.id ? profile : item) } };
}
export function duplicateProfile(settings: CalculatorSettings, material: 'pvc' | 'aluminium', id: string): CalculatorSettings {
  const source = settings.glazing.profiles.find((profile) => profile.material === material);
  if (!source || !id.trim() || settings.glazing.profiles.some((profile) => profile.id === id)) throw new Error('Нельзя создать профиль.');
  return { ...settings, glazing: { ...settings.glazing, profiles: [...settings.glazing.profiles,
    { ...copyDomainValue(source), id, name: 'Новый профиль' }] } };
}
export function updateInstallation(settings: CalculatorSettings, material: 'pvc' | 'aluminium', rate: number): CalculatorSettings {
  return { ...settings, glazing: { ...settings.glazing, installationRatesPerM2: { ...settings.glazing.installationRatesPerM2, [material]: rate } } };
}
export function updateFinishMaterial(settings: CalculatorSettings, material: FinishMaterialConfiguration): CalculatorSettings {
  return { ...settings, finish: { ...settings.finish, materials: settings.finish.materials.map((item) => item.id === material.id ? material : item) } };
}
export function putWork(settings: CalculatorSettings, work: AdditionalWorkCatalogEntry): CalculatorSettings {
  return { ...settings, additionalWorks: settings.additionalWorks.some((item) => item.id === work.id)
    ? settings.additionalWorks.map((item) => item.id === work.id ? work : item) : [...settings.additionalWorks, work] };
}
export function removeWork(settings: CalculatorSettings, id: string): CalculatorSettings {
  return { ...settings, additionalWorks: settings.additionalWorks.filter((item) => item.id !== id) };
}
/** Confirmation is an explicit command; failures never produce a confirmed local result. */
export async function persistSettingsV2(settings: CalculatorSettings, confirm: boolean, save: (value: CalculatorSettings) => Promise<void>): Promise<CalculatorSettings> {
  const next = confirm ? confirmExamplePrices(settings) : copyCalculatorSettings(settings);
  await save(next);
  return next;
}
export function updateHardwareActivity(settings: CalculatorSettings, profileId: string, hardwareId: string, activityPercent: number): CalculatorSettings {
  const profile = settings.glazing.profiles.find((item) => item.id === profileId);
  if (!profile || profile.material !== 'pvc') throw new Error('Профиль ПВХ не найден.');
  return updateProfile(settings, { ...profile, hardwareActivity: profile.hardwareActivity.some((item) => item.hardwareId === hardwareId)
    ? profile.hardwareActivity.map((item) => item.hardwareId === hardwareId ? { ...item, activityPercent } : item)
    : [...profile.hardwareActivity, { hardwareId, activityPercent }] });
}
/** Input conversion only; reject fractional kopecks instead of silently rounding them. */
export function rubInputToMinor(value: string): number {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return NaN;
  const minor = BigInt(match[1]!) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
  return minor <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(minor) : NaN;
}
