import type { Section } from '../shared';
import type { WindowMeasurement, WindowType } from './types';

export type WindowInput = Omit<WindowMeasurement, 'kind' | 'plane'> & { sections: readonly Section[] };
export const sectionCounts: Readonly<Record<WindowType, number>> = { single: 1, double: 2, triple: 3 };

function positive(value: number): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error('Размеры должны быть положительными конечными числами.');
}

export function getSectionCount(windowType: WindowType): number {
  if (!Object.hasOwn(sectionCounts, windowType)) throw new Error('Неизвестный тип окна.');
  return sectionCounts[windowType];
}

/** Numerical tolerance only (8 ULP at this magnitude), not a manufacturing allowance. */
export function widthsMatch(widthMm: number, sumMm: number): boolean {
  return Number.isFinite(sumMm) && Math.abs(widthMm - sumMm) <= 8 * Number.EPSILON * Math.max(widthMm, sumMm);
}

/** Explicit creation/reset rule: equal unrounded widths, all fixed. Never used in validation. */
export function createEqualSections(windowType: WindowType, widthMm: number): Section[] {
  positive(widthMm);
  const count = getSectionCount(windowType);
  const width = widthMm / count;
  positive(width);
  return Array.from({ length: count }, (_, index) => ({ id: `section-${index + 1}`, widthMm: width, openingType: 'fixed' }));
}

/** Explicit user action: only widths change; openings/hinges/hardware are retained. */
export function distributeSectionWidths(windowType: WindowType, widthMm: number, sections: readonly Section[]): Section[] {
  const equal = createEqualSections(windowType, widthMm);
  if (sections.length !== equal.length) throw new Error('Количество секций не соответствует типу окна.');
  return sections.map((section, index) => ({ ...section, widthMm: equal[index]!.widthMm }));
}

export function validateSection(section: Section): void {
  positive(section.widthMm);
  if (!section.id.trim()) throw new Error('У секции должен быть идентификатор.');
  if (!['fixed', 'turn', 'tilt_turn'].includes(section.openingType)) throw new Error('Неизвестное открывание.');
  if (section.openingType === 'fixed') {
    if (section.hingeSide !== undefined || section.hardwareId !== undefined) throw new Error('У глухой секции нет петель и фурнитуры.');
  } else {
    if (!['left', 'right'].includes(section.hingeSide)) throw new Error('Укажите сторону петель.');
    if (!section.hardwareId?.trim()) throw new Error('Для активной створки нужна фурнитура.');
  }
}

export function validateWindow(window: WindowMeasurement): void {
  if (window.kind !== 'Window') throw new Error('Ожидается оконный замер.');
  if (![window.id, window.room, window.name, window.profileId, window.plane.id].every((value) => value.trim())) throw new Error('Заполните помещение, название и профиль.');
  positive(window.widthMm);
  positive(window.heightMm);
  if (!['pvc', 'aluminium'].includes(window.material)) throw new Error('Неизвестный материал.');
  if (!['none', 'one_side', 'two_sides'].includes(window.lamination)) throw new Error('Неизвестная ламинация.');
  const sections = window.plane.sections;
  if (sections.length !== getSectionCount(window.windowType)) throw new Error('Количество секций не соответствует типу окна.');
  sections.forEach(validateSection);
  if (new Set(sections.map((section) => section.id)).size !== sections.length) throw new Error('Идентификаторы секций должны быть уникальными.');
  const sum = sections.reduce((value, section) => value + section.widthMm, 0);
  if (!widthsMatch(window.widthMm, sum)) throw new Error(`Сумма ширин секций (${sum} мм) должна равняться ширине окна (${window.widthMm} мм).`);
  if (window.transom !== undefined) {
    positive(window.transom.heightMm);
    if (window.transom.openingType !== 'fixed') throw new Error('Фрамуга всегда глухая.');
    if ('hingeSide' in window.transom || 'hardwareId' in window.transom) throw new Error('У глухой фрамуги нет петель и фурнитуры.');
    if (window.transom.heightMm >= window.heightMm) throw new Error('Высота фрамуги должна быть меньше высоты окна.');
  }
}

export function createWindow(input: WindowInput): WindowMeasurement {
  const { sections, ...attributes } = input;
  const measurement: WindowMeasurement = {
    ...attributes, kind: 'Window', room: input.room.trim(), name: input.name.trim(),
    plane: { id: `${input.id}:plane`, sections: sections.map((section) => ({ ...section })) },
    ...(input.transom === undefined ? {} : { transom: { ...input.transom } }),
  };
  validateWindow(measurement);
  return measurement;
}

export function toWindowInput(window: WindowMeasurement): WindowInput {
  const { kind: _kind, plane, ...attributes } = window;
  return { ...attributes, sections: plane.sections };
}
