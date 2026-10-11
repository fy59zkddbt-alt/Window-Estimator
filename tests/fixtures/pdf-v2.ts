import { buildProposalDocumentV2 } from '../../src/application/documents/build-proposal-document-v2';
import { estimateCalculationVNext } from '../../src/application/estimate/estimate-calculation-vnext';
import { proposalCalculation, proposalWindow, proposalBalcony, proposalBlock, proposalFinish } from './proposal-v2';

export function complexPdfBalcony() {
  const balcony = proposalBalcony('U', 'pvc', 'sliding', 'sandwich');
  balcony.planes = balcony.planes.map((plane, index) => {
    const widthMm = [800, 3200, 900][index]!; const count = [1, 4, 2][index]!;
    return { ...plane, widthMm, heightMm: 2800, sectionCount: count,
      levels: { mode: 'twoLevel', splitHeightMm: 1000, lowerFill: 'sandwich' },
      sections: Array.from({ length: count }, (_, i) => ({ id: `pane-${i}`, widthMm: widthMm / count,
        ...(index === 0 || index === 2 && i === 0 ? { openingType: 'fixed' as const }
          : { openingType: 'tilt_turn' as const, hingeSide: i % 2 ? 'right' as const : 'left' as const, hardwareId: 'standard' }) })) };
  });
  return balcony;
}
export const pdfSeller = { companyName: 'Окна для вас', sellerName: 'Иван Петров', sellerPhone: '+7 900 1112233', telegram: '@okna' };
export function pdfReviewCalculation(scenario = 'full') {
  const calculation = proposalCalculation(scenario === 'window' ? [proposalWindow()]
    : scenario === 'pvc-u' ? [complexPdfBalcony()]
    : scenario === 'aluminium' ? [proposalBalcony('L', 'aluminium', 'sliding', 'sandwich')]
    : scenario === 'exact' ? [proposalFinish('manual', Number.MAX_SAFE_INTEGER)]
    : [proposalWindow(), complexPdfBalcony(), proposalBlock(), proposalFinish(scenario === 'unresolved' ? 'unresolved' : 'manual')]);
  if (scenario === 'full' || scenario === 'unresolved') {
    calculation.measurements[0]!.additionalWorks = [{ id: 'private-work', name: 'Демонтаж окна', quantity: 1.25, unit: 'runningMeter', unitPriceMinor: 16000 }];
    calculation.orderAdditionalWorks = [{ id: 'private-order', name: 'Доставка', quantity: 2, unit: 'piece', unitPriceMinor: 25000 }];
    calculation.discount = { mode: 'percent', discountPercent: 7.25 };
  }
  if (scenario === 'exact') calculation.discount = { mode: 'fixedFinalPrice', fixedFinalPriceMinor: Number.MAX_SAFE_INTEGER - 2,
    confirmation: 'confirmed', confirmedSubtotalMinor: estimateCalculationVNext(calculation).subtotalMinor! };
  return calculation;
}
export const pdfReviewDocument = (scenario = 'full') => buildProposalDocumentV2(pdfReviewCalculation(scenario), pdfSeller);
