import type { Calculation } from '../../src/domain/calculation-vnext';
import type { Measurement, WindowMeasurement, BalconyMeasurement, WindowFinishMeasurement } from '../../src/domain/measurements/vnext';
import { finishEditorSettings } from './finish-editor-settings';

export const proposalDate = '2026-10-11T06:00:00.000Z';
export function proposalWindow(): WindowMeasurement {
  return { kind: 'Window', id: 'window', name: 'Окно спальни', room: 'Спальня', material: 'pvc', profileId: 'pvc-standard',
    colorId: 'laminated-two', extensions: true, connectors: true, additionalWorks: [], windowType: 'double',
    widthMm: 1400, heightMm: 1500, transom: { heightMm: 200, openingType: 'fixed' },
    plane: { id: 'plane', sections: [{ id: 'one', widthMm: 500, openingType: 'fixed' },
      { id: 'two', widthMm: 900, openingType: 'tilt_turn', hingeSide: 'right', hardwareId: 'standard' }] } };
}
export function proposalBlock(position: 'left' | 'middle' | 'right' = 'middle'): WindowMeasurement {
  return { kind: 'Window', id: 'block', name: 'Выход на лоджию', room: 'Кухня', material: 'pvc', profileId: 'pvc-standard',
    colorId: 'white', extensions: false, connectors: false, additionalWorks: [], windowType: 'balconyBlock',
    doorPosition: position, doorWidthMm: 700, doorHeightMm: 2200, windowHeightMm: 1500,
    plane: { id: 'plane', sections: [{ id: 'one', widthMm: 800, openingType: 'fixed' },
      { id: 'two', widthMm: 600, openingType: 'turn', hingeSide: 'left', hardwareId: 'premium' }] },
    door: { id: 'door', openingType: 'tilt_turn', hingeSide: 'right', hardwareId: 'standard' } };
}
export function proposalBalcony(shape: 'straight' | 'L' | 'U' = 'straight', material: 'pvc' | 'aluminium' = 'pvc',
  mode: 'swing' | 'sliding' = 'sliding', lower?: 'glass' | 'sandwich', side: 'left' | 'right' = 'left'): BalconyMeasurement {
  const positions = shape === 'straight' ? ['facade'] : shape === 'U' ? ['left', 'facade', 'right'] : side === 'left' ? ['left', 'facade'] : ['facade', 'right'];
  return { kind: 'Balcony', id: 'balcony', name: 'Остекление лоджии', room: 'Балкон', material,
    profileId: material === 'pvc' ? 'pvc-standard' : 'aluminium-example', colorId: 'white', extensions: false, connectors: false,
    additionalWorks: [], balconyType: shape, ...(shape === 'L' ? { side } : {}),
    planes: positions.map((position, index) => ({ id: position, position, name: `Сторона ${index + 1}`, widthMm: 1800, heightMm: 2100, sectionCount: 2,
      levels: lower ? { mode: 'twoLevel', splitHeightMm: 600, lowerFill: lower } : { mode: 'oneLevel' },
      ...(material === 'aluminium' ? { mode } : {}), sections: [{ id: 'one', widthMm: 600, openingType: 'fixed' },
        { id: 'two', widthMm: 1200, openingType: material === 'pvc' ? 'tilt_turn' : mode === 'sliding' ? 'sliding' : 'turn',
          ...(material === 'pvc' ? { hingeSide: 'left', hardwareId: 'standard' } : mode === 'swing' ? { hingeSide: 'right' } : {}) }] })) } as BalconyMeasurement;
}
export function proposalFinish(mode: 'automatic' | 'manual' | 'unresolved' | 'pending' = 'automatic', minor = 123456): WindowFinishMeasurement {
  return { kind: 'WindowFinish', id: 'finish', name: 'Отделка кухни', room: 'Кухня', widthMm: 1400, heightMm: 1500,
    depthMm: mode === 'unresolved' ? 9999 : 210, side: 'interior', workType: 'interiorSlopesAndSill',
    selections: [{ element: 'slope', materialId: 'sandwich' }, { element: 'sill', materialId: 'sill-standard' }], additionalWorks: [],
    priceState: mode === 'manual' || mode === 'pending' ? { mode: 'manual', finalPriceMinor: minor, confirmation: mode === 'manual' ? 'confirmed' : 'needsConfirmation' } : { mode: 'automatic' } };
}
export function proposalCalculation(measurements: readonly Measurement[] = [proposalWindow(), proposalBalcony('U', 'aluminium', 'sliding', 'sandwich'), proposalBlock(), proposalFinish()]): Calculation {
  const settings = finishEditorSettings();
  return { schemaVersion: 4, id: 'calculation-12', name: 'Остекление квартиры', createdAt: proposalDate, updatedAt: proposalDate,
    clientName: 'Анна Иванова', clientPhone: '+7 900 1234567', objectAddress: 'Новосибирск, Ленина, 7', measurements,
    settingsSnapshot: structuredClone(settings), commercialRoundingStepRub: 100, discount: { mode: 'none' }, orderAdditionalWorks: [],
    configuration: Object.fromEntries(measurements.map((m) => [m.id, m.kind === 'WindowFinish'
      ? { kind: m.kind, configuration: structuredClone(settings.finish) } : { kind: m.kind, configuration: structuredClone(settings.glazing) }])) };
}
