import { createStarterCalculatorSettings } from '../../src/domain/configuration/vnext/settings';

/** Test-only configured exterior products; production never invents missing materials. */
export function finishEditorSettings() {
  const settings = createStarterCalculatorSettings();
  const slope = settings.finish.materials[0]!;
  settings.finish.materials = [...settings.finish.materials,
    { ...structuredClone(slope), id: 'exterior-slope', name: 'Наружная панель', side: 'exterior', element: 'slope' },
    { ...structuredClone(slope), id: 'exterior-drip', name: 'Отлив по каталогу', side: 'exterior', element: 'drip' }];
  return settings;
}
