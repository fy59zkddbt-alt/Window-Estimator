import { describe, expect, it } from 'vitest';
import {
  distributeSectionWidths, updateSectionWidth, resizeWindowWidth, editWindowSectionWidth,
  changeWindowSectionCount, changeBlockSectionCount, resizeBalconyPlaneWidth,
  editBalconySectionWidth, changeBalconyPlaneSectionCount,
} from '../src/application/estimate/editor-geometry-operations';
import type { WindowMeasurement, BalconyMeasurement } from '../src/domain/measurements/vnext';
import { validateGlazingMeasurement } from '../src/domain/measurements/vnext';
import { getWindowGeometryVNext } from '../src/domain/geometry/window-geometry';
import { getBalconyGeometryVNext } from '../src/domain/geometry/balcony-geometry';

const options = { id: 'm', room: 'Room', name: 'Measurement', material: 'pvc' as const, profileId: 'pvc',
  colorId: 'white', extensions: false, connectors: false, additionalWorks: [] };
const sections = (widths: readonly number[]) => widths.map((widthMm, i) => ({ id: `s${i}`, widthMm, openingType: 'fixed' as const }));
const widths = (value: WindowMeasurement) => value.plane.sections.map((s) => s.widthMm);
function window(type: 'single' | 'double' | 'triple' = 'triple'): Extract<WindowMeasurement, { material: 'pvc'; windowType: 'single' | 'double' | 'triple' }> {
  return { ...options, kind: 'Window', windowType: type, widthMm: 1800, heightMm: 1500,
    transom: { heightMm: 300, openingType: 'fixed' },
    plane: { id: 'plane', sections: sections(type === 'single' ? [1800] : type === 'double' ? [900, 900] : [600, 600, 600]) } };
}
function block(count: 1 | 2): WindowMeasurement {
  return { ...options, kind: 'Window', windowType: 'balconyBlock', doorPosition: 'right',
    door: { id: 'door', openingType: 'fixed' }, doorWidthMm: 700, doorHeightMm: 2200, windowHeightMm: 1500,
    plane: { id: 'plane', sections: sections(count === 1 ? [1800] : [900, 900]) } };
}
function balcony(shape: 'straight' | 'L' | 'U' = 'straight'): BalconyMeasurement {
  const positions = shape === 'straight' ? ['facade'] as const : shape === 'L' ? ['left', 'facade'] as const : ['left', 'facade', 'right'] as const;
  return { ...options, kind: 'Balcony', balconyType: shape, ...(shape === 'L' ? { side: 'left' as const } : {}),
    planes: positions.map((position) => ({ id: position, name: position, position, widthMm: 1800, heightMm: 2000,
      sectionCount: 3, sections: sections([600, 600, 600]), levels: { mode: 'twoLevel', splitHeightMm: 500, lowerFill: 'sandwich' } })) };
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

describe('integer section widths', () => {
  it.each([[1800, 2, [900, 900]], [1800, 3, [600, 600, 600]], [1001, 2, [501, 500]],
    [1001, 3, [334, 334, 333]], [1, 1, [1]], [8, 8, [1, 1, 1, 1, 1, 1, 1, 1]]] as const)
    ('distributes %s into %s sections', (total, count, expected) => expect(distributeSectionWidths(total, count)).toEqual(expected));
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid total %s', (total) => {
    expect(() => distributeSectionWidths(total, 2)).toThrow();
  });
  it.each([0, -1, 1.5, 9, NaN, Infinity])('rejects invalid count %s', (count) => {
    expect(() => distributeSectionWidths(1001, count)).toThrow();
  });
  it('rejects totals too small for the count', () => expect(() => distributeSectionWidths(2, 3)).toThrow());
  it('covers safe-integer maximum without losing millimetres', () => {
    for (let count = 1; count <= 8; count++) {
      const result = distributeSectionWidths(Number.MAX_SAFE_INTEGER, count);
      expect(result.reduce((sum, width) => sum + BigInt(width), 0n)).toBe(BigInt(Number.MAX_SAFE_INTEGER));
      expect(result.every(Number.isSafeInteger)).toBe(true);
    }
    expect(updateSectionWidth(Number.MAX_SAFE_INTEGER, [1, Number.MAX_SAFE_INTEGER - 1], 0, Number.MAX_SAFE_INTEGER - 1))
      .toEqual([Number.MAX_SAFE_INTEGER - 1, 1]);
  });
  it.each([-1, 2, 3, 0.5, NaN])('rejects non-editable index %s', (index) => {
    expect(() => updateSectionWidth(1800, [600, 600, 600], index, 700)).toThrow();
  });
  it.each([0, -1, 1.5, 1200, 1201, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid edit %s immutably', (width) => {
    const original = freeze([600, 600, 600]);
    expect(() => updateSectionWidth(1800, original, 0, width)).toThrow();
    expect(original).toEqual([600, 600, 600]);
  });
  it.each([[], [600, 600], [0, 1800], [0.5, 1799.5], [Number.MAX_SAFE_INTEGER, 1]].map((prior) => ({ prior })))('rejects malformed prior widths $prior', ({ prior }) => {
    expect(() => updateSectionWidth(1800, prior, 0, 700)).toThrow();
  });
  it('preserves exact totals across counts, distributions and every editable position', () => {
    for (let count = 2; count <= 8; count++) for (const total of [count, 1001, 1800, Number.MAX_SAFE_INTEGER]) {
      const original = freeze(distributeSectionWidths(total, count));
      for (let i = 0; i < count - 1; i++) {
        const result = updateSectionWidth(total, original, i, 1);
        expect(result.reduce((sum, width) => sum + BigInt(width), 0n)).toBe(BigInt(total));
        expect(result.every((width) => Number.isSafeInteger(width) && width > 0)).toBe(true);
        result.forEach((width, j) => { if (j !== i && j !== i + 1) expect(width).toBe(original[j]); });
      }
    }
  });
});

