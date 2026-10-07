import type { CommercialRoundingStepRub } from './configuration/vnext/types';

/** Public/persisted money is a nonnegative safe integer in RUB minor units. */
export function assertMinor(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Некорректная денежная сумма.');
}

/** Arithmetic only: the application decides which amounts belong in a total. */
export function sumMinor(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    assertMinor(value);
    total += value;
    if (!Number.isSafeInteger(total)) throw new Error('Сумма вне безопасного числового диапазона.');
  }
  return total;
}

const maxMinor = BigInt(Number.MAX_SAFE_INTEGER);

function safeMinor(value: bigint): number {
  if (value < 0n || value > maxMinor) throw new Error('Сумма вне безопасного числового диапазона.');
  return Number(value);
}

// Called with nonnegative numerators and positive denominators only.
function halfUp(numerator: bigint, denominator: bigint): bigint {
  return (2n * numerator + denominator) / (2n * denominator);
}

/**
 * Interpret the shortest round-trip decimal representation of the input number,
 * including exponents. This matches the number/JSON contract and the existing
 * discount semantics; it cannot recover precision already lost before the call.
 * BigInts are transient and never leave this module or enter storage.
 */
function decimalRatio(value: number): { numerator: bigint; denominator: bigint } {
  const [coefficient, exponent = '0'] = String(value).split('e');
  const [whole, fraction = ''] = coefficient!.split('.');
  const scale = fraction.length - Number(exponent);
  const digits = BigInt(whole! + fraction);
  return scale >= 0
    ? { numerator: digits, denominator: 10n ** BigInt(scale) }
    : { numerator: digits * 10n ** BigInt(-scale), denominator: 1n };
}

/** Transient exact money expression. Only numbers from toRub/toMinor may enter DTOs.
 * Unlike the integer helpers, these operations retain fractional kopecks until
 * a complete pricing line reaches its monetary boundary.
 */
export interface ExactMoney {
  times(factor: number): ExactMoney;
  percentage(percent: number): ExactMoney;
  plus(other: ExactMoney): ExactMoney;
  toMinor(): number;
  /** Informational RUB breakdown only; never feed this approximation into arithmetic. */
  toRub(): number;
}

function nonnegativeFactor(value: number): void {
  if (!Number.isFinite(value) || value < 0) throw new Error('Ожидается конечное неотрицательное число.');
}

class MoneyExpression implements ExactMoney {
  readonly #numerator: bigint;
  readonly #denominator: bigint;
  constructor(numerator: bigint, denominator: bigint) {
    let a = numerator; let b = denominator;
    while (b !== 0n) { const remainder = a % b; a = b; b = remainder; }
    this.#numerator = numerator / a;
    this.#denominator = denominator / a;
  }
  times(factor: number): ExactMoney {
    nonnegativeFactor(factor);
    const ratio = decimalRatio(factor);
    return new MoneyExpression(this.#numerator * ratio.numerator, this.#denominator * ratio.denominator);
  }
  percentage(percent: number): ExactMoney {
    nonnegativeFactor(percent);
    const ratio = decimalRatio(percent);
    return new MoneyExpression(this.#numerator * ratio.numerator, this.#denominator * ratio.denominator * 100n);
  }
  plus(other: ExactMoney): ExactMoney {
    if (!(other instanceof MoneyExpression)) throw new Error('Некорректное денежное выражение.');
    return new MoneyExpression(this.#numerator * other.#denominator + other.#numerator * this.#denominator,
      this.#denominator * other.#denominator);
  }
  private assertRange(): void {
    if (this.#numerator > maxMinor * this.#denominator) throw new Error('Сумма вне безопасного числового диапазона.');
  }
  toMinor(): number {
    this.assertRange();
    return safeMinor(halfUp(this.#numerator, this.#denominator));
  }
  toRub(): number {
    this.assertRange();
    // A numeric breakdown is approximate, whereas toMinor always uses exact integers.
    const numerator = this.#numerator.toString();
    const denominator = (this.#denominator * 100n).toString();
    const leading = (digits: string) => Number(digits.slice(0, 16)) / 10 ** (Math.min(16, digits.length) - 1);
    return Number(`${leading(numerator) / leading(denominator)}e${numerator.length - denominator.length}`);
  }
}

/** RUB rate may include fractional kopecks; no rounding is performed here. */
export function moneyFromRub(value: number): ExactMoney {
  nonnegativeFactor(value);
  const ratio = decimalRatio(value);
  return new MoneyExpression(ratio.numerator * 100n, ratio.denominator);
}

function scaledMinor(amountMinor: number, factor: number, divisor: bigint): number {
  assertMinor(amountMinor);
  const decimal = decimalRatio(factor);
  const numerator = BigInt(amountMinor) * decimal.numerator;
  const denominator = decimal.denominator * divisor;
  if (numerator > maxMinor * denominator) throw new Error('Сумма вне безопасного числового диапазона.');
  return safeMinor(halfUp(numerator, denominator));
}

/** Monetary boundary only: round fractional kopecks half-up, without commercial rounding.
 * Do not use to round individual intermediate pricing components.
 */
export function multiplyMinorByQuantity(unitPriceMinor: number, quantity: number): number {
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Количество должно быть конечным положительным числом.');
  return scaledMinor(unitPriceMinor, quantity, 1n);
}

/** Exact percentage amount rounded once to kopecks; no discount orchestration. */
export function percentageMinor(amountMinor: number, percent: number): number {
  if (!Number.isFinite(percent) || percent < 0) throw new Error('Процент должен быть конечным неотрицательным числом.');
  return scaledMinor(amountMinor, percent, 100n);
}

/**
 * Explicit client-price boundary. Nearest 10/50/100 RUB; half a step rounds up.
 * Never automatically apply to cost basis, salary, intermediate markups, manual
 * final finish prices or fixed final order prices. Application owns that choice.
 */
export function commercialRoundMinor(priceMinor: number, stepRub: CommercialRoundingStepRub): number {
  assertMinor(priceMinor);
  if (stepRub !== 10 && stepRub !== 50 && stepRub !== 100) throw new Error('Неизвестный шаг округления.');
  const stepMinor = BigInt(stepRub) * 100n;
  return safeMinor(halfUp(BigInt(priceMinor), stepMinor) * stepMinor);
}
