/** Provisional single monthly recurring plan. Not a payment authorization. */
export const subscriptionPlan = { id: 'monthly', currency: 'RUB', priceMinor: 129_000, interval: 'month', recurring: true } as const;
export type SubscriptionStatus = 'active' | 'past_due' | 'expired' | 'canceled';
export interface BillingSummary {
  trialEndsAt: string | null;
  subscription: null | {
    status: SubscriptionStatus;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
    graceEndsAt: string | null;
  };
}
/** Read-only server projection; no provider ids or card information. */
export function decodeBillingSummary(value: unknown): BillingSummary {
  if (!value || typeof value !== 'object') throw new Error('Invalid billing summary');
  const row = value as BillingSummary;
  const date = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
  if (row.trialEndsAt !== null && !date(row.trialEndsAt)) throw new Error('Invalid billing summary');
  const s = row.subscription;
  if (s === null) return { trialEndsAt: row.trialEndsAt, subscription: null };
  if (!s || typeof s !== 'object' || !['active', 'past_due', 'expired', 'canceled'].includes(s.status)
    || !date(s.currentPeriodStart) || !date(s.currentPeriodEnd)
    || Date.parse(s.currentPeriodEnd) <= Date.parse(s.currentPeriodStart)
    || typeof s.cancelAtPeriodEnd !== 'boolean'
    || (s.graceEndsAt !== null && !date(s.graceEndsAt))
    || (s.status === 'past_due' && s.graceEndsAt === null)) throw new Error('Invalid billing summary');
  return { trialEndsAt: row.trialEndsAt, subscription: {
    status: s.status, currentPeriodStart: s.currentPeriodStart, currentPeriodEnd: s.currentPeriodEnd,
    cancelAtPeriodEnd: s.cancelAtPeriodEnd, graceEndsAt: s.graceEndsAt,
  } };
}
