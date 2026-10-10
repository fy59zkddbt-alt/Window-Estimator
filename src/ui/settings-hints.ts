const rub = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
/** Display-only illustrations, never persisted or supplied to an estimate. */
export function percentageHint(base: number, percent: number, active = false): string {
  const amount = base * percent / 100;
  if (![base, percent, amount].every((value) => Number.isFinite(value) && value >= 0)) return 'Укажите корректные базовую стоимость и процент для примера.';
  return active
    ? `При активной площади 1 м² эта надбавка добавит ${rub.format(amount)} ₽ к базовой стоимости. Надбавка применяется только к площади открывающихся створок.`
    : `+${rub.format(percent)}% = ${rub.format(amount)} ₽ на 1 м² применимой площади при текущей базовой стоимости.`;
}
export const productMarkupExplanation = 'Общая наценка изделия применяется один раз после сложения базовой стоимости и дополнительных надбавок.';
export const glazingExplanation = 'Надбавки за открывающиеся створки, ламинацию, доборы и соединители считаются отдельно от базовой стоимости и не начисляются друг на друга. Затем суммы складываются. Общая наценка изделия применяется один раз к этой сумме. Монтаж рассчитывается отдельно.';
