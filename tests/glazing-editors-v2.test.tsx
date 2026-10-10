import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WindowScreen } from '../src/ui/WindowScreen';
import { BalconyScreen } from '../src/ui/BalconyScreen';
import { createStarterCalculatorSettings } from '../src/domain/configuration/vnext/settings';
import { validateGlazingMeasurement, type BalconyMeasurement, type WindowMeasurement } from '../src/domain/measurements/vnext';
import { createCalculation, saveMeasurement, estimateDraft, measurementSnapshot } from '../src/application/estimate/active-calculation';
import { estimateGlazingVNext } from '../src/application/estimate/estimate-glazing-vnext';
import * as editor from '../src/application/estimate/glazing-editor-v2';
import { distributeSectionWidths, updateSectionWidth } from '../src/application/estimate/editor-geometry-operations';

const settings = createStarterCalculatorSettings();
const config = settings.glazing;
const other = { ...config.profiles[0]!, id: 'other', name: 'Другой профиль', material: 'pvc' as const,
  hardwareActivity: [{ hardwareId: 'premium', activityPercent: 80 }], colorRules: config.profiles[0]!.colorRules };
const snapshot = { ...config, profiles: [...config.profiles, other] };
const now = '2026-10-10T12:00:00.000Z';
function window(type: WindowMeasurement['windowType'] = 'double') {
  let value = editor.setWindowType(editor.newWindow('window', snapshot), type);
  value = editor.setWindowWidth(value, type === 'triple' ? 1800 : 1400);
  return editor.readyMeasurement(value.windowType === 'balconyBlock'
    ? { ...value, doorWidthMm: 700, doorHeightMm: 2200, windowHeightMm: 1500, doorPosition: 'right' }
    : { ...value, heightMm: 1500 });
}
function balcony(shape: BalconyMeasurement['balconyType'] = 'straight', material: BalconyMeasurement['material'] = 'pvc') {
  const value = editor.selectMaterial(editor.changeShape(editor.newBalcony('balcony', snapshot), shape, shape === 'L' ? 'left' : undefined), material, snapshot);
  return editor.readyMeasurement({ ...value, planes: value.planes.map((p) => ({ ...editor.setPlaneWidth(p, 1800, 3), heightMm: 2100 })) } as BalconyMeasurement);
}
function save(value: editor.Glazing) {
  const calculation = createCalculation('calculation', now, { ...settings, glazing: snapshot });
  return saveMeasurement(calculation, value, measurementSnapshot(calculation, value.kind), now, 'add');
}
describe('Window / canonical state and Feature 9', () => {
  it.each(['single', 'double', 'triple'] as const)('creates and saves %s as canonical vNext', (type) => {
    const value = window(type); validateGlazingMeasurement(value);
    expect(save(value).measurements[0]).toEqual(value);
    expect(value.plane.sections.map((s) => s.widthMm)).toEqual(distributeSectionWidths(editor.windowPartWidth(value), value.plane.sections.length));
    expect(value.plane.sections.every((s) => s.openingType === 'fixed')).toBe(true);
  });
  it('starts with missing physical sizes and accepts optional identity', () => {
    expect(() => editor.readyMeasurement(editor.newWindow('new', config))).toThrow('ширину');
    expect(window('single')).toMatchObject({ room: 'Без помещения', name: 'Окно' });
  });
  it('resizes with Feature 9 including integer remainders and retains opening identity', () => {
    const value = window('triple');
    const next = editor.setWindowWidth(value, 1001);
    expect(next.plane.sections.map((s) => s.widthMm)).toEqual(distributeSectionWidths(1001, 3));
    expect(next.plane.id).toBe(value.plane.id); expect(value.plane.sections[0]!.widthMm).toBe(600);
  });
  it('compensates immediate next right: 700/500/600 then 700/550/550', () => {
    const first = editor.editWindowWidth(window('triple'), 0, 700);
    expect(first.plane.sections.map((s) => s.widthMm)).toEqual(updateSectionWidth(1800, [600, 600, 600], 0, 700));
    expect(editor.editWindowWidth(first, 1, 550).plane.sections.map((s) => s.widthMm)).toEqual([700, 550, 550]);
  });
  it.each([0, -1, 1400, 1500, 1.5, NaN, Infinity])('rejects width %s without mutating prior geometry', (width) => {
    const value = window(); const before = structuredClone(value);
    expect(() => editor.editWindowWidth(value, 0, width)).toThrow(); expect(value).toEqual(before);
  });
  it('rejects directly editing final section', () => { expect(() => editor.editWindowWidth(window(), 1, 800)).toThrow('Последняя'); });
  it.each(['fixed', 'turn', 'tilt_turn'] as const)('supports PVC %s and validates save', (opening) => {
    const value = window(); const element = editor.setOpening(value.plane.sections[0]!, opening, value, snapshot);
    const next = { ...value, plane: { ...value.plane, sections: [element, value.plane.sections[1]!] } } as WindowMeasurement;
    validateGlazingMeasurement(next); expect(save(next).measurements[0]).toEqual(next);
    if (opening === 'fixed') expect(element.hardwareId).toBeUndefined(); else expect(element.hardwareId).toBe('standard');
  });
  it('scopes hardware to the selected profile and safely resolves profile changes', () => {
    const value = window(); const element = editor.setOpening(value.plane.sections[0]!, 'turn', value, snapshot);
    const active = { ...value, plane: { ...value.plane, sections: [element, value.plane.sections[1]!] } } as WindowMeasurement;
    expect(editor.hardwareChoices(snapshot, 'other').map((h) => h.id)).toEqual(['premium']);
    const next = editor.selectProfile(active, 'other', snapshot);
    expect(next.plane.sections[0]!.hardwareId).toBe('premium');
    expect(editor.selectProfile(next, 'pvc-standard', snapshot).plane.sections[0]!.hardwareId).toBe('premium');
    expect(save(next).measurements[0]).toEqual(next);
  });
  it('does not invent hardware when a profile has no configured relation', () => {
    const empty = { ...snapshot, profiles: [...snapshot.profiles, { ...other, id: 'empty', hardwareActivity: [] }] };
    const value = editor.selectProfile(window(), 'empty', empty);
    const section = editor.setOpening(value.plane.sections[0]!, 'turn', value, empty);
    expect(section.hardwareId).toBe(''); expect(editor.hardwareChoices(empty, 'empty')).toEqual([]);
    expect(() => editor.readyMeasurement({ ...value, plane: { ...value.plane, sections: [section, value.plane.sections[1]!] } } as WindowMeasurement)).toThrow('фурнитура');
  });
  it('preserves an existing hidden but configured profile/hardware/color', () => {
    const hidden = { ...snapshot, profiles: snapshot.profiles.map((p) => ({ ...p, status: 'hidden' as const })),
      hardware: snapshot.hardware.map((h) => ({ ...h, status: 'hidden' as const })), colors: snapshot.colors.map((c) => ({ ...c, status: 'hidden' as const })) };
    const value = window(); const active = editor.setOpening(value.plane.sections[0]!, 'turn', value, snapshot);
    const next = editor.selectProfile({ ...value, plane: { ...value.plane, sections: [active, value.plane.sections[1]!] } } as WindowMeasurement, value.profileId, hidden);
    expect(next.colorId).toBe(value.colorId); expect(next.plane.sections[0]!.hardwareId).toBe('standard');
    const html = renderToStaticMarkup(<WindowScreen id={next.id} configuration={hidden} initial={next} step={100} onSave={async () => {}} onCancel={() => {}} />);
    expect(html).toContain('VEKA Softline 70'); expect(html).toContain('Mako'); expect(html).toContain('Сохранить замер');
  });
  it('type changes reset sections through Feature 9 and keep the transom', () => {
    const value = { ...window('single'), transom: { heightMm: 200, openingType: 'fixed' as const } } as WindowMeasurement;
    const next = editor.setWindowType(value, 'triple');
    expect(next.plane.sections.map((s) => s.widthMm)).toEqual(distributeSectionWidths(1400, 3));
    expect(next.transom).toEqual(value.transom);
  });
  it.each(['laminated', 'laminated-two'])('stores canonical lamination color %s', (colorId) => {
    const value = { ...window(), colorId };
    expect(save(value).measurements[0]).toMatchObject({ colorId });
    expect(estimateGlazingVNext(value, snapshot, 100).price.colorAmount).toBeGreaterThan(0);
  });
  it('supports dobory and connectors with canonical pricing', () => {
    const value = { ...window(), extensions: true, connectors: true };
    const estimate = estimateDraft(value, { kind: 'Window', configuration: snapshot }, 100);
    if (estimate.kind === 'WindowFinish') throw new Error();
    expect(estimate.result.price).toEqual(estimateGlazingVNext(value, snapshot, 100).price);
    expect(estimate.result.price.extensionAmount).toBeGreaterThan(0); expect(estimate.result.price.connectorAmount).toBeGreaterThan(0);
  });
  it('editing preserves identity, transom, works and unrelated fields; originals are independent', () => {
    const initial = { ...window(), extensions: true, additionalWorks: [{ id: 'work', name: 'Подъём', unitPriceMinor: 50000, quantity: 2 }], transom: { heightMm: 200, openingType: 'fixed' as const } } as WindowMeasurement;
    const cloned = editor.copyEditorMeasurement(initial); const next = editor.setWindowWidth(cloned, 1600);
    expect(next).toMatchObject({ id: initial.id, extensions: true, transom: { heightMm: 200 }, additionalWorks: initial.additionalWorks });
    expect(initial.plane.sections[0]!.widthMm).toBe(700);
    const calculation = save(initial);
    expect(saveMeasurement(calculation, next, calculation.configuration[next.id]!, now, 'edit').measurements[0]).toEqual(next);
  });
});
describe('Balcony planes, mechanisms, levels', () => {
  it.each(['straight', 'L', 'U'] as const)('saves %s with independent planes', (shape) => {
    const value = balcony(shape); validateGlazingMeasurement(value); expect(save(value).measurements[0]).toEqual(value);
    const changed = editor.setPlaneWidth(value.planes[0]!, 2001, 4);
    expect(changed.sections.map((s) => s.widthMm)).toEqual(distributeSectionWidths(2001, 4));
    expect(value.planes.slice(1).every((p) => p.widthMm === 1800)).toBe(true);
  });
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('supports %i canonical sections', (count) => {
    const plane = editor.setPlaneWidth(balcony().planes[0]!, 1801, count);
    expect(plane.sections.map((s) => s.widthMm)).toEqual(distributeSectionWidths(1801, count));
    expect(plane.sectionCount).toBe(count);
  });
  it('shape changes preserve common planes and right L ordering', () => {
    const value = balcony('U'); const next = editor.changeShape(value, 'L', 'right');
    expect(next.planes.map((p) => p.position)).toEqual(['facade', 'right']);
    expect(next.planes[0]).toBe(value.planes[1]);
  });
  it.each(['fixed', 'turn', 'tilt_turn'] as const)('PVC balcony supports %s', (opening) => {
    const value = balcony(); const plane = value.planes[0]!;
    const section = editor.setOpening(plane.sections[0]!, opening, value, snapshot);
    const next = { ...value, planes: [{ ...plane, sections: [section, ...plane.sections.slice(1)] }] } as BalconyMeasurement;
    expect(() => validateGlazingMeasurement(next)).not.toThrow();
  });
  it.each(['sliding', 'swing'] as const)('aluminium %s supports only domain-valid choices, no PVC hardware', (mode) => {
    const value = balcony('straight', 'aluminium'); const plane = editor.setPlaneMode(value.planes[0]!, mode);
    const choices = editor.openingChoices('aluminium', mode);
    expect(choices).toEqual(mode === 'sliding' ? ['fixed', 'sliding'] : ['fixed', 'turn']);
    for (const opening of choices) {
      const section = editor.setOpening(plane.sections[0]!, opening, value, snapshot, mode);
      expect(section.hardwareId).toBeUndefined();
      const next = { ...value, planes: [{ ...plane, sections: [section, ...plane.sections.slice(1)] }] } as BalconyMeasurement;
      expect(save(next).measurements[0]).toEqual(next);
    }
    for (const invalid of (['turn', 'tilt_turn', 'sliding'] as const).filter((o) => !choices.includes(o))) {
      expect(() => editor.setOpening(plane.sections[0]!, invalid, value, snapshot, mode)).toThrow('недоступно');
    }
  });
  it('changing mode resets incompatible openings and preserves dimensions/levels', () => {
    const plane = balcony('straight', 'aluminium').planes[0]!;
    expect(editor.setPlaneMode(plane, 'swing')).toMatchObject({ widthMm: 1800, heightMm: 2100, levels: plane.levels });
    expect(editor.setPlaneMode(plane, 'swing').sections.every((s) => s.openingType === 'fixed')).toBe(true);
  });
  it('material changes reset openings while retaining dimensions, works and product options', () => {
    const value = { ...balcony('U'), extensions: true, connectors: true };
    const next = editor.selectMaterial(value, 'aluminium', snapshot);
    expect(next).toMatchObject({ id: value.id, extensions: true, connectors: true });
    expect(next.planes.map((p) => [p.widthMm, p.heightMm, p.levels])).toEqual(value.planes.map((p) => [p.widthMm, p.heightMm, p.levels]));
    expect(next.planes.every((p) => p.sections.every((s) => s.openingType === 'fixed' && s.hardwareId === undefined))).toBe(true);
  });
  it('rejects a lower height equal to or above the full height', () => {
    const value = balcony(); const p = value.planes[0]!;
    for (const height of [2100, 2200]) expect(() => editor.readyMeasurement({ ...value, planes: [{ ...p, levels: { mode: 'twoLevel', splitHeightMm: height, lowerFill: 'glass' } }] } as BalconyMeasurement)).toThrow('ниже полной');
  });
  it.each(['glass', 'sandwich'] as const)('requires explicit lower height and preserves %s vertical geometry through width changes', (lowerFill) => {
    const value = balcony(); const plane = value.planes[0]!;
    const incomplete = { ...value, planes: [{ ...plane, levels: { mode: 'twoLevel', splitHeightMm: NaN, lowerFill } }] } as BalconyMeasurement;
    expect(() => editor.readyMeasurement(incomplete)).toThrow('высоту нижнего');
    const valid = { ...plane, levels: { mode: 'twoLevel' as const, splitHeightMm: 800, lowerFill } };
    const edited = editor.editPlaneWidth(editor.setPlaneWidth(valid, 1800), 0, 700);
    expect(edited.levels).toEqual(valid.levels);
    const next = { ...value, planes: [edited] } as BalconyMeasurement;
    expect(save(next).measurements[0]).toEqual(next);
    expect(estimateGlazingVNext(next, snapshot, 100).geometry.totalAreaM2).toBeCloseTo(3.78, 12);
  });
  it('balcony edit preserves identities and unrelated planes', () => {
    const value = balcony('U'); const next = { ...value, planes: [editor.editPlaneWidth(value.planes[0]!, 0, 700), ...value.planes.slice(1)] } as BalconyMeasurement;
    expect(next.id).toBe(value.id); expect(next.planes.map((p) => p.id)).toEqual(value.planes.map((p) => p.id));
    expect(next.planes.slice(1)).toEqual(value.planes.slice(1));
    const calculation = save(value);
    expect(saveMeasurement(calculation, next, calculation.configuration[next.id]!, now, 'edit').measurements[0]).toEqual(next);
  });
});
describe('Balcony block', () => {
  it.each([1, 2] as const)('saves %i window sections with independent door/window dimensions', (count) => {
    const value = editor.setBlockCount(window('balconyBlock'), count);
    const resized = editor.setWindowWidth(value, 1600);
    expect(resized).toMatchObject({ doorWidthMm: 700, doorHeightMm: 2200, windowHeightMm: 1500 });
    expect(editor.windowPartWidth(resized)).toBe(1600); expect(save(resized).measurements[0]).toEqual(resized);
  });
  it('compensates window sections without changing door geometry or identity', () => {
    const value = editor.setBlockCount(window('balconyBlock'), 2);
    const changed = editor.editWindowWidth(value, 0, 800);
    expect(changed.plane.sections.map((s) => s.widthMm)).toEqual([800, 600]);
    if (value.windowType !== 'balconyBlock' || changed.windowType !== 'balconyBlock') throw new Error();
    expect(changed.door).toEqual(value.door); expect(changed.doorWidthMm).toBe(700); expect(changed.id).toBe(value.id);
  });
  it('block active door uses profile hardware, without a new door dimension field', () => {
    const value = window('balconyBlock'); if (value.windowType !== 'balconyBlock') throw new Error();
    const element = editor.setOpening({ ...value.door, widthMm: value.doorWidthMm }, 'tilt_turn', value, snapshot);
    const { widthMm: _width, ...door } = element;
    const next = editor.selectProfile({ ...value, door } as WindowMeasurement, 'other', snapshot);
    if (next.windowType !== 'balconyBlock') throw new Error();
    expect(next.door.hardwareId).toBe('premium'); expect(next.door).not.toHaveProperty('widthMm'); expect(save(next).measurements[0]).toEqual(next);
  });
  it('avoids ID collisions when adding the second window beside a custom door', () => {
    const value = window('balconyBlock'); if (value.windowType !== 'balconyBlock') throw new Error();
    const next = editor.setBlockCount({ ...value, door: { id: 'section-2', openingType: 'fixed' } }, 2);
    expect(() => validateGlazingMeasurement(next)).not.toThrow();
    expect(next.plane.sections.map((s) => s.id)).toEqual(['section-1', 'section-2-window']);
  });
  it('restores a hidden second opening with its ID and current profile compatibility', () => {
    const value = editor.setBlockCount(window('balconyBlock'), 2);
    const second = { ...editor.setOpening(value.plane.sections[1]!, 'tilt_turn', value, snapshot), id: 'custom-second' };
    const one = editor.selectProfile(editor.setBlockCount(value, 1), 'other', snapshot);
    const restored = editor.restoreBlockSecondOpening(editor.setBlockCount(one, 2), second, snapshot);
    expect(restored.plane.sections[1]).toMatchObject({ id: 'custom-second', openingType: 'tilt_turn', hardwareId: 'premium', widthMm: 700 });
    expect(save(restored).measurements[0]).toEqual(restored);
  });
});
describe('Snapshot / pricing / UI boundary', () => {
  it('existing snapshot remains authoritative after mutable Settings change', () => {
    const value = window(); const calculation = save(value);
    const oldSnapshot = measurementSnapshot(calculation, 'Window');
    const latest = createStarterCalculatorSettings(); latest.glazing = { ...latest.glazing, profiles: [] };
    expect(oldSnapshot.configuration).toEqual(snapshot);
    expect(estimateDraft(value, oldSnapshot, 100).measurementTotalMinor).toBe(estimateDraft(value, { kind: 'Window', configuration: snapshot }, 100).measurementTotalMinor);
  });
  it.each(['window', 'balcony', 'block'] as const)('renders %s numeric keyboards, derived last section, snapshot options and canonical totals', (kind) => {
    const value = kind === 'balcony' ? balcony('straight', 'aluminium') : kind === 'block' ? editor.setBlockCount(window('balconyBlock'), 2) : window();
    const props = { id: value.id, configuration: snapshot, step: 100 as const, onSave: async () => {}, onCancel: () => {} };
    const html = renderToStaticMarkup(value.kind === 'Balcony' ? <BalconyScreen {...props} initial={value} /> : <WindowScreen {...props} initial={value} />);
    expect(html).toContain('inputMode="numeric"'); expect(html).toContain('readOnly=""'); expect(html).toContain('Автоматически');
    expect(html).toContain('<svg'); expect(html).toContain('Монтаж'); expect(html).toContain('Итого');
    if (value.material === 'aluminium') expect(html).not.toContain(': фурнитура');
    expect(html).toContain(new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(estimateDraft(value, { kind: value.kind, configuration: snapshot }, 100).measurementTotalMinor! / 100));
  });
});
