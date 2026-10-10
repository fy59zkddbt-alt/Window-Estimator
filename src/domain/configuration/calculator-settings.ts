import type { ProfileConfiguration, UserConfiguration } from './types';
import type { FinishConfiguration } from './finish-types';
import { normalizeFinishMaterial } from './normalize-finish';
import { demoConfiguration } from './demo-configuration';
import { demoFinishConfiguration } from './demo-finish-configuration';
import { copyCalculatorSettings as copyV2 } from './vnext/settings';
import type { CalculatorSettings as SettingsV2 } from './vnext/types';

export interface CalculatorSettings {
  schemaVersion: 1;
  /** Staged vNext settings; legacy editor rates remain unchanged until Feature 7. */
  settingsV2?: SettingsV2;
  glazing: Omit<UserConfiguration, 'profiles'> & {
    profiles: readonly (ProfileConfiguration & { installationRatePerM2: number })[];
  };
  finish: FinishConfiguration;
}

/** Each call returns independent defaults. Illustrative rates must be reviewed by the user. */
export function createDefaultCalculatorSettings(): CalculatorSettings {
  return copyCalculatorSettings({ schemaVersion: 1,
    glazing: { ...demoConfiguration, profiles: demoConfiguration.profiles.map((profile) => ({ ...profile, installationRatePerM2: 0 })) },
    finish: demoFinishConfiguration,
  });
}

function identities(items: readonly { id: string; name: string }[]): void {
  const ids = new Set<string>();
  for (const item of items) {
    if (!item.id.trim() || !item.name.trim()) throw new Error('Укажите ID и название.');
    if (ids.has(item.id)) throw new Error('ID должны быть уникальными внутри списка.');
    ids.add(item.id);
  }
}

export function validateCalculatorSettings(settings: CalculatorSettings): void {
  if (settings.settingsV2 !== undefined) copyV2(settings.settingsV2);
  if (settings.schemaVersion !== 1 || settings.glazing.currency !== 'RUB' || settings.finish.currency !== 'RUB') throw new Error('Неизвестный формат настроек.');
  identities(settings.glazing.profiles);
  identities(settings.glazing.hardware);
  identities(settings.finish.materials);
  for (const profile of settings.glazing.profiles) {
    if (!['pvc', 'aluminium'].includes(profile.material)) throw new Error('Неизвестный материал профиля.');
    const values = [profile.basePricePerM2, profile.activityPercent, profile.laminateOneSidePercent,
      profile.laminateTwoSidesPercent, profile.productMarkupPercent, profile.installationRatePerM2];
    if (values.some((value) => !Number.isFinite(value) || value < 0)) throw new Error('Цены и проценты должны быть конечными числами не меньше нуля.');
  }
  for (const hardware of settings.glazing.hardware) {
    if (!['pvc', 'aluminium'].includes(hardware.material)) throw new Error('Неизвестный материал фурнитуры.');
  }
  for (const material of ['pvc', 'aluminium']) {
    if (!settings.glazing.profiles.some((item) => item.material === material) || !settings.glazing.hardware.some((item) => item.material === material)) throw new Error('Оставьте хотя бы один профиль и фурнитуру для ПВХ и алюминия.');
  }
  settings.finish.materials.forEach(normalizeFinishMaterial);
  for (const type of ['slope', 'sill']) {
    if (!settings.finish.materials.some((item) => item.finishType === type)) throw new Error('Оставьте хотя бы один материал откосов и подоконника.');
  }
}

export function copyCalculatorSettings(settings: CalculatorSettings): CalculatorSettings {
  validateCalculatorSettings(settings);
  return { schemaVersion: 1,
    ...(settings.settingsV2 === undefined ? {} : { settingsV2: copyV2(settings.settingsV2) }),
    glazing: { currency: 'RUB', profiles: settings.glazing.profiles.map((item) => ({ ...item })), hardware: settings.glazing.hardware.map((item) => ({ ...item })) },
    finish: { currency: 'RUB', materials: settings.finish.materials.map((item) => ({ ...item, sizing: { ...item.sizing },
      pricing: item.pricing.mode === 'simple'
        ? { ...item.pricing, ...(item.pricing.depthBands ? { depthBands: item.pricing.depthBands.map((band) => ({ ...band })) } : {}) }
        : { ...item.pricing, ...(item.pricing.depthBands ? { depthBands: item.pricing.depthBands.map((band) => ({ ...band })) } : {}) },
    })) },
  };
}
