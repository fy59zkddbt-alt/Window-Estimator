import { describe, expect, it } from 'vitest';
import { createWindow, type WindowInput } from '../src/domain/measurements/window/create-window';
import { getWindowGeometry } from '../src/domain/geometry/window-geometry';
import { active, fixed, input } from './fixtures';

const geometry = (patch: Partial<WindowInput> = {}) => getWindowGeometry(createWindow({ ...input, ...patch }));

describe('window geometry', () => {
  it('single fixed: converts mm to m² and has no active area or symbols', () => {
    expect(geometry()).toMatchObject({ totalAreaM2: 1.5, activeAreaM2: 0, transom: null, sections: [{ xMm: 0, yMm: 0, widthMm: 1000, heightMm: 1500, symbols: [] }] });
  });
  it.each(['turn', 'tilt_turn'] as const)('single %s: whole section is active', (openingType) => {
    expect(geometry({ sections: [active(1000, 's1', openingType)] })).toMatchObject({ totalAreaM2: 1.5, activeAreaM2: 1.5 });
  });
  it('double fixed + active uses only the active section area', () => {
    const result = geometry({ windowType: 'double', widthMm: 1600, sections: [fixed(600), active(1000, 's2')] });
    expect(result.totalAreaM2).toBeCloseTo(2.4);
    expect(result.activeAreaM2).toBe(1.5);
    expect(result.sections.map(({ xMm, widthMm }) => [xMm, widthMm])).toEqual([[0, 600], [600, 1000]]);
  });
  it('triple with different widths has contiguous rectangles and correct active area', () => {
    const result = geometry({ windowType: 'triple', widthMm: 2100, sections: [active(500), fixed(700, 's2'), active(900, 's3', 'tilt_turn', 'right')] });
    expect(result.totalAreaM2).toBeCloseTo(3.15);
    expect(result.activeAreaM2).toBeCloseTo(2.1);
    expect(result.sections.map(({ xMm, widthMm }) => [xMm, widthMm])).toEqual([[0, 500], [500, 700], [1200, 900]]);
  });
  it('transom is full width and fixed, includes total area but excludes active area', () => {
    const result = geometry({ windowType: 'double', widthMm: 2000, heightMm: 1800, sections: [active(700), active(1300, 's2', 'tilt_turn')], transom: { openingType: 'fixed', heightMm: 300 } });
    expect(result.totalAreaM2).toBe(3.6);
    expect(result.activeAreaM2).toBe(3);
    expect(result.transom).toEqual({ openingType: 'fixed', xMm: 0, yMm: 0, widthMm: 2000, heightMm: 300, areaM2: 0.6 });
    expect(result.sections.map(({ yMm, heightMm }) => [yMm, heightMm])).toEqual([[300, 1500], [300, 1500]]);
    expect(result.sections.reduce((sum, section) => sum + section.areaM2, result.transom!.areaM2)).toBeCloseTo(result.totalAreaM2);
  });
  it('mixed fixed/active with transom counts neither fixed region as active', () => {
    const result = geometry({ windowType: 'double', widthMm: 2000, heightMm: 1800, sections: [fixed(700), active(1300, 's2')], transom: { openingType: 'fixed', heightMm: 300 } });
    expect(result.activeAreaM2).toBeCloseTo(1.95);
  });
  it('does not round fractional area', () => {
    expect(geometry({ widthMm: 1234, heightMm: 1567, sections: [fixed(1234)] }).totalAreaM2).toBeCloseTo(1.933678, 10);
  });
  it.each([[2400, 1200], [900, 2100], [1500, 1500]])('preserves outer and section aspect ratios for %s × %s', (widthMm, heightMm) => {
    const result = geometry({ windowType: 'double', widthMm, heightMm, sections: [fixed(widthMm / 4), active(widthMm * 3 / 4, 's2')], transom: { openingType: 'fixed', heightMm: heightMm / 4 } });
    expect(result.bounds.widthMm / result.bounds.heightMm).toBe(widthMm / heightMm);
    expect(result.sections[1]!.widthMm / result.sections[0]!.widthMm).toBe(3);
    expect(result.sections[0]!.widthMm / result.sections[0]!.heightMm).toBeCloseTo((widthMm / 4) / (heightMm * 3 / 4));
    expect(result.transom!.heightMm / result.bounds.heightMm).toBe(0.25);
  });
  it('opening symbols follow hinge side and tilt-turn adds a tilt triangle', () => {
    const left = geometry({ sections: [active(1000)] }).sections[0]!;
    const right = geometry({ sections: [active(1000, 's1', 'tilt_turn', 'right')] }).sections[0]!;
    expect(left.symbols.find((symbol) => symbol.kind === 'turn')!.points[1]!.xMm).toBe(100);
    expect(right.symbols.find((symbol) => symbol.kind === 'turn')!.points[1]!.xMm).toBe(900);
    expect(left.symbols.filter((symbol) => symbol.kind === 'tilt')).toHaveLength(0);
    expect(right.symbols.filter((symbol) => symbol.kind === 'tilt')).toHaveLength(1);
    expect(right.symbols.filter((symbol) => symbol.kind === 'hinge').every((symbol) => symbol.points.every((point) => point.xMm === 900))).toBe(true);
  });
  it('symbols remain inside their section after x and transom offsets', () => {
    const result = geometry({ windowType: 'double', widthMm: 2000, sections: [fixed(800), active(1200, 's2', 'tilt_turn')], transom: { openingType: 'fixed', heightMm: 500 } });
    const section = result.sections[1]!;
    for (const symbol of section.symbols) for (const point of symbol.points) {
      expect(point.xMm).toBeGreaterThan(section.xMm);
      expect(point.xMm).toBeLessThan(section.xMm + section.widthMm);
      expect(point.yMm).toBeGreaterThan(section.yMm);
      expect(point.yMm).toBeLessThan(section.yMm + section.heightMm);
    }
  });
});
