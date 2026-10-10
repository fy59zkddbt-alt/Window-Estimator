/** Integer-mm editor operations. Existing fractional measurement validation stays unchanged. */
function positiveInteger(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Ширина должна быть положительным безопасным целым числом миллиметров.');
}

export function sectionWidthsTotal(widths: readonly number[]): number {
  if (!widths.length) throw new Error('Нужна хотя бы одна секция.');
  let total = 0;
  for (const width of widths) {
    positiveInteger(width);
    total += width;
    positiveInteger(total);
  }
  return total;
}

/** Remainder millimetres go left to right: 1001 / 3 -> 334, 334, 333. */
export function distributeSectionWidths(totalWidthMm: number, sectionCount: number): number[] {
  positiveInteger(totalWidthMm);
  if (!Number.isSafeInteger(sectionCount) || sectionCount < 1 || sectionCount > 8) throw new Error('Количество секций: от 1 до 8.');
  if (totalWidthMm < sectionCount) throw new Error('Недостаточная ширина для положительных целых секций.');
  const base = Math.floor(totalWidthMm / sectionCount);
  const remainder = totalWidthMm % sectionCount;
  return Array.from({ length: sectionCount }, (_, index) => base + (index < remainder ? 1 : 0));
}

/** Only the immediate right neighbour compensates. The final section cannot be edited. */
export function updateSectionWidth(totalWidthMm: number, widths: readonly number[], editableIndex: number, newWidthMm: number): number[] {
  positiveInteger(totalWidthMm);
  if (sectionWidthsTotal(widths) !== totalWidthMm) throw new Error('Сумма ширин должна равняться общей ширине.');
  if (!Number.isInteger(editableIndex) || editableIndex < 0 || editableIndex >= widths.length - 1) throw new Error('Последняя секция вычисляется автоматически; выберите редактируемую секцию.');
  positiveInteger(newWidthMm);
  // Subtract before adding, so even safe-integer boundary inputs never overflow.
  const difference = newWidthMm - widths[editableIndex]!;
  const nextWidth = widths[editableIndex + 1]! - difference;
  positiveInteger(nextWidth);
  const result = [...widths];
  result[editableIndex] = newWidthMm;
  result[editableIndex + 1] = nextWidth;
  if (sectionWidthsTotal(result) !== totalWidthMm) throw new Error('Сумма ширин должна равняться общей ширине.');
  return result;
}
