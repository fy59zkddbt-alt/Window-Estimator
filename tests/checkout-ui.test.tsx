import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { BillingSummary } from '../src/ui/BillingSummary';
import { CheckoutReturn, checkoutReturnState } from '../src/ui/CheckoutReturn';
import type { Entitlement } from '../src/application/access/entitlement';

const trial: Entitlement = { userId: 'user', status: 'trial', serverNow: 1, validUntil: 100,
  billing: { trialEndsAt: '2026-10-18T00:00:00Z', subscription: null } };
const checkout = { createSubscriptionCheckout: vi.fn() };
it('offers checkout for trial/expired, hides for paid, offline, blocked and missing billing', () => {
  for (const status of ['trial', 'expired'] as const) expect(renderToStaticMarkup(
    <BillingSummary entitlement={{ ...trial, status }} accessStatus={status === 'trial' ? 'allowed' : 'expired'} checkout={checkout} />
  )).toContain('Оформить подписку — 1290 ₽/мес');
  for (const props of [{ offline: true }, { accessStatus: 'blocked' as const },
    { entitlement: { ...trial, billing: undefined } as unknown as Entitlement },
    { entitlement: { ...trial, billing: { trialEndsAt: null, subscription: { status: 'active' as const,
      currentPeriodStart: '2026-10-01', currentPeriodEnd: '2026-11-01', cancelAtPeriodEnd: true, graceEndsAt: null } } } }])
    expect(renderToStaticMarkup(<BillingSummary entitlement={trial} accessStatus="allowed" checkout={checkout} {...props} />)).not.toContain('Оформить подписку');
});
it('Success/Fail only display return state, never call checkout or write entitlement', () => {
  const refresh = vi.fn(), dismiss = vi.fn();
  for (const state of ['success', 'fail'] as const) {
    expect(checkoutReturnState(`?checkout=${state}&status=active&OutSum=1290&SignatureValue=fake`)).toBe(state);
    const html = renderToStaticMarkup(<CheckoutReturn state={state} refresh={refresh} dismiss={dismiss} />);
    expect(html).toContain(state === 'success' ? 'не подтверждает оплату' : 'Оплата не завершена');
    expect(html).not.toContain('Оплата прошла');
  }
  expect(checkoutReturnState('?status=active')).toBeNull(); expect(refresh).not.toHaveBeenCalled();
  expect(checkout.createSubscriptionCheckout).not.toHaveBeenCalled(); expect(trial.status).toBe('trial');
});
