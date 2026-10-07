// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { assertMinor, commercialRoundMinor, multiplyMinorByQuantity, percentageMinor, sumMinor } from '../src/domain/money';
import type { CommercialRoundingStepRub } from '../src/domain/configuration/vnext/types';

const max = Number.MAX_SAFE_INTEGER;
const invalidMoney = [-1, 0.5, NaN, Infinity, -Infinity, max + 1];

describe.each([10, 50, 100] as const)('commercial rounding: %s RUB', (step) => {
  const minorStep = step * 100;
  it.each([-1, 0, 1])('rounds around half a step, offset %s kopecks', (offset) => {
    expect(commercialRoundMinor(2 * minorStep + minorStep / 2 + offset, step))
      .toBe(offset < 0 ? 2 * minorStep : 3 * minorStep);
    expect(commercialRoundMinor(minorStep / 2 + offset, step)).toBe(offset < 0 ? 0 : minorStep);
  });
  it('preserves zero and exact multiples', () => {
    expect(commercialRoundMinor(0, step)).toBe(0);
    expect(commercialRoundMinor(7 * minorStep, step)).toBe(7 * minorStep);
  });
  it('handles large safe amounts without overflowing or clamping', () => {
    const largestMultiple = Number(BigInt(max) / BigInt(minorStep) * BigInt(minorStep));
    expect(commercialRoundMinor(largestMultiple, step)).toBe(largestMultiple);
    expect(commercialRoundMinor(largestMultiple - minorStep / 2, step)).toBe(largestMultiple);
    expect(commercialRoundMinor(largestMultiple - minorStep / 2 - 1, step)).toBe(largestMultiple - minorStep);
    // MAX_SAFE_INTEGER ends in 0991: only the 10 RUB step rounds it out of range.
    if (step === 10) expect(() => commercialRoundMinor(max, step)).toThrow();
    else expect(commercialRoundMinor(max, step)).toBe(largestMultiple);
  });
});

describe('decimal quantity multiplication', () => {
  it.each([
    [100, 1, 100], [100, 2, 200], [100, 0.5, 50], [100, 1.5, 150],
    [100, 2.5, 250], [100, 0.1, 10], [100, 0.2, 20],
    [10000, 1.2345, 12345], [100, 1.005, 101],
    [1, 0.49999999999999994, 0], [1, 0.5, 1], [1, 0.5000000000000001, 1],
    [1, 1.5, 2], [1, 2.5, 3], [10, 0.15, 2],
    [10000000, 1e-7, 1], [max, 1, max], [max, 0.5, 4503599627370496],
    [max, 0.1, 900719925474099], [1, Number.MIN_VALUE, 0],
    [0, Number.MAX_VALUE, 0], [0, 1e21, 0], [0, 0.5, 0],
  ])('%s kopecks × %s = %s kopecks', (price, quantity, expected) => {
    const result = multiplyMinorByQuantity(price, quantity);
    expect(result).toBe(expected);
    expect(Number.isSafeInteger(result)).toBe(true);
  });
  it.each([0, -1, NaN, Infinity, -Infinity])('rejects quantity %s even for a free item', (quantity) => {
    expect(() => multiplyMinorByQuantity(100, quantity)).toThrow();
    expect(() => multiplyMinorByQuantity(0, quantity)).toThrow();
  });
  it.each([[max, 2], [max, 1.0000000000000002], [1, 1e21], [1, Number.MAX_VALUE]])
    ('rejects multiplication overflow: %s × %s', (price, quantity) => {
      expect(() => multiplyMinorByQuantity(price, quantity)).toThrow();
    });
  it('uses the same decimal value after a JSON round trip, without a decimal-place cap', () => {
    const quantity: number = JSON.parse(JSON.stringify(0.1234567890123456));
    expect(multiplyMinorByQuantity(1000000000000000, quantity)).toBe(123456789012346);
  });
});

describe('safe money and explicit rounding boundaries', () => {
  it.each(invalidMoney)('rejects invalid minor amount %s at every boundary', (value) => {
    expect(() => assertMinor(value)).toThrow();
    expect(() => sumMinor([value])).toThrow();
    expect(() => multiplyMinorByQuantity(value, 1)).toThrow();
    expect(() => percentageMinor(value, 50)).toThrow();
    expect(() => commercialRoundMinor(value, 100)).toThrow();
  });
  it.each([0, -10, 1, 25, 10.5, NaN, Infinity, '10', null, undefined])('rejects runtime rounding step %s', (step) => {
    expect(() => commercialRoundMinor(100, step as CommercialRoundingStepRub)).toThrow();
  });
  it('rejects unsupported steps at compile time too', () => {
    // @ts-expect-error Only 10, 50 and 100 RUB are supported.
    expect(() => commercialRoundMinor(100, 25)).toThrow();
  });
  it('sums safely without rounding, including empty and maximum totals', () => {
    expect(sumMinor([])).toBe(0);
    expect(sumMinor([0, max - 1, 1])).toBe(max);
    expect(() => sumMinor([max, 1])).toThrow();
    expect(() => sumMinor([max - 1, 2])).toThrow();
  });
  it('keeps cost amounts unrounded commercially until explicitly asked for a client price', () => {
    const costMinor = multiplyMinorByQuantity(12345, 2);
    expect(costMinor).toBe(24690);
    expect(sumMinor([costMinor, 111])).toBe(24801);
    expect(commercialRoundMinor(costMinor, 100)).toBe(20000);
    expect(costMinor).toBe(24690);
  });
  it('can compose the work boundary: kopecks first, commercial step second', () => {
    expect(multiplyMinorByQuantity(1, 499.5)).toBe(500);
    expect(commercialRoundMinor(multiplyMinorByQuantity(1, 499.5), 10)).toBe(1000);
  });
  it('runs in Node without browser globals and returns serializable integer money', () => {
    expect(typeof window).toBe('undefined');
    const results = [sumMinor([123, 456]), multiplyMinorByQuantity(123, 0.5), percentageMinor(123, 50), commercialRoundMinor(12345, 50)];
    expect(results.every(Number.isSafeInteger)).toBe(true);
    expect(JSON.parse(JSON.stringify(results))).toEqual(results);
  });
});

describe('reusable exact percentage amount', () => {
  it.each([[10000, 1.005, 101], [1, 50, 1], [1, 49.99, 0], [1, 50.01, 1],
    [max, 100, max], [max, 50, 4503599627370496], [100, 0, 0],
    [10000, 1e-7, 0], [100, 150, 150], [0, Number.MAX_VALUE, 0]])
    ('%s kopecks × %s percent = %s', (amount, percent, expected) => {
      expect(percentageMinor(amount, percent)).toBe(expected);
    });
  it.each([-1, NaN, Infinity, -Infinity])('rejects invalid percent %s', (percent) => {
    expect(() => percentageMinor(100, percent)).toThrow();
  });
  it('rejects percentage overflow', () => {
    expect(() => percentageMinor(max, 101)).toThrow();
  });
});
