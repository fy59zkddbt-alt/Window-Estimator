import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { BillingSummary } from '../src/ui/BillingSummary';
import type { Entitlement } from '../src/application/access/entitlement';

const entitlement: Entitlement = { userId: 'A', status: 'active', serverNow: 1, validUntil: 2,
  billing: { trialEndsAt: null, subscription: { status: 'active', currentPeriodStart: '2026-10-03T00:00:00Z',
    currentPeriodEnd: '2026-11-03T00:00:00Z', cancelAtPeriodEnd: true, graceEndsAt: null } } };
it('uses current gate verdict after timer expiry instead of cached active verdict', () => {
  const allowed = renderToStaticMarkup(<BillingSummary entitlement={entitlement} accessStatus="allowed" />);
  expect(allowed).toContain('Доступ сохранится до');
  const expired = renderToStaticMarkup(<BillingSummary entitlement={entitlement} accessStatus="expired" />);
  expect(expired).toContain('Статус доступа: Истёк');
  expect(expired).not.toContain('Доступ сохранится до');
  const restricted = renderToStaticMarkup(<BillingSummary entitlement={entitlement} accessStatus="device_limit_reached" />);
  expect(restricted).toContain('Лимит устройств');
  const blocked = renderToStaticMarkup(<BillingSummary entitlement={{ ...entitlement, status: 'blocked' }} accessStatus="blocked" />);
  expect(blocked).toContain('Статус доступа: Заблокирован');
  expect(blocked).not.toContain('Доступ сохранится до');
});
