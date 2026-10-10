import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { createStarterCalculatorSettings } from '../src/domain/configuration/vnext/settings';
import { applyCalibration, proposeCalibration, calibrationReference, type CalibrationInput } from '../src/application/settings/price-calibration';
import { duplicateProfile, persistSettingsV2, stageSettingsV2, openSettingsV2 } from '../src/application/settings/settings-v2';
import { createDefaultCalculatorSettings } from '../src/domain/configuration/calculator-settings';
import { SettingsV2Form } from '../src/ui/SettingsV2Form';
import { PriceCalibrationAssistant } from '../src/ui/PriceCalibrationAssistant';

const input: CalibrationInput = { profileId: 'pvc-standard', hardwareId: 'standard', base: '5700', active: '12825',
  oneSide: '6270', twoSides: '7125', extensions: '6840', oneSideColorId: 'laminated', twoSidesColorId: 'laminated-two' };
const pvc = (settings = createStarterCalculatorSettings()) => {
  const p = settings.glazing.profiles[0]!;
  if (p.material !== 'pvc') throw new Error('fixture');
  return p;
};
describe('Feature 7 coefficient calibration', () => {
  it('offers calibration from PVC settings and requires hardware selection', () => {
    const settings = createStarterCalculatorSettings();
    const html = renderToStaticMarkup(<SettingsV2Form initial={settings} onSave={async () => {}} onClose={() => {}} />);
    expect(html.match(/Помочь настроить цены/g)).toHaveLength(1);
    const assistant = renderToStaticMarkup(<PriceCalibrationAssistant settings={settings} initialProfileId="pvc-standard" onApply={() => {}} onCancel={() => {}} />);
    expect(assistant).toContain('Профиль ПВХ'); expect(assistant).toContain('Выберите фурнитуру');
    expect(assistant).toContain('Mako'); expect(assistant).toContain('Премиум');
    expect(assistant).toContain('disabled=""'); expect(assistant).toContain('1000×1000');
  });
  it('derives base, activity and independent option percentages using a fully active 1 m² reference', () => {
    expect(calibrationReference.widthMm * calibrationReference.heightMm / 1e6).toBe(1);
    expect(proposeCalibration(createStarterCalculatorSettings(), input)).toEqual({ basePricePerM2: 5700,
      activityPercent: 125, activityAmountRub: 7125, oneSidePercent: 10, twoSidesPercent: 25, extensionPercent: 20 });
  });
  it('changes only explicitly calibrated profile fields and the selected hardware relation, immutably', () => {
    const initial = duplicateProfile(createStarterCalculatorSettings(), 'pvc', 'other');
    const original = structuredClone(initial);
    const next = applyCalibration(initial, { ...input, base: '5000', active: '10000', oneSide: '5500', twoSides: '6500', extensions: '7000' });
    expect(pvc(next)).toMatchObject({ basePricePerM2: 5000, extensionPercent: 40,
      hardwareActivity: [{ hardwareId: 'standard', activityPercent: 100 }, { hardwareId: 'premium', activityPercent: 30 }],
      colorRules: [{ colorId: 'white', colorPercent: 0 }, { colorId: 'laminated', colorPercent: 10 }, { colorId: 'laminated-two', colorPercent: 30 }] });
    expect(next).toEqual({ ...original, glazing: { ...original.glazing, profiles: [pvc(next), ...original.glazing.profiles.slice(1)] } });
    expect(pvc(next).productMarkupPercent).toBe(40); expect(pvc(next).connectorPercent).toBe(5);
    expect(initial).toEqual(original);
  });
  it('recalibrates another hardware without overwriting the previous relation', () => {
    const first = applyCalibration(createStarterCalculatorSettings(), input);
    const next = applyCalibration(first, { profileId: input.profileId, hardwareId: 'premium', base: '5700', active: '17100' });
    expect(pvc(next).hardwareActivity).toEqual([{ hardwareId: 'standard', activityPercent: 125 }, { hardwareId: 'premium', activityPercent: 200 }]);
  });
  it('selects another PVC profile without changing the first', () => {
    const initial = duplicateProfile(createStarterCalculatorSettings(), 'pvc', 'other');
    const next = applyCalibration(initial, { ...input, profileId: 'other', base: '4000' });
    expect(pvc(next)).toEqual(pvc(initial)); expect(next.glazing.profiles.at(-1)!.basePricePerM2).toBe(4000);
  });
  it('leaves absent optional values unchanged, including all hardware', () => {
    const initial = createStarterCalculatorSettings();
    const next = applyCalibration(initial, { profileId: input.profileId, hardwareId: input.hardwareId, base: '6000', active: ' ', extensions: '' });
    expect(pvc(next)).toEqual({ ...pvc(initial), basePricePerM2: 6000 });
  });
  it('updates only the selected lamination variant without conflating catalog colors', () => {
    const settings = createStarterCalculatorSettings();
    settings.glazing.colors = [...settings.glazing.colors, { id: 'other-one-side', name: 'Другой цвет',
      status: 'active', materials: ['pvc'], lamination: 'one_side' }];
    pvc(settings).colorRules = [...pvc(settings).colorRules, { colorId: 'other-one-side', colorPercent: 75 }];
    const next = applyCalibration(settings, { ...input, oneSide: '7410', oneSideColorId: 'other-one-side' });
    expect(pvc(next).colorRules).toEqual([{ colorId: 'white', colorPercent: 0 }, { colorId: 'laminated', colorPercent: 10 },
      { colorId: 'laminated-two', colorPercent: 25 }, { colorId: 'other-one-side', colorPercent: 30 }]);
    expect(settings.glazing.colors).toEqual(next.glazing.colors);
  });
  it('does not mutate on proposal; Apply has no persistence, ordinary save does not confirm', async () => {
    const settings = createStarterCalculatorSettings(); const original = structuredClone(settings); const save = vi.fn(async () => {});
    proposeCalibration(settings, input); expect(settings).toEqual(original);
    const next = applyCalibration(settings, input); expect(save).not.toHaveBeenCalled(); expect(next.pricesConfirmed).toBe(false);
    await persistSettingsV2(next, false, save); expect(save).toHaveBeenCalledOnce(); expect(next.pricesConfirmed).toBe(false);
    const confirmed = await persistSettingsV2(next, true, save); expect(confirmed.pricesConfirmed).toBe(true);
    expect(applyCalibration(confirmed, input).pricesConfirmed).toBe(true);
    const staged = stageSettingsV2(createDefaultCalculatorSettings(), next);
    expect(openSettingsV2(staged)).toEqual(next);
  });
  it.each(['0', '-1', 'NaN', 'Infinity', '1e309', '9007199254740992', '1.001', ''])('rejects invalid base %s', (base) => {
    expect(() => proposeCalibration(createStarterCalculatorSettings(), { ...input, base })).toThrow('цену больше нуля');
  });
  it.each(['active', 'oneSide', 'twoSides', 'extensions'] as const)('rejects negative implied %s markup and invalid optional prices', (key) => {
    for (const value of ['5699', '0', '-1', 'NaN', 'Infinity', '9007199254740992']) {
      expect(() => proposeCalibration(createStarterCalculatorSettings(), { ...input, [key]: value })).toThrow();
    }
  });
  it.each([{ profileId: 'missing' }, { profileId: 'aluminium-example' }, { hardwareId: 'missing' }, { oneSideColorId: 'laminated-two' }, { twoSidesColorId: 'white' }])('rejects incompatible target %j', (patch) => {
    expect(() => proposeCalibration(createStarterCalculatorSettings(), { ...input, ...patch })).toThrow();
  });
  it('rejects hardware outside the selected profile and reference without a zero-markup plain color', () => {
    const settings = createStarterCalculatorSettings();
    pvc(settings).hardwareActivity = pvc(settings).hardwareActivity.filter((r) => r.hardwareId !== 'premium');
    expect(() => proposeCalibration(settings, { ...input, hardwareId: 'premium' })).toThrow('фурнитуру');
    pvc(settings).colorRules = pvc(settings).colorRules.map((r) => ({ ...r, colorPercent: 5 }));
    expect(() => proposeCalibration(settings, input)).toThrow('нулевой надбавкой');
  });
  it('rounds decimal percentages half-up at six places without commercial rounding', () => {
    const settings = createStarterCalculatorSettings();
    expect(proposeCalibration(settings, { profileId: input.profileId, hardwareId: input.hardwareId, base: '3', active: '4' }).activityPercent).toBe(33.333333);
    expect(proposeCalibration(settings, { profileId: input.profileId, hardwareId: input.hardwareId, base: '512', active: '512.01' }).activityPercent).toBe(0.001953);
    expect(proposeCalibration(settings, { profileId: input.profileId, hardwareId: input.hardwareId, base: '512', active: '512.03' }).activityPercent).toBe(0.005859);
    expect(proposeCalibration(settings, { profileId: input.profileId, hardwareId: input.hardwareId, base: '128', active: '128.01' }).activityPercent).toBe(0.007813);
    settings.commercialRoundingStepRub = 10;
    const first = proposeCalibration(settings, { ...input, base: '5700,29' });
    settings.commercialRoundingStepRub = 100;
    expect(proposeCalibration(settings, { ...input, base: '5700,29' })).toEqual(first);
    expect(first.basePricePerM2).toBe(5700.29);
    expect(() => proposeCalibration(settings, { ...input, base: '0.01', active: '90071992547409.91' })).toThrow('безопасного');
  });
  it('validates the resulting canonical settings and never introduces an engine or storage path', () => {
    const invalid = createStarterCalculatorSettings(); invalid.finish.finishMarkupPercent = NaN;
    expect(() => applyCalibration(invalid, input)).toThrow();
    const source = readFileSync('src/application/settings/price-calibration.ts', 'utf8');
    expect(source).not.toMatch(/commercialRoundMinor|pricingMode|quickPrice|localStorage|infrastructure|priceInstalledGlazing/);
    expect(Object.keys(applyCalibration(createStarterCalculatorSettings(), input))).toEqual(Object.keys(createStarterCalculatorSettings()));
  });
});
