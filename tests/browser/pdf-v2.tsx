import { createRoot } from 'react-dom/client';
import { ClientView } from '../../src/ui/ClientView';
import { App } from '../../src/ui/App';
import { renderProposalPdfV2, createProposalPdfV2, pdfTextMeasure } from '../../src/infrastructure/pdf-v2/render-proposal-pdf-v2';
import { layoutProposalPdfV2 } from '../../src/infrastructure/pdf-v2/layout';
import { pdfReviewDocument, pdfReviewCalculation, pdfSeller } from '../fixtures/pdf-v2';
import type { ProposalDocumentV2 } from '../../src/domain/documents/proposal-document-v2';
import { customerMoney } from '../../src/presentation/customer-money';
import '../../src/ui/styles.css';

const scenario = new URLSearchParams(location.search).get('scenario') || 'full';
const proposal = JSON.parse(JSON.stringify(pdfReviewDocument(scenario)));
const calculation = pdfReviewCalculation();
let fail = false; let calls = 0; let settingsReads = 0; let saves = 0;
let release: (() => void) | undefined;
const liveUrls = new Set<string>();
const createURL = URL.createObjectURL.bind(URL); const revokeURL = URL.revokeObjectURL.bind(URL);
URL.createObjectURL = blob => { const url = createURL(blob); liveUrls.add(url); return url; };
URL.revokeObjectURL = url => { liveUrls.delete(url); revokeURL(url); };
const renderer = async (document: ProposalDocumentV2) => {
  calls++;
  if (release) await new Promise<void>(resolve => { release = resolve; });
  if (fail) throw new Error('Injected renderer failure');
  return renderProposalPdfV2(document);
};
Object.assign(window, { feature14: {
  document: proposal, original: JSON.stringify(proposal),
  generate: async () => Array.from(new Uint8Array(await (await renderProposalPdfV2(proposal)).arrayBuffer())),
  layout: () => layoutProposalPdfV2(proposal, pdfTextMeasure(createProposalPdfV2())),
  manifest: () => ({
    names: proposal.items.map((item: ProposalDocumentV2['items'][number]) => item.name),
    money: [...proposal.items.flatMap((item: ProposalDocumentV2['items'][number]) => [
      ...item.priceLines.map(line => customerMoney(line.amount)), ...item.additionalWorks.map(work => customerMoney(work.amount)),
      ...(item.total ? [customerMoney(item.total)] : []),
    ]), ...proposal.orderAdditionalWorks.map((work: ProposalDocumentV2['orderAdditionalWorks'][number]) => customerMoney(work.amount)),
    ...(proposal.summary.discount ? [customerMoney(proposal.summary.discount.amount, true)] : [])],
    final: proposal.summary.total ? customerMoney(proposal.summary.total) : null,
  }),
  counts: () => ({ calls, settingsReads, saves }),
  resources: () => ({ urls: liveUrls.size, anchors: document.querySelectorAll('a[download]').length }),
  fail: (value: boolean) => { fail = value; },
  hold: () => { release = () => {}; },
  release: () => { const pending = release; release = undefined; pending?.(); },
} });
createRoot(document.getElementById('root')!).render(scenario === 'app' ? <App
  repository={{ list: async () => [calculation], get: async () => calculation, getActiveId: async () => calculation.id,
    setActiveId: async () => { saves++; }, save: async () => { saves++; } }}
  settingsRepository={{ load: async () => { settingsReads++; return calculation.settingsSnapshot!; }, save: async () => { saves++; } }}
  documentSettingsRepository={{ load: async () => pdfSeller, save: async () => { saves++; } }} renderProposalPdf={renderer} />
  : <ClientView document={proposal} renderPdf={renderer} onBack={() => { document.getElementById('root')!.textContent = 'Смета'; }} />);
