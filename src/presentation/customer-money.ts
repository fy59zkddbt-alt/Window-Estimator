import type { ProposalMoneyV2 } from '../domain/documents/proposal-document-v2';

/** Customer typography only: remove zero kopecks, preserve the document's exact digits.
 * BigInt checks the minor-unit remainder without any floating-point conversion.
 * This helper has no browser/React dependency and can also serve future renderers.
 */
export function customerMoney(amount: ProposalMoneyV2, negative = false): string {
  const display = BigInt(amount.minor) % 100n === 0n
    ? amount.display.replace(/,00(?=\s*₽$)/u, '') : amount.display;
  return `${negative ? '−' : ''}${display}`;
}