describe('vNext window operations', () => {
  it('double compensates the second section', () => expect(widths(editWindowSectionWidth(window('double'), 0, 1000))).toEqual([1000, 800]));
  it('triple compensates only the next section, then the final section', () => {
    const original = freeze(window());
    const first = editWindowSectionWidth(original, 0, 700);
    expect(widths(first)).toEqual([700, 500, 600]);
    const second = editWindowSectionWidth(first, 1, 550);
    expect(widths(second)).toEqual([700, 550, 550]);
    expect(widths(original)).toEqual([600, 600, 600]);
    expect(getWindowGeometryVNext(second).totalAreaM2).toBe(2.7);
  });
  it('rejects the final section and invalid compensation without modifying the window', () => {
    const original = freeze(window());
    const snapshot = structuredClone(original);
    expect(() => editWindowSectionWidth(original, 2, 700)).toThrow();
    expect(() => editWindowSectionWidth(original, 0, 1200)).toThrow();
    expect(original).toEqual(snapshot);
  });
  it('resizes all widths and preserves openings, transom and other attributes', () => {
    const original = window();
    original.plane.sections = [{ id: 'a', widthMm: 600, openingType: 'turn', hingeSide: 'left', hardwareId: 'h' }, ...original.plane.sections.slice(1)];
    freeze(original);
    const result = resizeWindowWidth(original, 1001);
    expect(widths(result)).toEqual([334, 334, 333]);
    expect(result).toEqual({ ...original, widthMm: 1001, plane: { ...original.plane,
      sections: original.plane.sections.map((s, i) => ({ ...s, widthMm: [334, 334, 333][i] })) } });
    validateGlazingMeasurement(result);
  });
  it('changes section count with even widths and explicit fixed reset', () => {
    const result = changeWindowSectionCount(resizeWindowWidth(window('single'), 1001), 'triple');
    expect(widths(result)).toEqual([334, 334, 333]);
    expect(result.windowType).toBe('triple');
    expect(result.plane.sections.every((s) => s.openingType === 'fixed')).toBe(true);
  });
  it('single is derived and can be resized only through total width', () => {
    expect(() => editWindowSectionWidth(window('single'), 0, 900)).toThrow();
    expect(widths(resizeWindowWidth(window('single'), 1))).toEqual([1]);
  });
  it('still rejects invalid non-width domain properties', () => {
    expect(() => resizeWindowWidth({ ...window(), room: '' }, 1001)).toThrow();
  });
  it.each(['sliding', 'swing'] as const)('preserves aluminium %s mechanism and openings', (mode) => {
    const source: WindowMeasurement = { ...options, kind: 'Window', material: 'aluminium', windowType: 'double', widthMm: 1800, heightMm: 1500,
      plane: mode === 'sliding' ? { id: 'p', mode, sections: [{ id: 'a', widthMm: 900, openingType: 'sliding' }, ...sections([900])] }
        : { id: 'p', mode, sections: [{ id: 'a', widthMm: 900, openingType: 'turn', hingeSide: 'right' }, ...sections([900])] } };
    const result = editWindowSectionWidth(freeze(source), 0, 1000);
    expect(widths(result)).toEqual([1000, 800]);
    expect(result.plane).toMatchObject({ mode, sections: [{ openingType: mode === 'sliding' ? 'sliding' : 'turn' }, { openingType: 'fixed' }] });
    validateGlazingMeasurement(changeWindowSectionCount(result, 'triple'));
  });
});

