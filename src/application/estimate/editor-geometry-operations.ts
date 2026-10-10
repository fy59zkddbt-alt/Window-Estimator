import { distributeSectionWidths, sectionWidthsTotal, updateSectionWidth } from '../../domain/geometry/section-widths';
import { getSectionCount } from '../../domain/measurements/window/create-window';
import type { RectangularWindowType } from '../../domain/measurements/window/types';
import { validateGlazingMeasurement, type WindowMeasurement, type BalconyMeasurement } from '../../domain/measurements/vnext';

export { distributeSectionWidths, updateSectionWidth } from '../../domain/geometry/section-widths';

function withWidths<T extends { sections: readonly { widthMm: number }[] }>(plane: T, widths: readonly number[]): T {
  if (plane.sections.length !== widths.length) throw new Error('Количество секций не соответствует геометрии.');
  return { ...plane, sections: plane.sections.map((section, index) => ({ ...section, widthMm: widths[index]! })) };
}

function checked<T extends WindowMeasurement | BalconyMeasurement>(value: T): T {
  validateGlazingMeasurement(value);
  return value;
}

/** For a block, totalWidthMm is ONLY the window part. Door dimensions are untouched. */
export function resizeWindowWidth(value: WindowMeasurement, totalWidthMm: number): WindowMeasurement {
  const count = value.windowType === 'balconyBlock' ? value.plane.sections.length : getSectionCount(value.windowType);
  const plane = withWidths(value.plane, distributeSectionWidths(totalWidthMm, count));
  return checked({ ...value, ...(value.windowType === 'balconyBlock' ? {} : { widthMm: totalWidthMm }), plane } as WindowMeasurement);
}

export function editWindowSectionWidth(value: WindowMeasurement, index: number, widthMm: number): WindowMeasurement {
  validateGlazingMeasurement(value);
  const widths = value.plane.sections.map((section) => section.widthMm);
  const total = value.windowType === 'balconyBlock' ? sectionWidthsTotal(widths) : value.widthMm;
  const plane = withWidths(value.plane, updateSectionWidth(total, widths, index, widthMm));
  return checked({ ...value, plane } as WindowMeasurement);
}

/** Count/type changes reset openings to fixed, matching existing creation semantics. */
export function changeWindowSectionCount(value: WindowMeasurement, windowType: RectangularWindowType): WindowMeasurement {
  if (value.windowType === 'balconyBlock') throw new Error('Для блока используйте изменение количества секций оконной части.');
  const widths = distributeSectionWidths(value.widthMm, getSectionCount(windowType));
  const sections = widths.map((widthMm, index) => ({ id: `section-${index + 1}`, widthMm, openingType: 'fixed' as const }));
  return checked({ ...value, windowType, plane: { ...value.plane, sections } } as WindowMeasurement);
}

export function changeBlockSectionCount(value: WindowMeasurement, count: 1 | 2): WindowMeasurement {
  if (value.windowType !== 'balconyBlock' || (count !== 1 && count !== 2)) throw new Error('Оконная часть блока содержит 1 или 2 секции.');
  const widths = distributeSectionWidths(sectionWidthsTotal(value.plane.sections.map((section) => section.widthMm)), count);
  const sections = widths.map((widthMm, index) => {
    const existing = value.plane.sections[index];
    if (existing) return { ...existing, widthMm };
    let id = `section-${index + 1}`;
    while ([value.door.id, ...value.plane.sections.map((section) => section.id)].includes(id)) id += '-window';
    return { id, widthMm, openingType: 'fixed' as const };
  });
  return checked({ ...value, plane: { ...value.plane, sections } } as WindowMeasurement);
}

type Plane = BalconyMeasurement['planes'][number];
function updatePlane(value: BalconyMeasurement, planeId: string, operation: (plane: Plane) => Plane): BalconyMeasurement {
  if (!value.planes.some((plane) => plane.id === planeId)) throw new Error('Плоскость не найдена.');
  // Material and mechanism are preserved; operation changes only dimensions/sections.
  const planes = value.planes.map((plane) => plane.id === planeId ? operation(plane) : plane);
  return checked({ ...value, planes } as BalconyMeasurement);
}

export function resizeBalconyPlaneWidth(value: BalconyMeasurement, planeId: string, totalWidthMm: number): BalconyMeasurement {
  return updatePlane(value, planeId, (plane) => ({ ...withWidths(plane, distributeSectionWidths(totalWidthMm, plane.sectionCount)), widthMm: totalWidthMm }));
}

export function editBalconySectionWidth(value: BalconyMeasurement, planeId: string, index: number, widthMm: number): BalconyMeasurement {
  validateGlazingMeasurement(value);
  return updatePlane(value, planeId, (plane) => withWidths(plane,
    updateSectionWidth(plane.widthMm, plane.sections.map((section) => section.widthMm), index, widthMm)));
}

export function changeBalconyPlaneSectionCount(value: BalconyMeasurement, planeId: string, count: number): BalconyMeasurement {
  return updatePlane(value, planeId, (plane) => ({ ...plane, sectionCount: count,
    sections: distributeSectionWidths(plane.widthMm, count).map((widthMm, index) => ({ id: `section-${index + 1}`, widthMm, openingType: 'fixed' as const })) }));
}
