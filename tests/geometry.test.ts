import { describe, expect, it } from 'vitest';
import { createWindow } from '../src/domain/measurements/window/create-window';
import { getWindowGeometry } from '../src/domain/geometry/window-geometry';
import { input } from './fixtures';

describe('single-window geometry', () => {
  it('converts millimetres to square metres for fixed', () => {
    expect(getWindowGeometry(createWindow(input))).toEqual({ totalArea: 1.5, activeArea: 0 });
  });
  it.each(['turn', 'tilt_turn'] as const)('%s uses whole section as active area', (openingType) => {
    expect(getWindowGeometry(createWindow({ ...input, openingType, hingeSide: 'left', hardwareId: 'hardware' }))).toEqual({ totalArea: 1.5, activeArea: 1.5 });
  });
  it.each([0, -1, NaN, Infinity])('rejects invalid dimension %s', (widthMm) => {
    expect(() => createWindow({ ...input, widthMm })).toThrow();
    expect(() => createWindow({ ...input, heightMm: widthMm })).toThrow();
  });
  it('does not round fractional area', () => {
    expect(getWindowGeometry(createWindow({ ...input, widthMm: 1234, heightMm: 1567 })).totalArea).toBeCloseTo(1.933678, 10);
  });
});