describe('vNext balcony plane operations', () => {
  it.each(['straight', 'L', 'U'] as const)('%s planes stay independent on edit and resize', (shape) => {
    const original = freeze(balcony(shape));
    const changed = editBalconySectionWidth(original, 'facade', 0, 700);
    expect(changed.planes.find((p) => p.id === 'facade')!.sections.map((s) => s.widthMm)).toEqual([700, 500, 600]);
    const resized = resizeBalconyPlaneWidth(changed, 'facade', 1001);
    expect(resized.planes.find((p) => p.id === 'facade')!.sections.map((s) => s.widthMm)).toEqual([334, 334, 333]);
    for (const plane of original.planes) {
      if (plane.id !== 'facade') {
        expect(changed.planes.find((p) => p.id === plane.id)).toBe(plane);
        expect(resized.planes.find((p) => p.id === plane.id)).toBe(plane);
      }
      expect(plane.sections.map((s) => s.widthMm)).toEqual([600, 600, 600]);
    }
  });
  it('rejects invalid edits, derived final section and missing plane', () => {
    const original = freeze(balcony());
    expect(() => editBalconySectionWidth(original, 'facade', 0, 1200)).toThrow();
    expect(() => editBalconySectionWidth(original, 'facade', 2, 500)).toThrow();
    expect(() => resizeBalconyPlaneWidth(original, 'missing', 1001)).toThrow();
    expect(original).toEqual(balcony());
  });
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('supports %s sections and preserves shared two-row geometry', (count) => {
    const source = freeze(balcony('U'));
    const resized = resizeBalconyPlaneWidth(source, 'facade', 1001);
    const result = changeBalconyPlaneSectionCount(resized, 'facade', count);
    const plane = result.planes[1]!;
    expect(plane.sections.map((s) => s.widthMm)).toEqual(distributeSectionWidths(1001, count));
    expect(plane.levels).toBe(source.planes[1]!.levels);
    const geometry = getBalconyGeometryVNext(result).planes[1]!;
    expect(geometry.sections).toHaveLength(count * 2);
    for (let i = 0; i < count; i++) {
      expect(geometry.sections[count + i]).toMatchObject({ widthMm: plane.sections[i]!.widthMm,
        xMm: geometry.sections[i]!.xMm, heightMm: 500, openingType: 'fixed', fill: 'sandwich' });
      expect(geometry.sections[i]!.heightMm).toBe(1500);
    }
  });
  it.each([0, 9, 1.5])('rejects invalid balcony count %s', (count) => expect(() => changeBalconyPlaneSectionCount(balcony(), 'facade', count)).toThrow());
  it('keeps aluminium mechanism and active areas valid', () => {
    const base = balcony();
    const source: BalconyMeasurement = { ...base, material: 'aluminium', planes: base.planes.map((p) => ({ ...p, mode: 'sliding',
      sections: [{ id: 'active', widthMm: 600, openingType: 'sliding' }, ...sections([600, 600])] })) };
    const result = editBalconySectionWidth(freeze(source), 'facade', 0, 700);
    expect(getBalconyGeometryVNext(result).activeAreaM2).toBeCloseTo(1.05);
    validateGlazingMeasurement(resizeBalconyPlaneWidth(result, 'facade', 1001));
  });
});

