import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { SettingsV2Form } from '../src/ui/SettingsV2Form';
import { SettingsScreen } from '../src/ui/SettingsScreen';
import { percentageHint, productMarkupExplanation } from '../src/ui/settings-hints';
import { createDefaultCalculatorSettings, copyCalculatorSettings } from '../src/domain/configuration/calculator-settings';
import { createStarterCalculatorSettings } from '../src/domain/configuration/vnext/settings';
import { duplicateProfile, openSettingsV2, persistSettingsV2, putWork, removeWork, rubInputToMinor, stageSettingsV2,
  updateFinishMaterial, updateHardwareActivity, updateInstallation, updateProfile, validateCalculatorSettings } from '../src/application/settings/settings-v2';
import type { CalculatorSettings } from '../src/domain/configuration/vnext/types';
import { createAdditionalWorkSnapshot } from '../src/domain/works/vnext';
import { priceInstalledGlazingVNext } from '../src/domain/pricing/glazing-pricing-vnext';

const noop = () => {};
const save = async () => {};
function render(settings = createStarterCalculatorSettings()) {
  return renderToStaticMarkup(<SettingsV2Form initial={settings} onSave={save} onClose={noop} />);
}
function pvc(settings: CalculatorSettings) {
  const profile = settings.glazing.profiles[0]!;
  if (profile.material !== 'pvc') throw new Error('fixture');
  return profile;
}

