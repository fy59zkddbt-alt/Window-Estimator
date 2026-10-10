/** Canonical vNext measurements are also the editor state. NaN means a missing dimension
 * in memory only; validation/estimateDraft must succeed before the active flow can save.
 * Feature 9's primitive operations let dimensions be entered before the rest is complete. */
import type { BalconyMeasurement, WindowMeasurement, AluminiumPlaneMode } from '../../domain/measurements/vnext';
import { validateAluminiumPlane, validateGlazingMeasurement } from '../../domain/measurements/vnext';
import type { GlazingConfiguration } from '../../domain/configuration/vnext/types';
import type { Material } from '../../domain/measurements/shared';
import type { WindowType } from '../../domain/measurements/window/types';
import { getSectionCount, validateOpeningElement } from '../../domain/measurements/window/create-window';
import { balconyPositions } from '../../domain/measurements/balcony/create-balcony';
import { copyDomainValue } from '../../domain/configuration/vnext/copy';
import { sectionWidthsTotal } from '../../domain/geometry/section-widths';
import { distributeSectionWidths, updateSectionWidth } from './editor-geometry-operations';

export type Glazing = WindowMeasurement | BalconyMeasurement;
export type Plane = BalconyMeasurement['planes'][number];
export type Element = WindowMeasurement['plane']['sections'][number];
export type Opening = Element['openingType'];
export { copyDomainValue as copyEditorMeasurement };