describe('vNext balcony-block window part', () => {
  it.each([1, 2] as const)('resizes %s sections without touching door dimensions', (count) => {
    const original = freeze(block(count));
    const result = resizeWindowWidth(original, 1001);
    expect(widths(result)).toEqual(count === 1 ? [1001] : [501, 500]);
    expect(result).toMatchObject({ doorWidthMm: 700, doorHeightMm: 2200, windowHeightMm: 1500 });
    if (result.windowType !== 'balconyBlock' || original.windowType !== 'balconyBlock') throw new Error('fixture');
    expect(result.door).toBe(original.door);
    expect(getWindowGeometryVNext(result).totalAreaM2).toBeCloseTo(3.0415);
    expect(widths(original)).toEqual(count === 1 ? [1800] : [900, 900]);
  });
  it('two sections compensate; final section and single are derived', () => {
    expect(widths(editWindowSectionWidth(freeze(block(2)), 0, 1000))).toEqual([1000, 800]);
    expect(() => editWindowSectionWidth(block(2), 1, 800)).toThrow();
    expect(() => editWindowSectionWidth(block(1), 0, 800)).toThrow();
    expect(() => editWindowSectionWidth(block(2), 0, 1800)).toThrow();
  });
  it('changes 1/2 count from window-part sum, preserving the door and avoiding ID collisions', () => {
    const original = block(1);
    if (original.windowType !== 'balconyBlock') throw new Error('fixture');
    original.door.id = 'section-1';
    const result = changeBlockSectionCount(freeze(resizeWindowWidth(original, 1001)), 2);
    expect(widths(result)).toEqual([501, 500]);
    expect(widths(changeBlockSectionCount(result, 1))).toEqual([1001]);
    validateGlazingMeasurement(result);
  });
  it('retains existing block openings by index and initializes only the added section as fixed', () => {
    const original: WindowMeasurement = { ...options, kind: 'Window', windowType: 'balconyBlock',
      doorPosition: 'right', door: { id: 'section-2', openingType: 'fixed' },
      doorWidthMm: 700, doorHeightMm: 2200, windowHeightMm: 1500,
      plane: { id: 'plane', sections: [{ id: 'active', widthMm: 1001, openingType: 'turn', hingeSide: 'right', hardwareId: 'h' }] } };
    const result = changeBlockSectionCount(freeze(original), 2);
    expect(result.plane.sections[0]).toEqual({ ...original.plane.sections[0], widthMm: 501 });
    expect(result.plane.sections[1]).toMatchObject({ widthMm: 500, openingType: 'fixed' });
    expect(changeBlockSectionCount(result, 1).plane.sections[0]).toEqual(original.plane.sections[0]);
    validateGlazingMeasurement(result);
  });
  it('rejects count changes incompatible with existing door position', () => {
    const original = block(2);
    if (original.windowType !== 'balconyBlock') throw new Error('fixture');
    original.doorPosition = 'middle';
    freeze(original);
    expect(() => changeBlockSectionCount(original, 1)).toThrow();
    expect(widths(original)).toEqual([900, 900]);
  });
});
