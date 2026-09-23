import { describe, expect, it } from 'vitest';
import { estimateWindow } from '../src/application/estimate/estimate-window';
import { input, configuration, profile } from './fixtures';
import type { SingleWindowInput } from '../src/domain/measurements/window/create-window';

describe('estimateWindow', () => {
  it.each(['turn', 'tilt_turn'] as const)('prices %s as active', (openingType) => {
    const result = estimateWindow({ ...input, openingType, hingeSide: 'right', hardwareId: 'hardware' }, configuration);
    expect(result.price.totalMinor).toBe(1800000);
    expect(result.measurement.plane.sections[0].hingeSide).toBe('right');
  });
  it('prices fixed and preserves input', () => {
    expect(estimateWindow(input, configuration).price.totalMinor).toBe(1500000);
    expect(input.widthMm).toBe(1000);
  });
  it('requires hinges and hardware for active sashes', () => {
    expect(() => estimateWindow({ ...input, openingType: 'turn', hardwareId: 'hardware' } as SingleWindowInput, configuration)).toThrow();
    expect(() => estimateWindow({ ...input, openingType: 'turn', hingeSide: 'left' }, configuration)).toThrow();
  });
  it('rejects blank room and unknown profile', () => {
    expect(() => estimateWindow({ ...input, room: ' ' }, configuration)).toThrow();
    expect(() => estimateWindow({ ...input, profileId: 'missing' }, configuration)).toThrow();
  });
  it('rejects material mismatches', () => {
    expect(() => estimateWindow({ ...input, material: 'aluminium' }, configuration)).toThrow();
    expect(() => estimateWindow({ ...input, openingType: 'turn', hingeSide: 'left', hardwareId: 'hardware' }, { ...configuration, hardware: [{ id: 'hardware', name: 'Wrong', material: 'aluminium' }] })).toThrow();
  });
  it('uses the same pricing for aluminium', () => {
    expect(estimateWindow({ ...input, material: 'aluminium' }, { ...configuration, profiles: [{ ...profile, material: 'aluminium' }] }).price.totalMinor).toBe(1500000);
  });
  it('keeps an independent configuration snapshot', () => {
    const mutable = { ...profile };
    const result = estimateWindow(input, { ...configuration, profiles: [mutable] });
    mutable.basePricePerM2 = 999;
    expect(result.configuration.profiles[0]?.basePricePerM2).toBe(10000);
  });
});
