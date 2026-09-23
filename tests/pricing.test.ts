import { describe, expect, it } from 'vitest';
import { priceGlazing } from '../src/domain/pricing/glazing-pricing';
import { profile } from './fixtures';

describe('Pricing Engine', () => {
  it('fixed costs base area only', () => {
    expect(priceGlazing({ totalAreaM2: 1.5, activeAreaM2: 0 }, profile, 'none').totalMinor).toBe(1500000);
  });
  it.each(['one_side', 'two_sides'] as const)('applies %s color to total area', (lamination) => {
    expect(priceGlazing({ totalAreaM2: 1.5, activeAreaM2: 0 }, profile, lamination).totalMinor).toBe(lamination === 'one_side' ? 1650000 : 1800000);
  });
  it('applies markup after activity and color additions', () => {
    expect(priceGlazing({ totalAreaM2: 1.5, activeAreaM2: 1.5 }, { ...profile, productMarkupPercent: 15 }, 'two_sides')).toMatchObject({ baseAmount: 15000, activityAmount: 3000, colorAmount: 3000, subtotal: 21000, totalMinor: 2415000 });
  });
  it('activity and color are additive, not compounded', () => {
    expect(priceGlazing({ totalAreaM2: 2, activeAreaM2: 1 }, profile, 'one_side').totalMinor).toBe(2400000);
  });
  it('rounds final amount to kopecks', () => {
    expect(priceGlazing({ totalAreaM2: 1, activeAreaM2: 0 }, { ...profile, basePricePerM2: 1.005 }, 'none').totalMinor).toBe(101);
  });
  it('allows free profiles', () => {
    expect(priceGlazing({ totalAreaM2: 1, activeAreaM2: 1 }, { ...profile, basePricePerM2: 0 }, 'two_sides').totalMinor).toBe(0);
  });
  it.each(['basePricePerM2', 'activityPercent', 'laminateOneSidePercent', 'laminateTwoSidesPercent', 'productMarkupPercent'] as const)('validates %s', (key) => {
    for (const value of [-1, Infinity, NaN]) expect(() => priceGlazing({ totalAreaM2: 1, activeAreaM2: 0 }, { ...profile, [key]: value }, 'none')).toThrow();
  });
  it.each([{ totalAreaM2: 0, activeAreaM2: 0 }, { totalAreaM2: 1, activeAreaM2: 2 }, { totalAreaM2: 1, activeAreaM2: -1 }, { totalAreaM2: Infinity, activeAreaM2: 0 }])('rejects invalid areas', (geometry) => {
    expect(() => priceGlazing(geometry, profile, 'none')).toThrow();
  });
  it('rejects monetary overflow', () => {
    expect(() => priceGlazing({ totalAreaM2: 1e100, activeAreaM2: 0 }, profile, 'none')).toThrow();
  });
});
