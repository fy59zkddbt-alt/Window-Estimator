import { createRoot } from 'react-dom/client';
import { App } from '../../src/ui/App';
import { ClientView } from '../../src/ui/ClientView';
import { buildProposalDocumentV2 } from '../../src/application/documents/build-proposal-document-v2';
import { estimateCalculationVNext } from '../../src/application/estimate/estimate-calculation-vnext';
import { proposalCalculation, proposalWindow, proposalBalcony, proposalBlock, proposalFinish } from '../fixtures/proposal-v2';
import { createDefaultDocumentSettings } from '../../src/application/settings/document-settings';
import type { Calculation } from '../../src/domain/calculation-vnext';
import '../../src/ui/styles.css';

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'ready';
let calculation = scenario === 'large' || scenario === 'large-fixed' ? proposalCalculation([proposalFinish('manual', Number.MAX_SAFE_INTEGER)])
  : proposalCalculation([proposalWindow(), proposalBlock(), proposalFinish(scenario === 'unresolved' ? 'unresolved' : scenario === 'manual-pending' ? 'pending' : 'manual'),
    ...(['straight', 'L', 'U'] as const).map((shape) => ({ ...proposalBalcony(shape, 'pvc', 'sliding', shape === 'L' ? 'glass' : undefined), id: `pvc-${shape}` })),
    { ...proposalBalcony('U', 'aluminium', 'sliding', 'sandwich'), id: 'al-sliding' },
    { ...proposalBalcony('L', 'aluminium', 'swing'), id: 'al-swing' }]);
if (!scenario.startsWith('large')) {
  const first = calculation.measurements[0]!;
  first.additionalWorks = [{ id: 'demolition', name: 'Демонтаж окна', quantity: 1.25, unit: 'runningMeter', unitPriceMinor: 12345 }];
  calculation.orderAdditionalWorks = [{ id: 'delivery', name: 'Доставка', quantity: 2, unit: 'unit', unitPriceMinor: 12345 }];
}
if (scenario === 'percent') calculation.discount = { mode: 'percent', discountPercent: 7.25 };
if (['fixed', 'fixed-pending', 'large-fixed'].includes(scenario)) calculation.discount = { mode: 'fixedFinalPrice',
  fixedFinalPriceMinor: scenario === 'large-fixed' ? Number.MAX_SAFE_INTEGER - 2 : 1234567,
  confirmation: scenario === 'fixed-pending' ? 'needsConfirmation' : 'confirmed', confirmedSubtotalMinor: estimateCalculationVNext(calculation).subtotalMinor! };
if (scenario === 'long') {
  calculation.clientName = 'ОченьДлинноеИмяБезПробелов'.repeat(10); calculation.objectAddress = 'АдресБезПробелов'.repeat(20);
  calculation.measurements[0]!.name = 'НазваниеБезПробелов'.repeat(20);
}
let settings = structuredClone(calculation.settingsSnapshot!);
const seller = { ...createDefaultDocumentSettings(), sellerName: 'Иван Петров', sellerPhone: '+7 900 7654321', companyName: 'Окна для вас', telegram: '@okna' };
let saves = 0; let activeChanges = 0; let pdfCalls = 0;
for (const id of ['persisted-calculation', 'canonical-document']) { const output = document.createElement('output'); output.hidden = true; output.id = id; document.body.append(output); }
function output() {
  document.getElementById('persisted-calculation')!.textContent = JSON.stringify(calculation);
  document.getElementById('canonical-document')!.textContent = JSON.stringify(buildProposalDocumentV2(calculation, seller));
}
output();
Object.assign(window, { feature12: {
  counts: () => ({ saves, activeChanges, pdfCalls }),
  changeGlobalSettings: () => { settings.glazing.profiles[0]!.name = 'Глобальный профиль изменён'; settings.glazing.profiles[0]!.basePricePerM2 = 999999; },
} });
if (scenario === 'document-only') {
  // Prove a serialized DTO is sufficient: no App/repository/editor involved in rendering.
  const proposal = JSON.parse(JSON.stringify(buildProposalDocumentV2(calculation, seller)));
  createRoot(document.getElementById('root')!).render(<ClientView document={proposal} onBack={() => {}} />);
} else createRoot(document.getElementById('root')!).render(<App
  repository={{ list: async () => [structuredClone(calculation)], get: async () => structuredClone(calculation),
    getActiveId: async () => calculation.id, setActiveId: async () => { activeChanges++; },
    save: async (value: Calculation) => { saves++; calculation = structuredClone(value); output(); } }}
  settingsRepository={{ load: async () => structuredClone(settings), save: async (value) => { settings = structuredClone(value); } }}
  documentSettingsRepository={{ load: async () => structuredClone(seller), save: async () => {} }}
  renderProposalPdf={async () => { pdfCalls++; throw new Error('Legacy PDF must remain isolated'); }} />);
