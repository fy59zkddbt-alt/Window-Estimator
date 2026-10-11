import type { ProposalDocumentV2 } from '../../domain/documents/proposal-document-v2';

/** Detached customer document only; no Calculation, Settings or legacy adapter. */
export type ProposalPdfV2Renderer = (document: ProposalDocumentV2) => Promise<Blob>;
export const proposalPdfV2Filename = 'zamerok-offer.pdf';
