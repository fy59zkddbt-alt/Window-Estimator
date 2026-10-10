// Production App and active save path with isolated in-memory repository ports.
import { createRoot } from 'react-dom/client';
import { App } from '../../src/ui/App';
import { createCalculation, saveMeasurement } from '../../src/application/estimate/active-calculation';
import { newWindow, readyMeasurement, setBlockCount, setWindowType, setWindowWidth } from '../../src/application/estimate/glazing-editor-v2';
import type { Calculation } from '../../src/domain/calculation-vnext';
import { createDefaultDocumentSettings } from '../../src/application/settings/document-settings';
import { estimateCalculationVNext } from '../../src/application/estimate/estimate-calculation-vnext';
import { finishEditorSettings } from '../fixtures/finish-editor-settings';
import { validateCalculatorSettings } from '../../src/domain/configuration/vnext/validate';
import '../../src/ui/styles.css';

const historical = finishEditorSettings();
historical.finish.allowances.slope = { lengthMm: 10, depthMm: 900 };
historical.finish.materials = historical.finish.materials.map((material) => material.id !== 'sandwich' ? material : { ...material,
  widthVariants: [
    { id: 'wide-cheap', physicalWidthMm: 400, maxUsableActualDepthMm: 320, purchaseCostPerRunningMeter: 1 },
    { id: 'b', physicalWidthMm: 300, maxUsableActualDepthMm: 320, purchaseCostPerRunningMeter: 800 },
    { id: 'a', physicalWidthMm: 300, maxUsableActualDepthMm: 320, purchaseCostPerRunningMeter: 900 },
    { id: '200', physicalWidthMm: 200, maxUsableActualDepthMm: 220, purchaseCostPerRunningMeter: 600 },
  ] });
if (new URLSearchParams(location.search).has('missing-exterior')) {
  historical.finish.materials = historical.finish.materials.filter((material) => material.side !== 'exterior');
}
let persisted = createCalculation('finish-fixture', '2026-10-10T00:00:00.000Z', historical);
const blockCount = new URLSearchParams(location.search).get('block');
if (blockCount) {
  let block = setBlockCount(setWindowWidth(setWindowType(newWindow('block', historical.glazing), 'balconyBlock'), 1400), blockCount === '2' ? 2 : 1);
  if (block.windowType !== 'balconyBlock') throw new Error();
  block = readyMeasurement({ ...block, room: 'Кухня', name: 'Балконный блок', doorWidthMm: 700, doorHeightMm: 2200, windowHeightMm: 1500, doorPosition: 'right' });
  persisted = saveMeasurement(persisted, block, { kind: 'Window', configuration: historical.glazing }, persisted.updatedAt, 'add');
}
const mutable = finishEditorSettings();
mutable.finish.materials = mutable.finish.materials.map((material) => ({ ...material, name: 'LATEST MUTABLE MATERIAL',
  widthVariants: [{ id: 'latest', physicalWidthMm: 100, maxUsableActualDepthMm: 100, purchaseCostPerRunningMeter: 999999 }] }));
mutable.finish.finishMarkupPercent = 99999;
validateCalculatorSettings(mutable);
function output(value: Calculation) {
  document.getElementById('persisted-calculation')!.textContent = JSON.stringify(value);
  const totals = estimateCalculationVNext(value);
  document.getElementById('canonical-totals')!.textContent = JSON.stringify(totals);
}
const repository = {
  save: async (value: Calculation) => { persisted = structuredClone(value); output(persisted); },
  get: async () => structuredClone(persisted), list: async () => [structuredClone(persisted)],
  getActiveId: async () => persisted.id, setActiveId: async () => {},
};
for (const id of ['persisted-calculation', 'canonical-totals']) { const data = document.createElement('output'); data.id = id; data.hidden = true; document.body.append(data); }
output(persisted);
createRoot(document.getElementById('root')!).render(<App repository={repository}
  settingsRepository={{ load: async () => structuredClone(mutable), save: async () => {} }}
  documentSettingsRepository={{ load: async () => createDefaultDocumentSettings(), save: async () => {} }}
  renderProposalPdf={async () => new Blob()} />);
