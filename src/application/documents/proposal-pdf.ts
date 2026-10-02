import type { ProposalDocument } from '../../domain/documents/proposal-document';

/** Browser PDF adapter is wired only by the composition root. */
export type ProposalPdfRenderer = (document: ProposalDocument) => Promise<Blob>;

export function proposalFilename(document: ProposalDocument): string {
  const subject = (document.customer.clientName?.trim() || document.customer.objectAddress?.trim() || 'Предложение')
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_').replace(/\s+/g, ' ').replace(/[. ]+$/g, '').slice(0, 80);
  return `КП_${subject || 'Предложение'}_${document.generatedAt.slice(0, 10)}.pdf`;
}
