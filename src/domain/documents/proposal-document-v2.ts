/** Customer content contract. No editable model, tariffs, DOM, React or page size. */
export interface ProposalMoneyV2 {
  readonly currency: 'RUB';
  readonly minor: number;
  /** Exact display value, including kopecks; renderers must not round it. */
  readonly display: string;
}
export interface ProposalRectangleV2 { readonly xMm: number; readonly yMm: number; readonly widthMm: number; readonly heightMm: number }
export interface ProposalPointV2 { readonly xMm: number; readonly yMm: number }
export interface ProposalSchemeGeometryV2 {
  readonly bounds: ProposalRectangleV2;
  readonly sections: readonly (ProposalRectangleV2 & {
    readonly label: string;
    readonly openingLabel: string;
    readonly hingeLabel?: string;
    readonly hardwareLabel?: string;
    readonly fill: 'glass' | 'sandwich';
    readonly symbols: readonly { readonly kind: 'turn' | 'tilt' | 'hinge' | 'sliding'; readonly points: readonly ProposalPointV2[] }[];
  })[];
  readonly transom: ProposalRectangleV2 | null;
  readonly splitLine?: readonly ProposalPointV2[];
}
export interface ProposalWorkV2 {
  readonly name: string;
  readonly quantity: number;
  readonly unitLabel?: string;
  readonly amount: ProposalMoneyV2;
}
export interface ProposalItemV2 {
  readonly id: string;
  readonly kind: 'Window' | 'Balcony' | 'balconyBlock' | 'WindowFinish';
  readonly name: string;
  readonly room: string;
  readonly typeLabel: string;
  readonly dimensions: readonly { readonly label: string; readonly widthMm: number; readonly heightMm: number; readonly depthMm?: number }[];
  readonly properties: readonly { readonly label: string; readonly value: string }[];
  readonly schemes: readonly { readonly label: string; readonly geometry: ProposalSchemeGeometryV2 }[];
  readonly pricingStatus: 'priced' | 'needsClarification';
  readonly clarification?: string;
  readonly priceLines: readonly { readonly label: string; readonly amount: ProposalMoneyV2 }[];
  readonly additionalWorks: readonly ProposalWorkV2[];
  readonly total: ProposalMoneyV2 | null;
}
export interface ProposalDocumentV2 {
  readonly version: 2;
  readonly context: {
    readonly calculationId: string;
    readonly name?: string;
    /** Calculation creation/update timestamps, never represented as measurement dates. */
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly clientName?: string;
    readonly clientPhone?: string;
    readonly objectAddress?: string;
  };
  /** Explicit independent DocumentSettings snapshot; never a CalculatorSettings lookup. */
  readonly seller?: {
    readonly sellerName?: string; readonly sellerPhone?: string; readonly telegram?: string;
    readonly whatsapp?: string; readonly email?: string; readonly companyName?: string;
    readonly inn?: string; readonly companyPhone?: string; readonly website?: string;
  };
  readonly items: readonly ProposalItemV2[];
  readonly orderAdditionalWorks: readonly ProposalWorkV2[];
  readonly summary: {
    readonly status: 'ready' | 'needsClarification' | 'needsConfirmation' | 'empty';
    readonly message?: string;
    readonly measurementsSubtotal: ProposalMoneyV2 | null;
    readonly orderWorksTotal: ProposalMoneyV2;
    readonly subtotal: ProposalMoneyV2 | null;
    readonly discount: { readonly label: string; readonly amount: ProposalMoneyV2 } | null;
    readonly roundingAdjustment: ProposalMoneyV2 | null;
    readonly total: ProposalMoneyV2 | null;
  };
}
