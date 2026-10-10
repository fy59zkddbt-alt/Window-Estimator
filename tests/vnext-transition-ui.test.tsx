import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { WindowScreen } from '../src/ui/WindowScreen';
import { FinishScreen } from '../src/ui/FinishScreen';
import { BalconyScreen } from '../src/ui/BalconyScreen';
import { SettingsV2Form } from '../src/ui/SettingsV2Form';
import { createStarterCalculatorSettings } from '../src/domain/configuration/vnext/settings';
import { windowFromDraft, finishFromDraft, balconyFromDraft } from '../src/application/estimate/calculator-drafts';
import { estimateDraft } from '../src/application/estimate/active-calculation';
import * as legacyWindow from '../src/application/estimate/estimate-window';
import * as legacyBalcony from '../src/application/estimate/estimate-balcony';
import * as legacyFinish from '../src/application/estimate/estimate-finish';

const save = async () => {};
const close = () => {};
const format = (minor: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(minor / 100);
it('keeps the proposal action unavailable for v4 with no legacy generator or conversion caller', () => {
  const source = readFileSync('src/ui/App.tsx', 'utf8');
  const section = source.match(/<section aria-label="Коммерческое предложение">([\s\S]*?)<\/section>/)?.[1];
  expect(section).toContain('<button disabled>Сформировать КП</button>');
  expect(section).toContain('Формирование КП для нового формата расчёта пока недоступно.');
  expect(section).not.toContain('onClick');
  expect(source).not.toMatch(/createProposalDocument|generateProposal|renderProposalPdf\s*\(/);
  expect(source).not.toContain("from '../domain/calculation'");
});
it('existing window screen previews Feature 3/5 and never calls legacy pricing', () => {
  const settings = createStarterCalculatorSettings();
  const measurement = windowFromDraft({ id: 'window', room: 'Кухня', name: 'Окно', material: 'pvc', profileId: 'pvc-standard',
    windowType: 'single', widthMm: 1000, heightMm: 1500, lamination: 'none', sections: [{ id: 's', widthMm: 1000, openingType: 'turn', hingeSide: 'left', hardwareId: 'standard' }] }, settings.glazing, []);
  const spy = vi.spyOn(legacyWindow, 'estimateWindow').mockImplementation(() => { throw new Error('legacy engine called'); });
  try {
    const html = renderToStaticMarkup(<WindowScreen id="window" configuration={settings.glazing} initial={measurement} step={100} onSave={save} onCancel={close} />);
    const totals = estimateDraft(measurement, { kind: 'Window', configuration: settings.glazing }, 100);
    expect(html).toContain(format(totals.measurementTotalMinor!));
    expect(html).toContain('Сохранить замер'); expect(html).toContain('<svg');
    expect(spy).not.toHaveBeenCalled();
  } finally { spy.mockRestore(); }
});
it('existing finish screen previews Feature 4/5 and exposes unresolved state without a fabricated price', () => {
  const settings = createStarterCalculatorSettings();
  const measurement = finishFromDraft({ id: 'finish', room: 'Кухня', name: 'Отделка', widthMm: 1400, heightMm: 2100,
    depthMm: 999, selections: [{ finishType: 'slope', materialId: 'sandwich' }] }, []);
  const spy = vi.spyOn(legacyFinish, 'estimateFinish').mockImplementation(() => { throw new Error('legacy engine called'); });
  try {
    const html = renderToStaticMarkup(<FinishScreen id="finish" configuration={settings.finish} initial={measurement} step={100} onSave={save} onCancel={close} />);
    expect(html).toContain('Цена требует уточнения'); expect(html).toContain('нет подходящего варианта');
    expect(html).toContain('Сохранить замер'); expect(spy).not.toHaveBeenCalled();
  } finally { spy.mockRestore(); }
});
it('existing balcony screen previews the canonical vNext glazing and totals', () => {
  const settings = createStarterCalculatorSettings();
  const measurement = balconyFromDraft({ id: 'balcony', room: 'Балкон', name: 'Остекление', balconyType: 'straight',
    material: 'aluminium', profileId: 'aluminium-example', lamination: 'none', planes: [{ id: 'facade', name: 'Фасад', position: 'facade',
      widthMm: 2000, heightMm: 1500, sectionCount: 1, levels: { mode: 'oneLevel' }, sections: [{ id: 's', widthMm: 2000, openingType: 'sliding' }] }] }, settings.glazing, []);
  const spy = vi.spyOn(legacyBalcony, 'estimateBalcony').mockImplementation(() => { throw new Error('legacy engine called'); });
  try {
    const html = renderToStaticMarkup(<BalconyScreen id="balcony" configuration={settings.glazing} initial={measurement} step={100} onSave={save} onCancel={close} />);
    const totals = estimateDraft(measurement, { kind: 'Balcony', configuration: settings.glazing }, 100);
    expect(html).toContain(format(totals.measurementTotalMinor!)); expect(html).toContain('<svg'); expect(spy).not.toHaveBeenCalled();
  } finally { spy.mockRestore(); }
});
it('settings v2 and calibration retain their existing controls with accurate transition disclosure', () => {
  const html = renderToStaticMarkup(<SettingsV2Form initial={createStarterCalculatorSettings()} onSave={save} onClose={close} />);
  expect(html).toContain('Настройки v2 используются для новых расчётов');
  expect(html).toContain('Цены проверены'); expect(html).toContain('Помочь настроить цены');
  expect(html).not.toContain('калькулятор пока использует прежние тарифы');
});
