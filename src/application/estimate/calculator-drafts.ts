/** Compatibility at the existing draft boundary only; no view/result DTOs or pricing. */
import type { WindowDraft, WindowInput } from './window-editor';
import type { BalconyInput } from './estimate-balcony';
import type { WindowFinishInput } from './estimate-finish';
import type { WindowMeasurement, BalconyMeasurement, WindowFinishMeasurement } from '../../domain/measurements/vnext';
import type { GlazingConfiguration } from '../../domain/configuration/vnext/types';
import type { AdditionalWork } from '../../domain/works/vnext';
import { reviseFinishMeasurementVNext } from './estimate-finish-vnext';
import { validateGlazingMeasurement, validateFinishMeasurement } from '../../domain/measurements/vnext';

function colorForDraft(configuration: GlazingConfiguration, material: 'pvc' | 'aluminium', lamination: string, previousColor?: string) {
  const existing = configuration.colors.find((color) => color.id === previousColor && color.materials.includes(material) && color.lamination === lamination);
  const color = existing ?? configuration.colors.find((color) => color.status === 'active' && color.materials.includes(material) && color.lamination === lamination);
  if (!color) throw new Error('Для выбранной ламинации нет настроенного цвета.');
  return color.id;
}
export function windowFromDraft(input: WindowDraft, configuration: GlazingConfiguration, works: readonly AdditionalWork[], previous?: WindowMeasurement): WindowMeasurement {
  if (input.windowType === 'balconyBlock' && !input.doorPosition) throw new Error('Выберите положение двери.');
  const { sections, lamination, additionalWorks: _works, ...shape } = input;
  const opening = <T extends { hardwareId?: string }>(section: T) => {
    if (input.material !== 'aluminium') return section;
    const { hardwareId: _hardware, ...next } = section; return next;
  };
  const measurement = { ...shape, kind: 'Window',
    colorId: colorForDraft(configuration, input.material, lamination, previous?.colorId),
    extensions: previous?.extensions ?? false, connectors: previous?.connectors ?? false, additionalWorks: works,
    plane: { id: previous?.plane.id ?? `${input.id}:plane`, sections: sections.map(opening), ...(input.material === 'aluminium' ? { mode: 'swing' } : {}) },
    ...(input.windowType === 'balconyBlock' ? { door: opening(input.door) } : {}),
  } as WindowMeasurement;
  validateGlazingMeasurement(measurement); return measurement;
}
export function windowToDraft(measurement: WindowMeasurement, configuration: GlazingConfiguration): WindowInput {
  if (measurement.material === 'aluminium' && measurement.plane.mode !== 'swing') throw new Error('Текущий редактор окна поддерживает только поворотный алюминий.');
  return { ...measurement, sections: measurement.plane.sections,
    lamination: configuration.colors.find((color) => color.id === measurement.colorId)!.lamination, additionalWorks: [] } as WindowInput;
}
export function balconyFromDraft(input: BalconyInput, configuration: GlazingConfiguration, works: readonly AdditionalWork[], previous?: BalconyMeasurement): BalconyMeasurement {
  const { lamination, additionalWorks: _works, ...shape } = input;
  const measurement = { ...shape, kind: 'Balcony', colorId: colorForDraft(configuration, input.material, lamination, previous?.colorId),
    extensions: previous?.extensions ?? false, connectors: previous?.connectors ?? false, additionalWorks: works,
    planes: shape.planes.map((plane) => ({ ...plane, ...(input.material === 'aluminium' ? { mode: 'sliding' } : {}) })),
  } as BalconyMeasurement;
  validateGlazingMeasurement(measurement); return measurement;
}
export function balconyToDraft(measurement: BalconyMeasurement, configuration: GlazingConfiguration): BalconyInput {
  if (measurement.material === 'aluminium' && measurement.planes.some((plane) => plane.mode !== 'sliding')) throw new Error('Текущий редактор балкона поддерживает только раздвижной алюминий.');
  return { ...measurement, lamination: configuration.colors.find((color) => color.id === measurement.colorId)!.lamination, additionalWorks: [] } as BalconyInput;
}
export function finishFromDraft(input: WindowFinishInput, works: readonly AdditionalWork[], previous?: WindowFinishMeasurement): WindowFinishMeasurement {
  const selections = input.selections.map((selection) => {
    const original = previous?.selections.find((item) => item.element === selection.finishType && item.materialId === selection.materialId);
    return { element: selection.finishType, materialId: selection.materialId, ...(original?.widthVariantId ? { widthVariantId: original.widthVariantId } : {}) };
  });
  const measurement: WindowFinishMeasurement = { ...input, kind: 'WindowFinish', side: 'interior',
    workType: selections.length === 2 ? 'interiorSlopesAndSill' : selections[0]?.element === 'sill' ? 'sillOnly' : 'interiorSlopes',
    selections, additionalWorks: works, priceState: previous?.priceState ?? { mode: 'automatic' } };
  validateFinishMeasurement(measurement);
  return previous ? reviseFinishMeasurementVNext(previous, measurement) : measurement;
}
export function finishToDraft(measurement: WindowFinishMeasurement): WindowFinishInput {
  if (measurement.side !== 'interior') throw new Error('Наружная отделка недоступна в текущем редакторе.');
  return { ...measurement, additionalWorks: [], selections: measurement.selections.map((selection) => {
    if (selection.element === 'drip') throw new Error('Наружный отлив недоступен в текущем редакторе.');
    return { finishType: selection.element, materialId: selection.materialId };
  }) };
}
