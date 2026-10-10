import type { CalculatorSettings } from '../../domain/configuration/vnext/types';
import { validateCalculatorSettings } from '../../domain/configuration/vnext/validate';
import { rubInputToMinor, updateProfile } from './settings-v2';

/** A single section, fixed or fully active. Not a production measurement or price model. */
export const calibrationReference = Object.freeze({ widthMm: 1000, heightMm: 1000 });
export interface CalibrationInput {
  profileId: string;
  hardwareId: string;
  base: string;
  active?: string;
  oneSide?: string;
  twoSides?: string;
  extensions?: string;
  oneSideColorId?: string;
  twoSidesColorId?: string;
}
export interface CalibrationProposal {
  basePricePerM2: number;
  activityPercent?: number;
  activityAmountRub?: number;
  oneSidePercent?: number;
  twoSidesPercent?: number;
  extensionPercent?: number;
}
const scale = 1_000_000n;
function safeRatio(numerator: bigint, denominator: bigint): number {
  // Decimal precision only; never commercial-round quotes or configuration.
  const scaled = (2n * numerator * scale + denominator) / (2n * denominator);
  if (scaled > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Результат вне безопасного числового диапазона.');
  return Number(scaled) / Number(scale);
}
function quote(value: string, label: string): bigint {
  const minor = rubInputToMinor(value);
  if (!Number.isSafeInteger(minor) || minor <= 0) throw new Error(`${label}: введите цену больше нуля с точностью до копейки в безопасном диапазоне.`);
  return BigInt(minor);
}
function target(settings: CalculatorSettings, input: CalibrationInput) {
  const profile = settings.glazing.profiles.find((p) => p.id === input.profileId && p.material === 'pvc' && p.status === 'active');
  if (!profile || profile.material !== 'pvc') throw new Error('Выберите доступный профиль ПВХ.');
  if (!profile.hardwareActivity.some((r) => r.hardwareId === input.hardwareId)
    || !settings.glazing.hardware.some((h) => h.id === input.hardwareId && h.material === 'pvc' && h.status === 'active')) {
    throw new Error('Выберите фурнитуру, настроенную для выбранного профиля.');
  }
  if (!profile.colorRules.some((r) => r.colorPercent === 0 && settings.glazing.colors.some((c) =>
    c.id === r.colorId && c.status === 'active' && c.materials.includes('pvc') && c.lamination === 'none'))) {
    throw new Error('Для сравнения нужен цвет без ламинации с нулевой надбавкой в этом профиле. Настройте его перед калибровкой.');
  }
  return profile;
}
function colorTarget(settings: CalculatorSettings, input: CalibrationInput, id: string | undefined, lamination: 'one_side' | 'two_sides') {
  const profile = target(settings, input);
  if (!profile.colorRules.some((r) => r.colorId === id) || !settings.glazing.colors.some((c) =>
    c.id === id && c.status === 'active' && c.materials.includes('pvc') && c.lamination === lamination)) {
    throw new Error('Выберите соответствующий вариант ламинации, настроенный для профиля.');
  }
}
/** Reverse coefficient derivation only. Normal calculations still use Feature 3. */
export function proposeCalibration(settings: CalculatorSettings, input: CalibrationInput): CalibrationProposal {
  target(settings, input);
  const base = quote(input.base, 'Цена глухого белого изделия');
  const areaMm2 = BigInt(calibrationReference.widthMm) * BigInt(calibrationReference.heightMm);
  const activeAreaMm2 = areaMm2; // the active reference is fully active, same dimensions
  // base RUB/m² = base quote RUB / reference total area m².
  const proposal: CalibrationProposal = { basePricePerM2: safeRatio(base * 1_000_000n, 100n * areaMm2) };
  const option = (value: string | undefined, label: string, active = false): number | undefined => {
    if (value === undefined || value.trim() === '') return undefined;
    const amount = quote(value, label);
    if (amount < base) throw new Error(`${label}: цена ниже базовой. Отрицательная наценка недопустима; проверьте, что менялась только одна опция.`);
    // (option - base) / (basePricePerM2 × applicable area) × 100.
    // Substitute base / totalArea for the rate to retain exact integer arithmetic.
    return safeRatio((amount - base) * 100n * areaMm2, base * (active ? activeAreaMm2 : areaMm2));
  };
  const activity = option(input.active, 'Открывающаяся часть', true);
  if (activity !== undefined) {
    proposal.activityPercent = activity;
    proposal.activityAmountRub = Number(quote(input.active!, 'Открывающаяся часть') - base) / 100;
  }
  const one = option(input.oneSide, 'Ламинация с одной стороны');
  if (one !== undefined) { colorTarget(settings, input, input.oneSideColorId, 'one_side'); proposal.oneSidePercent = one; }
  const two = option(input.twoSides, 'Ламинация с двух сторон');
  if (two !== undefined) { colorTarget(settings, input, input.twoSidesColorId, 'two_sides'); proposal.twoSidesPercent = two; }
  const extensions = option(input.extensions, 'Доборы');
  if (extensions !== undefined) proposal.extensionPercent = extensions;
  validateCalculatorSettings(withProposal(settings, input, proposal));
  return proposal;
}
function withProposal(settings: CalculatorSettings, input: CalibrationInput, proposal: CalibrationProposal): CalculatorSettings {
  const profile = target(settings, input);
  return updateProfile(settings, { ...profile, basePricePerM2: proposal.basePricePerM2,
    ...(proposal.extensionPercent !== undefined ? { extensionPercent: proposal.extensionPercent } : {}),
    hardwareActivity: profile.hardwareActivity.map((r) => r.hardwareId === input.hardwareId && proposal.activityPercent !== undefined
      ? { ...r, activityPercent: proposal.activityPercent } : r),
    colorRules: profile.colorRules.map((r) => r.colorId === input.oneSideColorId && proposal.oneSidePercent !== undefined
      ? { ...r, colorPercent: proposal.oneSidePercent } : r.colorId === input.twoSidesColorId && proposal.twoSidesPercent !== undefined
        ? { ...r, colorPercent: proposal.twoSidesPercent } : r),
  });
}
/** Explicit draft command, with revalidation against current settings; no I/O or confirmation. */
export function applyCalibration(settings: CalculatorSettings, input: CalibrationInput): CalculatorSettings {
  return withProposal(settings, input, proposeCalibration(settings, input));
}