export function hardwareChoices(config: GlazingConfiguration, profileId: string) {
  const profile = config.profiles.find((p) => p.id === profileId);
  return profile?.material === 'pvc' ? config.hardware.filter((h) => profile.hardwareActivity.some((r) => r.hardwareId === h.id)) : [];
}
export function colorChoices(config: GlazingConfiguration, profileId: string) {
  const profile = config.profiles.find((p) => p.id === profileId);
  return profile ? config.colors.filter((c) => c.materials.includes(profile.material) && profile.colorRules.some((r) => r.colorId === c.id)) : [];
}
function hardwareFor(config: GlazingConfiguration, profileId: string, previous?: string) {
  const choices = hardwareChoices(config, profileId);
  return choices.find((h) => h.id === previous)?.id ?? choices.find((h) => h.status === 'active')?.id ?? '';
}
function mapElements<T extends Glazing>(value: T, update: (element: Element) => Element): T {
  const plane = <P extends { sections: readonly Element[] }>(p: P) => ({ ...p, sections: p.sections.map(update) });
  const door = value.kind === 'Window' && value.windowType === 'balconyBlock' ? update({ ...value.door, widthMm: value.doorWidthMm }) : undefined;
  const { widthMm: _width, ...doorOpening } = door ?? {};
  return (value.kind === 'Balcony' ? { ...value, planes: value.planes.map(plane) }
    : { ...value, plane: plane(value.plane), ...(door ? { door: doorOpening } : {}) }) as T;
}
export function selectProfile<T extends Glazing>(value: T, profileId: string, config: GlazingConfiguration): T {
  const profile = config.profiles.find((p) => p.id === profileId && p.material === value.material);
  if (!profile) throw new Error('Выберите доступный профиль.');
  const colors = colorChoices(config, profileId);
  const previousLamination = config.colors.find((c) => c.id === value.colorId)?.lamination;
  const colorId = colors.find((c) => c.id === value.colorId)?.id
    ?? colors.find((c) => c.status === 'active' && c.lamination === previousLamination)?.id
    ?? colors.find((c) => c.status === 'active' && c.lamination === 'none')?.id ?? '';
  return mapElements({ ...value, profileId, colorId }, (element) => value.material === 'pvc' && element.openingType !== 'fixed'
    ? { ...element, hardwareId: hardwareFor(config, profileId, element.hardwareId) } as Element : element);
}
function product(config: GlazingConfiguration, material: Material) {
  const profileId = config.profiles.find((p) => p.material === material && p.status === 'active')?.id ?? '';
  return { material, profileId, colorId: colorChoices(config, profileId).find((c) => c.status === 'active' && c.lamination === 'none')?.id ?? '', extensions: false, connectors: false };
}
export function newWindow(id: string, config: GlazingConfiguration): WindowMeasurement {
  return { id, kind: 'Window', room: '', name: '', windowType: 'single', widthMm: NaN, heightMm: NaN,
    ...product(config, 'pvc'), material: 'pvc', additionalWorks: [], plane: { id: `${id}:plane`, sections: [{ id: 'section-1', widthMm: NaN, openingType: 'fixed' }] } };
}
function newPlane(position: Plane['position'], material: Material): Plane {
  return { id: position, name: { left: 'Левая сторона', facade: 'Фасад', right: 'Правая сторона' }[position], position,
    widthMm: NaN, heightMm: NaN, sectionCount: 1, levels: { mode: 'oneLevel' },
    sections: [{ id: 'section-1', widthMm: NaN, openingType: 'fixed' }], ...(material === 'aluminium' ? { mode: 'sliding' as const } : {}) } as Plane;
}
export function newBalcony(id: string, config: GlazingConfiguration): BalconyMeasurement {
  return { id, kind: 'Balcony', room: '', name: '', balconyType: 'straight', ...product(config, 'pvc'), material: 'pvc', additionalWorks: [], planes: [newPlane('facade', 'pvc')] } as BalconyMeasurement;
}
export function changeShape(value: BalconyMeasurement, balconyType: BalconyMeasurement['balconyType'], side?: 'left' | 'right'): BalconyMeasurement {
  const { side: _side, ...rest } = value;
  return { ...rest, balconyType, ...(balconyType === 'L' ? { side } : {}),
    planes: balconyPositions(balconyType, side).map((position) => value.planes.find((p) => p.position === position) ?? newPlane(position, value.material)) } as BalconyMeasurement;
}
export function selectMaterial<T extends Glazing>(value: T, material: Material, config: GlazingConfiguration): T {
  const fixed = mapElements(value, (s) => ({ id: s.id, widthMm: s.widthMm, openingType: 'fixed' }));
  const mechanism = (p: WindowMeasurement['plane'] | Plane) => {
    const { mode: _mode, ...rest } = { ...p, mode: 'mode' in p ? p.mode : undefined };
    return { ...rest, ...(material === 'aluminium' ? { mode: value.kind === 'Balcony' ? 'sliding' : 'swing' } : {}) };
  };
  return { ...fixed, ...product(config, material), extensions: value.extensions, connectors: value.connectors, ...(fixed.kind === 'Balcony'
    ? { planes: fixed.planes.map(mechanism) } : { plane: mechanism(fixed.plane) }) } as T;
}
export function windowPartWidth(value: WindowMeasurement): number {
  if (value.windowType !== 'balconyBlock') return value.widthMm;
  try { return sectionWidthsTotal(value.plane.sections.map((s) => s.widthMm)); } catch { return NaN; }
}
function widths(sections: readonly Element[], total: number, count: number, reset = false): Element[] {
  const next = Number.isNaN(total) ? Array.from({ length: count }, () => NaN) : distributeSectionWidths(total, count);
  return next.map((widthMm, i) => !reset && sections[i] ? { ...sections[i], widthMm } : { id: `section-${i + 1}`, widthMm, openingType: 'fixed' });
}
export function setWindowWidth(value: WindowMeasurement, total: number): WindowMeasurement {
  return { ...value, ...(value.windowType === 'balconyBlock' ? {} : { widthMm: total }), plane: { ...value.plane, sections: widths(value.plane.sections, total, value.plane.sections.length) } } as WindowMeasurement;
}
export function setWindowType(value: WindowMeasurement, windowType: WindowType): WindowMeasurement {
  if (windowType === value.windowType) return value;
  const { id, room, name, material, profileId, colorId, extensions, connectors, additionalWorks, plane } = value;
  const common = { id, room, name, kind: 'Window' as const, material, profileId, colorId, extensions, connectors, additionalWorks };
  if (windowType === 'balconyBlock') return { ...common, windowType, doorWidthMm: NaN, doorHeightMm: NaN, windowHeightMm: NaN,
    doorPosition: '', door: { id: `${id}:door`, openingType: 'fixed' }, plane: { ...plane, sections: widths([], NaN, 1) } } as unknown as WindowMeasurement;
  const widthMm = value.windowType === 'balconyBlock' ? NaN : value.widthMm;
  return { ...common, windowType, widthMm, heightMm: value.windowType === 'balconyBlock' ? NaN : value.heightMm,
    ...(value.windowType !== 'balconyBlock' && value.transom ? { transom: value.transom } : {}),
    plane: { ...plane, sections: widths([], widthMm, getSectionCount(windowType), true) } } as WindowMeasurement;
}
export function setBlockCount(value: WindowMeasurement, count: 1 | 2): WindowMeasurement {
  if (value.windowType !== 'balconyBlock') throw new Error('Выберите балконный блок.');
  const sections = widths(value.plane.sections, windowPartWidth(value), count);
  const used = new Set([value.door.id]);
  for (const section of sections) {
    while (used.has(section.id)) section.id += '-window';
    used.add(section.id);
  }
  return { ...value, plane: { ...value.plane, sections } } as WindowMeasurement;
}
export function restoreBlockSecondOpening(value: WindowMeasurement, second: Element, config: GlazingConfiguration): WindowMeasurement {
  if (value.windowType !== 'balconyBlock' || value.plane.sections.length !== 2) throw new Error('Нужны две секции оконной части.');
  const mode = 'mode' in value.plane ? value.plane.mode : undefined;
  const opening = setOpening(second, openingChoices(value.material, mode).includes(second.openingType) ? second.openingType : 'fixed', value, config, mode);
  const used = new Set([value.door.id, value.plane.sections[0]!.id]);
  let id = second.id;
  while (used.has(id)) id += '-window';
  return { ...value, plane: { ...value.plane, sections: [value.plane.sections[0]!, { ...opening, id, widthMm: value.plane.sections[1]!.widthMm }] } } as WindowMeasurement;
}
export function editWindowWidth(value: WindowMeasurement, index: number, width: number): WindowMeasurement {
  const next = updateSectionWidth(windowPartWidth(value), value.plane.sections.map((s) => s.widthMm), index, width);
  return { ...value, plane: { ...value.plane, sections: value.plane.sections.map((s, i) => ({ ...s, widthMm: next[i]! })) } } as WindowMeasurement;
}
export function setPlaneWidth(plane: Plane, total: number, count = plane.sectionCount): Plane {
  return { ...plane, widthMm: total, sectionCount: count, sections: widths(plane.sections, total, count, count !== plane.sectionCount) } as Plane;
}
export function editPlaneWidth(plane: Plane, index: number, width: number): Plane {
  const next = updateSectionWidth(plane.widthMm, plane.sections.map((s) => s.widthMm), index, width);
  return { ...plane, sections: plane.sections.map((s, i) => ({ ...s, widthMm: next[i]! })) } as Plane;
}
export function setPlaneMode(plane: Plane, mode: AluminiumPlaneMode): Plane {
  return { ...plane, mode, sections: plane.sections.map((s) => ({ id: s.id, widthMm: s.widthMm, openingType: 'fixed' })) } as Plane;
}
/** Use domain compatibility validation for choices as well as mutation; no parallel rules. */
export function openingChoices(material: Material, mode?: AluminiumPlaneMode): Opening[] {
  return (['fixed', 'turn', 'tilt_turn', 'sliding'] as const).filter((openingType) => {
    const element = { id: 'probe', widthMm: 1, openingType,
      ...(['turn', 'tilt_turn'].includes(openingType) ? { hingeSide: 'left', ...(material === 'pvc' ? { hardwareId: 'probe' } : {}) } : {}) };
    try {
      if (material === 'pvc') validateOpeningElement(element as Parameters<typeof validateOpeningElement>[0]);
      else validateAluminiumPlane({ id: 'probe', mode, sections: [element] } as unknown as Parameters<typeof validateAluminiumPlane>[0]);
      return true;
    } catch { return false; }
  });
}
export function setOpening(element: Element, openingType: Opening, value: Glazing, config: GlazingConfiguration, mode?: AluminiumPlaneMode): Element {
  if (!openingChoices(value.material, mode).includes(openingType)) throw new Error('Открывание недоступно для выбранного типа.');
  return { id: element.id, widthMm: element.widthMm, openingType,
    ...(['turn', 'tilt_turn'].includes(openingType) ? { hingeSide: element.hingeSide ?? 'left',
      ...(value.material === 'pvc' ? { hardwareId: hardwareFor(config, value.profileId, element.hardwareId) } : {}) } : {}) } as Element;
}
export function readyMeasurement<T extends Glazing>(value: T): T {
  const next = { ...value, room: value.room.trim() || 'Без помещения', name: value.name.trim() || (value.kind === 'Balcony' ? 'Остекление балкона' : value.windowType === 'balconyBlock' ? 'Балконный блок' : 'Окно') };
  const dimension = (v: number, label: string) => {
    if (!Number.isSafeInteger(v) || v <= 0) throw new Error(`Укажите ${label} в целых миллиметрах.`);
  };
  if (next.kind === 'Window') {
    dimension(windowPartWidth(next), next.windowType === 'balconyBlock' ? 'ширину оконной части' : 'ширину окна');
    if (next.windowType === 'balconyBlock') {
      dimension(next.doorWidthMm, 'ширину двери'); dimension(next.windowHeightMm, 'высоту окна'); dimension(next.doorHeightMm, 'высоту двери');
    } else { dimension(next.heightMm, 'высоту окна'); if (next.transom) dimension(next.transom.heightMm, 'высоту фрамуги'); }
  } else for (const p of next.planes) {
    dimension(p.widthMm, `ширину: ${p.name}`); dimension(p.heightMm, `высоту: ${p.name}`);
    if (p.levels.mode === 'twoLevel') {
      dimension(p.levels.splitHeightMm, `высоту нижнего яруса: ${p.name}`);
      if (p.levels.splitHeightMm >= p.heightMm) throw new Error('Нижний ярус должен быть ниже полной высоты.');
    }
  }
  validateGlazingMeasurement(next);
  return next as T;
}
export function editorError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : '';
  if (/^Укажите |^Нижний ярус|^При одном окне|^Высота фрамуги/.test(message)) return message;
  if (/положение двери/i.test(message)) return 'Выберите положение двери.';
  if (/фурнитур|профиль\/фурнитура/i.test(message)) return 'Для профиля нет выбранной совместимой фурнитуры.';
  if (/Цвет|цвет/.test(message)) return 'Выберите доступную ламинацию для профиля.';
  if (/Профиль|профиль/.test(message)) return 'Выберите доступный профиль или систему.';
  if (/работ|количеств|копе|цен.*единиц/i.test(message)) return 'Проверьте название, цену и количество дополнительных работ.';
  return 'Проверьте размеры, открывания и параметры изделия.';
}
