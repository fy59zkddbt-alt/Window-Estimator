// Production shell + canonical Feature 5 + real owner-scoped active Dexie repository.
// No auth/service changes: the owner is injected exactly as in the composition root.
import { createRoot } from 'react-dom/client';
import { App } from '../../src/ui/App';
import { createStarterCalculatorSettings } from '../../src/domain/configuration/vnext/settings';
import type { Calculation } from '../../src/domain/calculation-vnext';
import { EstimatorDatabase } from '../../src/infrastructure/storage/database';
import { ActiveDexieCalculationRepository } from '../../src/infrastructure/storage/active-calculation-repository';
import { createDefaultDocumentSettings } from '../../src/application/settings/document-settings';
import { estimateCalculation } from '../../src/application/estimate/active-calculation';

let settings = createStarterCalculatorSettings(); settings.pricesConfirmed = true;
const db = new EstimatorDatabase(`feature11-browser-${new URLSearchParams(location.search).get('case') ?? 'primary'}`);
const active = new ActiveDexieCalculationRepository(db, 'onsite-estimator');
let failNext = false;
for (const id of ['persisted-calculation', 'canonical-totals']) { const output = document.createElement('output'); output.id = id; output.hidden = true; document.body.append(output); }
function output(value: Calculation) {
  document.getElementById('persisted-calculation')!.textContent = JSON.stringify(value);
  document.getElementById('canonical-totals')!.textContent = JSON.stringify(estimateCalculation(value));
}
const repository = {
  save: async (value: Calculation) => { if (failNext) { failNext = false; throw new Error('Internal repository failure'); } await active.save(value); output((await active.get(value.id))!); },
  get: async (id: string) => { const value = await active.get(id); if (value) output(value); return value; },
  list: async () => { const values = await active.list(); const id = await active.getActiveId(); const selected = values.find((value) => value.id === id); if (selected) output(selected); return values; },
  getActiveId: () => active.getActiveId(), setActiveId: (id: string) => active.setActiveId(id),
};
// Test controls mutate global settings through the existing Settings port. They never reprice a saved Calculation.
Object.assign(window, { feature11: {
  failNextSave: () => { failNext = true; },
  updateGlobalSettings: () => { settings = structuredClone(settings); settings.glazing.profiles[0]!.basePricePerM2 = 999999;
    settings.glazing.profiles[0]!.name = 'Новый глобальный профиль'; settings.additionalWorks[0]!.unitPriceMinor = 999999; },
  currentSettings: () => structuredClone(settings),
  otherOwnerCount: async () => (await new ActiveDexieCalculationRepository(db, 'another-owner').list()).length,
} });
createRoot(document.getElementById('root')!).render(<App repository={repository}
  settingsRepository={{ load: async () => structuredClone(settings), reload: async () => structuredClone(settings), save: async (value) => { settings = structuredClone(value); } }}
  documentSettingsRepository={{ load: async () => createDefaultDocumentSettings(), save: async () => {} }} renderProposalPdf={async () => { throw new Error('v4 proposal must never run'); }} />);
