import type { Lamination, Material, MeasurementIdentity, Opening, Section } from '../shared';
import type { WindowMeasurement } from './types';

export type SingleWindowInput = MeasurementIdentity & Opening & {
  widthMm: number; heightMm: number; material: Material;
  profileId: string; hardwareId: string | null; lamination: Lamination;
};

export function validateSection(section: Section): void {
  for (const dimension of [section.widthMm, section.heightMm]) {
    if (!Number.isFinite(dimension) || dimension <= 0) throw new Error('Размеры должны быть положительными конечными числами.');
  }
  if (!['fixed', 'turn', 'tilt_turn'].includes(section.openingType)) throw new Error('Неизвестное открывание.');
  if (section.openingType === 'fixed') {
    if (section.hingeSide !== undefined) throw new Error('У глухой секции нет петель.');
  } else if (!['left', 'right'].includes(section.hingeSide)) throw new Error('Укажите сторону петель.');
}

export function validateWindow(window: WindowMeasurement): void {
  if (window.kind !== 'Window' || window.plane.sections.length !== 1) throw new Error('Поддерживается только одностворчатое окно.');
  if (![window.id, window.room, window.name, window.profileId].every((value) => value.trim())) throw new Error('Заполните помещение, название и профиль.');
  if (!['pvc', 'aluminium'].includes(window.material)) throw new Error('Неизвестный материал.');
  if (!['none', 'one_side', 'two_sides'].includes(window.lamination)) throw new Error('Неизвестная ламинация.');
  validateSection(window.plane.sections[0]);
  if (window.plane.sections[0].openingType !== 'fixed' && !window.hardwareId?.trim()) throw new Error('Для активной створки нужна фурнитура.');
}

export function createWindow(input: SingleWindowInput): WindowMeasurement {
  const opening: Opening = input.openingType === 'fixed'
    ? { openingType: 'fixed' }
    : { openingType: input.openingType, hingeSide: input.hingeSide };
  const measurement: WindowMeasurement = {
    kind: 'Window', id: input.id, room: input.room.trim(), name: input.name.trim(),
    material: input.material, profileId: input.profileId, hardwareId: input.hardwareId,
    lamination: input.lamination,
    plane: { id: `${input.id}:plane`, sections: [{ id: `${input.id}:section`, widthMm: input.widthMm, heightMm: input.heightMm, ...opening }] },
  };
  validateWindow(measurement);
  return measurement;
}
