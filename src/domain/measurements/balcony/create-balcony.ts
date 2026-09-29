import type { BalconyMeasurement, BalconyPlane, BalconySection, PlanePosition } from './types';
import { normalizeAdditionalWorks } from '../../works/types';
import { validateOpeningElement, widthsMatch } from '../window/create-window';

export type BalconyInput = Omit<BalconyMeasurement, 'kind' | 'additionalWorks'> & { additionalWorks?: BalconyMeasurement['additionalWorks'] };
export function balconyPositions(type: BalconyMeasurement['balconyType'], side?: BalconyMeasurement['side']): PlanePosition[] {
  if (type === 'straight') return ['facade'];
  if (type === 'U') return ['left', 'facade', 'right'];
  if (type === 'L' && side === 'left') return ['left', 'facade'];
  if (type === 'L' && side === 'right') return ['facade', 'right'];
  throw new Error('Выберите тип балкона и сторону L.');
}
function positive(value: number) { if (!Number.isFinite(value) || value <= 0) throw new Error('Размеры плоскости должны быть положительными конечными числами.'); }
export function equalBalconySections(widthMm: number, count: number): BalconySection[] {
  positive(widthMm);
  if (!Number.isInteger(count) || count < 1 || count > 8) throw new Error('Количество секций: от 1 до 8.');
  positive(widthMm / count);
  return Array.from({ length: count }, (_, i) => ({ id: `section-${i + 1}`, widthMm: widthMm / count, openingType: 'fixed' }));
}
export function validateBalcony(value: BalconyMeasurement): void {
  if (value.kind !== 'Balcony') throw new Error('Ожидается замер балкона.');
  if (![value.id, value.room, value.name, value.profileId].every((s) => typeof s === 'string' && s.trim())) throw new Error('Заполните помещение, название и профиль.');
  if (!['pvc', 'aluminium'].includes(value.material) || !['none', 'one_side', 'two_sides'].includes(value.lamination)) throw new Error('Неизвестный материал или ламинация.');
  if (value.balconyType !== 'L' && value.side !== undefined) throw new Error('Сторона задаётся только для L.');
  const positions = balconyPositions(value.balconyType, value.side);
  if (value.planes.length !== positions.length || new Set(value.planes.map((p) => p.id)).size !== positions.length) throw new Error('Неверный набор плоскостей.');
  value.planes.forEach((plane, i) => {
    if (!plane.id.trim() || !plane.name.trim() || plane.position !== positions[i]) throw new Error('Неверное имя или положение плоскости.');
    positive(plane.widthMm); positive(plane.heightMm);
    if (!Number.isInteger(plane.sectionCount) || plane.sectionCount < 1 || plane.sectionCount > 8 || plane.sections.length !== plane.sectionCount) throw new Error('Количество секций: от 1 до 8.');
    if (new Set(plane.sections.map((s) => s.id)).size !== plane.sections.length) throw new Error('ID секций должны быть уникальны внутри плоскости.');
    plane.sections.forEach((section) => {
      positive(section.widthMm);
      if (!section.id.trim()) throw new Error('У секции должен быть ID.');
      if (value.material === 'aluminium') {
        if (!['fixed', 'sliding'].includes(section.openingType) || section.hingeSide !== undefined || section.hardwareId !== undefined) throw new Error('Алюминий: fixed/sliding без петель и PVC-фурнитуры.');
      } else {
        if (section.openingType === 'sliding') throw new Error('PVC не поддерживает sliding.');
        validateOpeningElement(section);
      }
    });
    if (!widthsMatch(plane.widthMm, plane.sections.reduce((sum, s) => sum + s.widthMm, 0))) throw new Error(`Сумма ширин секций должна равняться ширине плоскости «${plane.name}».`);
    if (plane.levels.mode === 'twoLevel') {
      positive(plane.levels.splitHeightMm);
      if (plane.levels.splitHeightMm >= plane.heightMm || !['glass', 'sandwich'].includes(plane.levels.lowerFill)) throw new Error('Нижний ярус должен быть ниже полной высоты; выберите заполнение.');
    } else if (plane.levels.mode !== 'oneLevel' || plane.levels.splitHeightMm !== undefined || plane.levels.lowerFill !== undefined) throw new Error('Неверная ярусность.');
  });
  normalizeAdditionalWorks(value.additionalWorks);
}
export function createBalcony(input: BalconyInput): BalconyMeasurement {
  const value: BalconyMeasurement = { ...input, kind: 'Balcony', room: input.room.trim(), name: input.name.trim(),
    additionalWorks: normalizeAdditionalWorks(input.additionalWorks),
    planes: input.planes.map((p): BalconyPlane => ({ ...p, levels: { ...p.levels }, sections: p.sections.map((s) => ({ ...s })) })) };
  validateBalcony(value);
  return value;
}
