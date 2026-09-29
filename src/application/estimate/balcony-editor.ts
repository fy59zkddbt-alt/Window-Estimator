import { balconyPositions, equalBalconySections, type BalconyInput } from '../../domain/measurements/balcony/create-balcony';
import type { BalconyPlane, BalconySection, PlanePosition } from '../../domain/measurements/balcony/types';
import type { Material } from '../../domain/measurements/shared';
export const planeNames: Record<PlanePosition, string> = { left: 'Левая', facade: 'Фасад', right: 'Правая' };
export function balconyDraft(id: string): BalconyInput {
  return changeBalconyShape({ id, room: '', name: '', balconyType: 'straight', material: 'pvc', profileId: '', lamination: 'none', planes: [], additionalWorks: [] }, 'straight');
}
export function changeBalconyShape(input: BalconyInput, balconyType: BalconyInput['balconyType'], side?: BalconyInput['side']): BalconyInput {
  const { side: _previous, ...rest } = input;
  const planes = balconyPositions(balconyType, side).map((position): BalconyPlane => input.planes.find((p) => p.position === position) ?? {
    id: `${input.id}:${position}`, name: planeNames[position], position, widthMm: NaN, heightMm: NaN, sectionCount: 1, sections: [], levels: { mode: 'oneLevel' },
  });
  return { ...rest, balconyType, ...(balconyType === 'L' && side ? { side } : {}), planes };
}
export function initializePlaneWidth(plane: BalconyPlane, widthMm: number): BalconyPlane {
  return { ...plane, widthMm, sections: plane.sections.length === 0 && Number.isFinite(widthMm) && widthMm > 0 ? equalBalconySections(widthMm, plane.sectionCount) : plane.sections };
}
export function changePlaneSectionCount(plane: BalconyPlane, sectionCount: number): BalconyPlane {
  return { ...plane, sectionCount, sections: Number.isFinite(plane.widthMm) && plane.widthMm > 0 ? equalBalconySections(plane.widthMm, sectionCount) : [] };
}
export function distributePlane(plane: BalconyPlane): BalconyPlane {
  const equal = equalBalconySections(plane.widthMm, plane.sectionCount);
  return { ...plane, sections: equal.map((s, i) => ({ ...(plane.sections[i] ?? s), widthMm: s.widthMm })) };
}
export function changeBalconyMaterial(input: BalconyInput, material: Material): BalconyInput {
  if (input.material === material) return input;
  return { ...input, material, profileId: '', planes: input.planes.map((p) => ({ ...p, sections: p.sections.map((s) => ({ id: s.id, widthMm: s.widthMm, openingType: 'fixed' as const })) })) };
}
export function changeBalconyOpening(section: BalconySection, openingType: BalconySection['openingType']): BalconySection {
  const base = { id: section.id, widthMm: section.widthMm };
  if (openingType === 'fixed' || openingType === 'sliding') return { ...base, openingType };
  return { ...base, openingType, hingeSide: section.hingeSide ?? 'left', hardwareId: section.hardwareId ?? '' };
}
