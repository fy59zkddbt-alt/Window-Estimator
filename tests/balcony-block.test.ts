import { describe, expect, it } from 'vitest';
import { createWindow, toWindowInput, type BalconyBlockInput, type WindowInput } from '../src/domain/measurements/window/create-window';
import { getWindowGeometry } from '../src/domain/geometry/window-geometry';
import { estimateWindow } from '../src/application/estimate/estimate-window';
import { blockInput, active, fixed, configuration, profile } from './fixtures';

const twoWindows = [fixed(500, 'w1'), active(1000, 'w2', 'tilt_turn', 'right')];
const layouts = [
  { count: 1, doorPosition: 'left', ids: ['door', 'w1'], xs: [0, 700] },
  { count: 1, doorPosition: 'right', ids: ['w1', 'door'], xs: [0, 1400] },
  { count: 2, doorPosition: 'left', ids: ['door', 'w1', 'w2'], xs: [0, 700, 1200] },
  { count: 2, doorPosition: 'middle', ids: ['w1', 'door', 'w2'], xs: [0, 500, 1200] },
  { count: 2, doorPosition: 'right', ids: ['w1', 'w2', 'door'], xs: [0, 500, 1500] },
] as const;

describe('balconyBlock inside WindowMeasurement', () => {
  it.each(layouts)('$count windows, door $doorPosition: domain supplies order and offsets', ({ count, doorPosition, ids, xs }) => {
    const measurement = createWindow({ ...blockInput, doorPosition, sections: count === 1 ? blockInput.sections : twoWindows });
    const geometry = getWindowGeometry(measurement);
    expect(measurement.kind).toBe('Window');
    expect(geometry.sections.map((section) => section.id)).toEqual(ids);
    expect(geometry.sections.map((section) => section.xMm)).toEqual(xs);
    expect(geometry.sections.every((section) => section.yMm === 0)).toBe(true);
    expect(geometry.transom).toBeNull();
    expect(measurement.plane.sections.map((section) => section.id)).toEqual(count === 1 ? ['w1'] : ['w1', 'w2']);
  });
  it('control area is 3.64 m², not the 4.62 m² bounding rectangle', () => {
    const geometry = getWindowGeometry(createWindow(blockInput));
    expect(geometry.totalAreaM2).toBeCloseTo(3.64, 12);
    expect(geometry.bounds).toEqual({ xMm: 0, yMm: 0, widthMm: 2100, heightMm: 2200 });
    expect(geometry.totalAreaM2).not.toBeCloseTo(4.62);
    expect(geometry.activeAreaM2).toBeCloseTo(1.54, 12);
  });
  it('two windows of 500 / 1000 mm preserve exact width and height proportions', () => {
    const result = getWindowGeometry(createWindow({ ...blockInput, sections: twoWindows, doorPosition: 'middle' }));
    const first = result.sections.find((item) => item.id === 'w1')!;
    const second = result.sections.find((item) => item.id === 'w2')!;
    const door = result.sections.find((item) => item.id === 'door')!;
    expect(second.widthMm / first.widthMm).toBe(2);
    expect(first.heightMm).toBe(second.heightMm);
    expect(door.heightMm / first.heightMm).toBe(2200 / 1500);
    expect(result.totalAreaM2).toBeCloseTo(3.79, 12);
    expect(result.activeAreaM2).toBeCloseTo(3.04, 12);
  });
  it('one window of 1400 mm is twice as wide as a 700 mm door', () => {
    const result = getWindowGeometry(createWindow(blockInput));
    expect(result.sections[1]!.widthMm / result.sections[0]!.widthMm).toBe(2);
    expect(result.sections[0]!.heightMm).toBeGreaterThan(result.sections[1]!.heightMm);
  });
  it.each([
    { doorActive: false, windowActive: false, expected: 0 },
    { doorActive: true, windowActive: false, expected: 1.54 },
    { doorActive: false, windowActive: true, expected: 2.1 },
    { doorActive: true, windowActive: true, expected: 3.64 },
  ])('active area: door $doorActive, window $windowActive', ({ doorActive, windowActive, expected }) => {
    const geometry = getWindowGeometry(createWindow({ ...blockInput,
      door: doorActive ? blockInput.door : { id: 'door', openingType: 'fixed' },
      sections: windowActive ? [active(1400, 'w1', 'tilt_turn')] : blockInput.sections,
    }));
    expect(geometry.activeAreaM2).toBeCloseTo(expected, 12);
  });
  it('uses common opening symbols and hinge sides for door and windows', () => {
    const result = getWindowGeometry(createWindow({ ...blockInput, doorPosition: 'middle', sections: twoWindows }));
    const door = result.sections[1]!;
    const window = result.sections[2]!;
    expect(door.symbols.find((symbol) => symbol.kind === 'turn')!.points[1]!.xMm).toBe(570);
    expect(door.symbols.filter((symbol) => symbol.kind === 'tilt')).toHaveLength(0);
    expect(window.symbols.find((symbol) => symbol.kind === 'turn')!.points[1]!.xMm).toBe(2100);
    expect(window.symbols.filter((symbol) => symbol.kind === 'tilt')).toHaveLength(1);
  });
  it('rejects middle for one window', () => {
    expect(() => createWindow({ ...blockInput, doorPosition: 'middle' })).toThrow('При одном окне');
  });
  it.each([{ sections: [] }, { sections: [fixed(500, 'w1'), fixed(500, 'w2'), fixed(500, 'w3')] }])('rejects unsupported counts', ({ sections }) => {
    expect(() => createWindow({ ...blockInput, sections })).toThrow('1 или 2');
  });
  it.each(['doorWidthMm', 'doorHeightMm', 'windowHeightMm'] as const)('rejects missing/invalid %s', (key) => {
    for (const value of [0, -1, Infinity, NaN]) expect(() => createWindow({ ...blockInput, [key]: value })).toThrow();
  });
  it('rejects missing position, duplicate ids, bad section width and foreign rectangular fields', () => {
    expect(() => createWindow({ ...blockInput, doorPosition: '' } as unknown as WindowInput)).toThrow('положение');
    expect(() => createWindow({ ...blockInput, sections: [fixed(1400, 'door')] })).toThrow('уникальными');
    expect(() => createWindow({ ...blockInput, sections: [fixed(0, 'w1')] })).toThrow();
    expect(() => createWindow({ ...blockInput, widthMm: 2100 } as unknown as WindowInput)).toThrow('общих входных габаритов');
    expect(() => createWindow({ ...blockInput, transom: { openingType: 'fixed', heightMm: 100 } } as unknown as WindowInput)).toThrow('фрамуги');
  });
  it('validates door opening, hinges and hardware with the same invariants as windows', () => {
    for (const door of [
      { id: 'door', openingType: 'turn', hardwareId: 'hardware' },
      { id: 'door', openingType: 'tilt_turn', hingeSide: 'left' },
      { id: 'door', openingType: 'fixed', hardwareId: 'hardware' },
      { id: 'door', openingType: 'fixed', hingeSide: 'right' },
    ]) expect(() => createWindow({ ...blockInput, door } as BalconyBlockInput)).toThrow();
  });
  it('validates door hardware material and existence', () => {
    expect(() => estimateWindow(blockInput, { ...configuration, hardware: [] })).toThrow('Фурнитура');
    expect(() => estimateWindow(blockInput, { ...configuration, hardware: [{ id: 'hardware', name: 'Other', material: 'aluminium' }] })).toThrow('Фурнитура');
  });
  it('pricing regression: base + activity + color, then markup; hardware is not priced separately', () => {
    const config = { ...configuration, profiles: [{ ...profile, productMarkupPercent: 15 }], hardware: [...configuration.hardware, { id: 'other', name: 'Other', material: 'pvc' as const }] };
    const result = estimateWindow({ ...blockInput, lamination: 'one_side' }, config);
    expect(result.price.totalMinor).toBe(4958800);
    expect(result.price.baseAmount).toBeCloseTo(36400);
    expect(result.price.activityAmount).toBeCloseTo(3080);
    expect(result.price.colorAmount).toBeCloseTo(3640);
    const other = estimateWindow({ ...blockInput, lamination: 'one_side', door: { id: 'door', openingType: 'turn', hingeSide: 'right', hardwareId: 'other' } }, config);
    expect(other.price).toEqual(result.price);
  });
  it('door position cannot change pricing, including fractional dimensions', () => {
    const values = { ...blockInput, sections: [active(500.123, 'w1'), active(1000.456, 'w2')], doorWidthMm: 700.789, doorHeightMm: 2200.123, windowHeightMm: 1500.321 };
    const estimates = (['left', 'middle', 'right'] as const).map((doorPosition) => estimateWindow({ ...values, doorPosition }, configuration));
    expect(estimates[0]!.price).toEqual(estimates[1]!.price);
    expect(estimates[1]!.price).toEqual(estimates[2]!.price);
  });
  it('snapshots door parameters and converts back to the same input model', () => {
    const door = { id: 'door', openingType: 'turn' as const, hingeSide: 'right' as const, hardwareId: 'hardware' };
    const measurement = createWindow({ ...blockInput, door });
    door.hardwareId = 'changed';
    expect(toWindowInput(measurement)).toEqual({ ...blockInput, door: { ...door, hardwareId: 'hardware' } });
  });
});