describe('Feature 6 settings state and disclosure', () => {
  it('renders the existing route with vNext cards, primary fields and collapsed additional settings', () => {
    const html = renderToStaticMarkup(<SettingsScreen initial={createDefaultCalculatorSettings()} onSave={save} onClose={noop} />);
    for (const text of ['Настройки расчёта', 'Остекление ПВХ', 'VEKA Softline 70', 'Mako', 'Базовая стоимость',
      'Алюминиевое остекление', 'Отделка', 'Дополнительные работы', 'Общие настройки расчёта']) expect(html).toContain(text);
    expect(html).toContain('<details><summary>Дополнительные параметры');
    expect(html).not.toContain('<details open');
    expect(html).not.toContain('<table');
    expect(html.indexOf('Базовая стоимость')).toBeLessThan(html.indexOf('<details>'));
  });
  it('edits the profile base independently and updates its activity hint', () => {
    const initial = createStarterCalculatorSettings();
    const next = updateProfile(initial, { ...pvc(initial), basePricePerM2: 6000 });
    expect(pvc(initial).basePricePerM2).toBe(5700);
    expect(pvc(next).basePricePerM2).toBe(6000);
    expect(render(next)).toContain('7 500 ₽');
    expect(render(initial)).toContain('7 125 ₽');
  });
  it('edits Profile × Hardware without mutating another profile or relation', () => {
    const initial = duplicateProfile(createStarterCalculatorSettings(), 'pvc', 'other');
    const next = updateHardwareActivity(initial, 'pvc-standard', 'standard', 150);
    expect(pvc(initial).hardwareActivity[0]!.activityPercent).toBe(125);
    expect(pvc(next).hardwareActivity.map((r) => r.activityPercent)).toEqual([150, 30]);
    expect(next.glazing.profiles[2]).toEqual(initial.glazing.profiles[2]);
    expect(next.glazing.profiles[2]).not.toBe(initial.glazing.profiles[0]);
    expect(render(next)).toContain('8 550 ₽');
  });
  it('adds another hardware relation to a profile independently', () => {
    const initial = createStarterCalculatorSettings();
    initial.glazing.hardware = [...initial.glazing.hardware, { id: 'new', name: 'Roto', material: 'pvc', status: 'active' }];
    const next = updateHardwareActivity(initial, pvc(initial).id, 'new', 75);
    validateCalculatorSettings(next);
    expect(pvc(next).hardwareActivity.at(-1)).toEqual({ hardwareId: 'new', activityPercent: 75 });
    expect(pvc(initial).hardwareActivity).toHaveLength(2);
  });
  it('duplicates nested profile settings independently', () => {
    const initial = createStarterCalculatorSettings();
    const next = duplicateProfile(initial, 'pvc', 'copy');
    const copy = next.glazing.profiles.at(-1)!;
    if (copy.material !== 'pvc') throw new Error('fixture');
    copy.hardwareActivity[0]!.activityPercent = 1;
    copy.colorRules[0]!.colorPercent = 2;
    expect(pvc(initial).hardwareActivity[0]!.activityPercent).toBe(125);
    expect(pvc(initial).colorRules[0]!.colorPercent).toBe(0);
  });
  it('explains active area, rather than treating every product as fully active', () => {
    expect(percentageHint(5700, 125, true)).toContain('При активной площади 1 м²');
    expect(percentageHint(5700, 125, true)).toContain('только к площади открывающихся створок');
  });
  it('updates lamination hints when either base or percentage changes', () => {
    expect(percentageHint(5700, 10)).toContain('570 ₽');
    expect(percentageHint(5700, 25)).toContain('1 425 ₽');
    expect(percentageHint(6000, 10)).toContain('600 ₽');
    const initial = createStarterCalculatorSettings();
    const next = updateProfile(initial, { ...pvc(initial), colorRules: pvc(initial).colorRules.map((r) => ({ ...r, colorPercent: 50 })) });
    expect(render(next)).toContain('2 850 ₽');
  });
  it('explains product markup once after additions and base before options', () => {
    expect(productMarkupExplanation).toContain('один раз после сложения');
    expect(render()).toContain(productMarkupExplanation);
    expect(render()).toContain('Это ещё не итоговая цена для клиента');
    expect(render()).toContain('не начисляются друг на друга');
    expect(render()).not.toContain('глухое окно 1 м² стоит');
  });
  it('configures PVC extensions separately from aluminium connectors and mechanisms', () => {
    const initial = createStarterCalculatorSettings();
    const next = updateProfile(initial, { ...pvc(initial), extensionPercent: 35 });
    const aluminium = next.glazing.profiles[1]!;
    if (aluminium.material !== 'aluminium') throw new Error('fixture');
    const last = updateProfile(next, { ...aluminium, connectorPercent: 45, activity: { slidingPercent: 16, swingPercent: 26 } });
    expect(pvc(last).extensionPercent).toBe(35);
    expect(pvc(last).hardwareActivity).toEqual(pvc(initial).hardwareActivity);
    expect(last.glazing.profiles[1]).toMatchObject({ connectorPercent: 45, activity: { slidingPercent: 16, swingPercent: 26 } });
    expect(render(last)).toContain('Раздвижное открывание');
    expect(render(last)).toContain('Распашное открывание');
  });
  it('edits installation independently for each material and renders it outside profile markups', () => {
    const initial = createStarterCalculatorSettings();
    const next = updateInstallation(updateInstallation(initial, 'pvc', 3000), 'aluminium', 2000);
    expect(next.glazing.installationRatesPerM2).toEqual({ pvc: 3000, aluminium: 2000 });
    expect(next.glazing.profiles).toEqual(initial.glazing.profiles);
    const html = render(next);
    expect(html).toContain('aria-label="Монтаж ПВХ"');
    expect(html).toContain('aria-label="Монтаж алюминия"');
    expect(html).toContain('Опции и наценки изделия не меняют стоимость монтажа');
  });
  it('edits finish width and labor without obsolete fields or editable reserve', () => {
    const initial = createStarterCalculatorSettings();
    const material = initial.finish.materials[0]!;
    const next = updateFinishMaterial(initial, { ...material, installerRatePerRunningMeter: 600,
      widthVariants: material.widthVariants.map((v) => ({ ...v, physicalWidthMm: 350, maxUsableActualDepthMm: 330, purchaseCostPerRunningMeter: 999 })) });
    validateCalculatorSettings(next);
    expect(initial.finish.materials[0]!.installerRatePerRunningMeter).toBe(400);
    const html = render(next);
    for (const text of ['Ширина материала', 'Подходит для глубины до', 'Закупочная цена за пог. м', 'Базовая оплата монтажнику', 'Припуски не влияют на этот выбор']) expect(html).toContain(text);
    for (const text of ['purchaseStep', 'wastePercent', 'materialMarkupPercent', 'reservePercent']) expect(html).not.toContain(text);
    expect(html).not.toMatch(/<label>[^<]*20%/);
  });
  it.each(['piece', 'runningMeter', 'squareMeter', 'unit', undefined] as const)('adds, edits and removes catalog work with unit %s without repricing snapshots', (unit) => {
    const initial = createStarterCalculatorSettings();
    const entry = { id: 'test', name: 'Подъём', status: 'active' as const, unitPriceMinor: 12345, ...(unit ? { unit } : {}) };
    const added = putWork(initial, entry);
    const snapshot = createAdditionalWorkSnapshot(entry, 'snapshot', 2);
    const edited = putWork(added, { ...entry, name: 'Подъём новый', unitPriceMinor: 55500 });
    validateCalculatorSettings(edited);
    expect(edited.additionalWorks.at(-1)).toMatchObject({ name: 'Подъём новый', unitPriceMinor: 55500 });
    expect(snapshot).toMatchObject({ name: 'Подъём', unitPriceMinor: 12345, quantity: 2 });
    expect(removeWork(edited, entry.id).additionalWorks).toEqual(initial.additionalWorks);
    expect(render(edited)).toContain('сохраняется снимок цены');
  });
  it.each([10, 50, 100] as const)('supports commercial rounding %s', (step) => {
    const value = createStarterCalculatorSettings(); value.commercialRoundingStepRub = step;
    validateCalculatorSettings(value);
    expect(render(value)).toContain(`<option value="${step}" selected="">${step} ₽</option>`);
  });
  it('shows notice only when unconfirmed example prices are present', () => {
    const value = createStarterCalculatorSettings();
    expect(render(value)).toContain('Используются примерные цены');
    value.pricesConfirmed = true;
    expect(render(value)).not.toContain('Используются примерные цены');
    value.pricesConfirmed = false; value.example = { origin: 'custom', containsExamplePrices: false };
    expect(render(value)).not.toContain('Используются примерные цены');
  });
  it('ordinary save, including edited example settings, does not confirm prices', async () => {
    const value = createStarterCalculatorSettings(); pvc(value).basePricePerM2 = 123;
    const callback = vi.fn(save);
    const next = await persistSettingsV2(value, false, callback);
    expect(next.pricesConfirmed).toBe(false);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ pricesConfirmed: false }));
  });
  it('explicit confirmation persists true, preserving provenance and original draft', async () => {
    const value = createStarterCalculatorSettings(); const callback = vi.fn(save);
    const next = await persistSettingsV2(value, true, callback);
    expect(next.pricesConfirmed).toBe(true);
    expect(next.example).toEqual(value.example);
    expect(value.pricesConfirmed).toBe(false);
    expect(callback).toHaveBeenCalledWith(next);
  });
  it('failed confirmation retains unconfirmed draft and reports the repository error', async () => {
    const value = createStarterCalculatorSettings();
    await expect(persistSettingsV2(value, true, async () => { throw new Error('changed elsewhere'); })).rejects.toThrow('changed elsewhere');
    expect(value.pricesConfirmed).toBe(false);
  });
  it('never replaces an existing user catalog with starter, or changes legacy snapshots', () => {
    const legacy = createDefaultCalculatorSettings();
    const original = structuredClone(legacy);
    const next = createStarterCalculatorSettings(); next.additionalWorks = []; pvc(next).name = 'Мой профиль';
    const staged = stageSettingsV2(legacy, next);
    expect(legacy).toEqual(original);
    expect(staged.glazing).toEqual(original.glazing); expect(staged.finish).toEqual(original.finish);
    const loaded = openSettingsV2(copyCalculatorSettings(staged));
    expect(pvc(loaded).name).toBe('Мой профиль'); expect(loaded.additionalWorks).toEqual([]);
    expect(loaded).not.toBe(next);
  });
  it.each(['name', 'base', 'width', 'labor', 'work'] as const)('surfaces meaningful inline invalid %s errors and prevents persistence', async (kind) => {
    const value = createStarterCalculatorSettings();
    if (kind === 'name') pvc(value).name = '';
    if (kind === 'base') pvc(value).basePricePerM2 = -1;
    if (kind === 'width') value.finish.materials[0]!.widthVariants[0]!.physicalWidthMm = 0;
    if (kind === 'labor') value.finish.materials[0]!.installerRatePerRunningMeter = NaN;
    if (kind === 'work') value.additionalWorks[0]!.unitPriceMinor = 1.1;
    const html = render(value);
    expect(html).toContain('aria-invalid="true"'); expect(html).toContain('field-error');
    expect(html).toMatch(/<button disabled="">Сохранить настройки/);
    const callback = vi.fn(save);
    await expect(persistSettingsV2(value, false, callback)).rejects.toThrow(); expect(callback).not.toHaveBeenCalled();
  });
  it('uses mobile cards and no pricing mode, engine calls or persisted hints in UI', () => {
    const source = readFileSync('src/ui/SettingsV2Form.tsx', 'utf8');
    const css = readFileSync('src/ui/styles.css', 'utf8');
    expect(source).not.toMatch(/pricingMode|quickPrice|reinforcementPercent|priceInstalledGlazing|priceFinish/);
    expect(css).toContain('.settings-v2'); expect(css).toContain('min-height: 48px');
    expect(render()).not.toContain('<table');
  });
  it.each([['0', 0], ['0.29', 29], ['123,45', 12345], ['1.234', NaN], ['-1', NaN], ['', NaN], ['9007199254740992', NaN]] as const)('converts price input %s without silently rounding', (input, expected) => {
    expect(rubInputToMinor(input)).toBe(expected);
  });
});

