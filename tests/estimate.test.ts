import { describe, expect, it } from 'vitest';
import { estimateWindow } from '../src/application/estimate/estimate-window';
import { createEqualSections } from '../src/domain/measurements/window/create-window';
import { input, configuration, profile, active, fixed } from './fixtures';

describe('estimateWindow', () => {
  it.each(['turn', 'tilt_turn'] as const)('prices single %s exactly as before', (openingType) => {
    const result = estimateWindow({ ...input, sections: [active(1000, 's1', openingType, 'right')] }, configuration);
    expect(result.price.totalMinor).toBe(1800000);
    expect(result.measurement.plane.sections[0]!.hingeSide).toBe('right');
  });
  it('prices fixed exactly as before', () => {
    expect(estimateWindow(input, configuration).price.totalMinor).toBe(1500000);
  });
  it('regression: active single with two-side lamination and markup', () => {
    const result = estimateWindow({ ...input, sections: [active(1000)], lamination: 'two_sides' }, { ...configuration, profiles: [{ ...profile, productMarkupPercent: 15 }] });
    expect(result.price.totalMinor).toBe(2415000);
  });
  it('double fixed + active with transom, lamination and markup', () => {
    const result = estimateWindow({ ...input, windowType: 'double', widthMm: 2000, heightMm: 1800,
      sections: [fixed(700), active(1300, 's2')], transom: { openingType: 'fixed', heightMm: 300 }, lamination: 'one_side',
    }, { ...configuration, profiles: [{ ...profile, productMarkupPercent: 15 }] });
    expect(result.price).toMatchObject({ baseAmount: 36000, colorAmount: 3600, totalMinor: 5002500 });
    expect(result.price.activityAmount).toBeCloseTo(3900);
  });
  it('triple of unequal widths prices active area once', () => {
    const result = estimateWindow({ ...input, windowType: 'triple', widthMm: 2100, sections: [active(500), fixed(700, 's2'), active(900, 's3', 'tilt_turn')] }, configuration);
    expect(result.price.totalMinor).toBe(3570000);
  });
  it('changing hardware alone does not create an additional charge', () => {
    const config = { ...configuration, hardware: [...configuration.hardware, { id: 'premium', name: 'Premium', material: 'pvc' as const }] };
    const normal = estimateWindow({ ...input, sections: [active(1000)] }, config);
    const premium = estimateWindow({ ...input, sections: [{ ...active(1000), hardwareId: 'premium' }] }, config);
    expect(premium.price).toEqual(normal.price);
  });
  it('validates hardware in all active sections, including the last one', () => {
    expect(() => estimateWindow({ ...input, windowType: 'double', sections: [active(500), { ...active(500, 's2'), hardwareId: 'missing' }] }, configuration)).toThrow('Фурнитура');
  });
  it('rejects blank room and unknown profile', () => {
    expect(() => estimateWindow({ ...input, room: ' ' }, configuration)).toThrow();
    expect(() => estimateWindow({ ...input, profileId: 'missing' }, configuration)).toThrow();
  });
  it('rejects profile and hardware material mismatches', () => {
    expect(() => estimateWindow({ ...input, material: 'aluminium' }, configuration)).toThrow();
    expect(() => estimateWindow({ ...input, sections: [active(1000)] }, { ...configuration, hardware: [{ id: 'hardware', name: 'Wrong', material: 'aluminium' }] })).toThrow();
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
  it.each([1000, 1234.56, 0.3, 2801])('handles machine roundoff for three fully active equal sections of %s mm', (widthMm) => {
    const sections = createEqualSections('triple', widthMm).map((section) => active(section.widthMm, section.id));
    const result = estimateWindow({ ...input, windowType: 'triple', widthMm, sections }, configuration);
    expect(result.geometry.activeAreaM2).toBeCloseTo(result.geometry.totalAreaM2, 12);
  });
});
