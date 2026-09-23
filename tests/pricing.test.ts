import { describe, expect, it } from 'vitest';
import { priceGlazing } from '../src/domain/pricing/glazing-pricing';
import { profile } from './fixtures';

describe('Pricing Engine', () => {
  it('fixed costs base area only', () => {
    expect(priceGlazing({ totalArea: 1.5, activeArea: 0 }, profile, 'none').totalMinor).toBe(1500000);
  });
  it.each(['one_side', 'two_sides'] as const)('applies %s color to total area', (lamination) => {
    expect(priceGlazing({ totalArea: 1.5, activeArea: 0 }, profile, lamination).totalMinor).toBe(lamination === 'one_side' ? 1650000 : 1800000);
  });
  it('applies markup after activity and color additions', () => {
    expect(priceGlazing({ totalArea: 1.5, activeArea: 1.5 }, { ...profile, productMarkupPercent: 15 }, 'two_sides')).toMatchObject({ baseAmount: 15000, activityAmount: 3000, colorAmount: 3000, subtotal: 21000, totalMinor: 2415000 });
  });
  it('activity and color are additive, not compounded', () => {
    expect(priceGlazing({ totalArea: 2, activeArea: 1 }, profile, 'one_side').totalMinor).toBe(2400000);
  });
  it('rounds final amount to kopecks', () => {
    expect(priceGlazing({ totalArea: 1, activeArea: 0 }, { ...profile, basePricePerM2: 1.005 }, 'none').totalMinor).toBe(101);
  });
  it('allows free profiles', () => {
    expect(priceGlazing({ totalArea: 1, activeArea: 1 }, { ...profile, basePricePerM2: 0 }, 'two_sides').totalMinor).toBe(0);
  });
  it.each(['basePricePerM2', 'activityPercent', 'laminateOneSidePercent', 'laminateTwoSidesPercent', 'productMarkupPercent'] as const)('validates %s', (key) => {
    for (const value of [-1, Infinity, NaN]) expect(() => priceGlazing({ totalArea: 1, activeArea: 0 }, { ...profile, [key]: value }, 'none')).toThrow();
  });
  it.each([{ totalArea: 0, activeArea: 0 }, { totalArea: 1, activeArea: 2 }, { totalArea: 1, activeArea: -1 }, { totalArea: Infinity, activeArea: 0 }])('rejects invalid areas', (geometry) => {
    expect(() => priceGlazing(geometry, profile, 'none')).toThrow();
  });
  it('rejects monetary overflow', () => {
    expect(() => priceGlazing({ totalArea: 1e100, activeArea: 0 }, profile, 'none')).toThrow();
  });
});