describe('starter lamination and pricing compatibility', () => {
  it.each(['pvc', 'aluminium'] as const)('keeps %s starter installation separate from all product options and markups', (material) => {
    const value = createStarterCalculatorSettings();
    const profileId = material === 'pvc' ? 'pvc-standard' : 'aluminium-example';
    const input = { material, profileId, colorId: 'white', totalAreaM2: 2,
      activeAreas: [], extensions: false, connectors: false };
    const base = priceInstalledGlazingVNext(input, value.glazing, 100);
    const profile = value.glazing.profiles.find((p) => p.id === profileId)!;
    profile.extensionPercent = 250; profile.connectorPercent = 350; profile.productMarkupPercent = 400;
    profile.colorRules = profile.colorRules.map((r) => ({ ...r, colorPercent: 150 }));
    const options = priceInstalledGlazingVNext({ ...input, extensions: true, connectors: true,
      activeAreas: material === 'pvc' ? [{ material: 'pvc', hardwareId: 'standard', areaM2: 1 }]
        : [{ material: 'aluminium', mode: 'sliding', areaM2: 1 }] }, value.glazing, 100);
    expect(base.installationPriceMinor).toBe(600000);
    expect(options.installationPriceMinor).toBe(base.installationPriceMinor);
    expect(options.productPriceMinor).not.toBe(base.productPriceMinor);
    expect(value.pricesConfirmed).toBe(false);
  });
  it('uses the intended example prices with separate 3000 RUB installation rates and preserved aluminium mechanism rates', () => {
    const value = createStarterCalculatorSettings();
    expect(pvc(value)).toMatchObject({ name: 'VEKA Softline 70', basePricePerM2: 5700, extensionPercent: 20, productMarkupPercent: 40 });
    expect(value.glazing.hardware[0]!.name).toBe('Mako');
    expect(value.glazing.installationRatesPerM2).toEqual({ pvc: 3000, aluminium: 3000 });
    expect(value.glazing.profiles[1]).toMatchObject({ basePricePerM2: 13000, connectorPercent: 20, activity: { slidingPercent: 15, swingPercent: 25 } });
    expect(value.pricesConfirmed).toBe(false);
  });
  it.each([['white', 'none', 0], ['laminated', 'one_side', 570], ['laminated-two', 'two_sides', 1425]] as const)('prices %s with independent existing color semantics', (colorId, lamination, colorAmount) => {
    const value = createStarterCalculatorSettings();
    expect(value.glazing.colors.find((c) => c.id === colorId)?.lamination).toBe(lamination);
    const price = priceInstalledGlazingVNext({ material: 'pvc', profileId: 'pvc-standard', colorId, totalAreaM2: 1,
      activeAreas: [], extensions: false, connectors: false }, value.glazing, 100);
    expect(price.colorAmount).toBe(colorAmount);
  });
  it('does not add variants to existing snapshots that lack them', () => {
    const settings = createStarterCalculatorSettings();
    settings.glazing.colors = settings.glazing.colors.filter((c) => c.id !== 'laminated-two');
    pvc(settings).colorRules = pvc(settings).colorRules.filter((r) => r.colorId !== 'laminated-two');
    const legacy = stageSettingsV2(createDefaultCalculatorSettings(), settings);
    expect(openSettingsV2(legacy).glazing.colors).toEqual(settings.glazing.colors);
  });
});
