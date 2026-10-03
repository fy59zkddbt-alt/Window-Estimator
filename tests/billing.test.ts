import { expect, it } from 'vitest';
import { decodeBillingSummary, subscriptionPlan } from '../src/application/access/billing';
import { decodeEntitlement } from '../src/application/access/entitlement';
const summary = { trialEndsAt: '2026-10-17T00:00:00Z', subscription: {
  status: 'active' as const, currentPeriodStart: '2026-10-03T00:00:00Z', currentPeriodEnd: '2026-11-03T00:00:00Z',
  cancelAtPeriodEnd: true, graceEndsAt: null,
} };
it('decodes read-only billing and discards provider data', () => {
  expect(subscriptionPlan.priceMinor).toBe(129_000);
  expect(decodeBillingSummary({ ...summary, provider: 'secret' })).toEqual(summary);
  expect(decodeBillingSummary({ trialEndsAt: null, subscription: null }).subscription).toBeNull();
});
it('rejects corrupt server/cache projections without granting access', () => {
  for (const patch of [{ status: 'unknown' }, { currentPeriodEnd: 'bad' }, { currentPeriodStart: summary.subscription.currentPeriodEnd },
    { cancelAtPeriodEnd: 'yes' }, { graceEndsAt: 'bad' }, { status: 'past_due', graceEndsAt: null }])
    expect(() => decodeBillingSummary({ ...summary, subscription: { ...summary.subscription, ...patch } })).toThrow('Invalid billing');
  for (const value of [null, {}, { trialEndsAt: 'bad', subscription: null }]) expect(() => decodeBillingSummary(value)).toThrow();
});
it('legacy cache remains readable; new cache preserves server summary', () => {
  const e = { userId: 'A', status: 'active', serverNow: 1, validUntil: 2 };
  expect(decodeEntitlement(e)).toEqual(e);
  expect(decodeEntitlement({ ...e, billing: summary }).billing).toEqual(summary);
  expect(() => decodeEntitlement({ ...e, billing: {} })).toThrow();
});
