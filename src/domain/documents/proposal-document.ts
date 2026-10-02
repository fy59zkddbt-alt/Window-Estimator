import type { OpeningSymbol, Point, Rectangle } from '../geometry/types';

export interface ProposalSeller {
  sellerName: string;
  sellerPhone: string;
  telegram?: string;
  whatsapp?: string;
  email?: string;
  companyName?: string;
  inn?: string;
  companyPhone?: string;
  website?: string;
}
export interface ProposalWork { id: string; name: string; priceMinor: number }
export interface ProposalDimension { label: string; widthMm: number; heightMm: number; depthMm?: number }
export interface ProposalSection extends Rectangle {
  id: string;
  label: string;
  openingLabel: string;
  hingeLabel?: string;
  hardwareName?: string;
  fillLabel: string;
  symbols: readonly OpeningSymbol[];
}
/** Prepared drawing coordinates, in mm, viewed from the room. No layout decisions. */
export interface ProposalPlane {
  id: string;
  name: string;
  bounds: Rectangle;
  areaM2: number;
  sections: readonly ProposalSection[];
  transom: (Rectangle & { label: string }) | null;
  splitLine?: readonly Point[];
}
interface ProposalItemCommon {
  id: string;
  name: string;
  room: string;
  description: string;
  dimensionsText: string;
  dimensions: readonly ProposalDimension[];
  basePriceMinor: number;
  additionalWorks: readonly ProposalWork[];
  additionalWorksTotalMinor: number;
  measurementTotalMinor: number;
}
export interface ProposalGlazingItem extends ProposalItemCommon {
  kind: 'Window' | 'Balcony';
  materialLabel: string;
  profileName: string;
  laminationLabel: string;
  areaM2: number;
  productPriceMinor: number;
  installationPriceMinor: number;
  planes: readonly ProposalPlane[];
}
export interface ProposalFinishItem extends ProposalItemCommon {
  kind: 'WindowFinish';
  finishes: readonly {
    label: string;
    materialName: string;
    installedLengthM: number;
    pieces: readonly { label: string; installedLengthMm: number; depthMm: number }[];
  }[];
}
export type ProposalItem = ProposalGlazingItem | ProposalFinishItem;
/** Commercial values only. Detached from calculations, settings and estimate internals. */
export interface ProposalDocument {
  id: string;
  generatedAt: string;
  currency: 'RUB';
  seller: ProposalSeller;
  customer: { clientName?: string; clientPhone?: string; objectAddress?: string };
  items: readonly ProposalItem[];
  orderWorks: readonly ProposalWork[];
  totals: {
    measurementsSubtotalMinor: number;
    orderWorksTotalMinor: number;
    subtotalMinor: number;
    discountMode: 'none' | 'percent' | 'fixedFinalPrice';
    discountPercent?: number;
    discountAmountMinor: number;
    finalTotalMinor: number;
  };
}
