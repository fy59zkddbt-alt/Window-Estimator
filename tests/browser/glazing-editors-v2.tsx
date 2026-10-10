// Production App + active save path, using isolated in-memory ports. No auth or real storage.
import { createRoot } from 'react-dom/client';
import { App } from '../../src/ui/App';
import { createCalculation } from '../../src/application/estimate/active-calculation';
import type { Calculation } from '../../src/domain/calculation-vnext';
import { createStarterCalculatorSettings } from '../../src/domain/configuration/vnext/settings';
import { createDefaultDocumentSettings } from '../../src/application/settings/document-settings';
import { estimateCalculationVNext } from '../../src/application/estimate/estimate-calculation-vnext';
import '../../src/ui/styles.css';

const historical = createStarterCalculatorSettings();
const pvc = historical.glazing.profiles[0]!;
historical.glazing = { ...historical.glazing, profiles: [...historical.glazing.profiles, { ...pvc, material: 'pvc', id: 'scoped', name: 'Профиль только Премиум', hardwareActivity: [{ hardwareId: 'premium', activityPercent: 75 }] }] };
let persisted = createCalculation('fixture-calculation', '2026-10-10T00:00:00.000Z', historical);
const mutable = createStarterCalculatorSettings();
mutable.glazing = { ...mutable.glazing, profiles: mutable.glazing.profiles.map((p) => ({ ...p, name: 'LATEST MUTABLE PROFILE', basePricePerM2: 999999 })), installationRatesPerM2: { pvc: 999999, aluminium: 999999 } };
function output(value: Calculation) {
  document.getElementById('persisted-calculation')!.textContent = JSON.stringify(value);
  document.getElementById('canonical-total')!.textContent = String(estimateCalculationVNext(value).subtotalMinor);
}
const repository = {
  save: async (value: Calculation) => { persisted = structuredClone(value); output(persisted); },
  get: async () => structuredClone(persisted), list: async () => [structuredClone(persisted)],
  getActiveId: async () => persisted.id, setActiveId: async () => {},
};
createRoot(document.getElementById('root')!).render(<App repository={repository}
  settingsRepository={{ load: async () => structuredClone(mutable), save: async () => {} }}
  documentSettingsRepository={{ load: async () => createDefaultDocumentSettings(), save: async () => {} }}
  renderProposalPdf={async () => new Blob()} />);
const data = document.createElement('output'); data.id = 'persisted-calculation'; data.hidden = true; document.body.append(data);
const total = document.createElement('output'); total.id = 'canonical-total'; total.hidden = true; document.body.append(total);
output(persisted);
