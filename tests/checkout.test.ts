import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { expect, it, vi } from 'vitest';
import { createSubscriptionCheckout, type PaymentAttempt } from '../src/application/access/checkout';
import { subscriptionPlan } from '../src/application/access/billing';
import { RobokassaProvider } from '../supabase/functions/_shared/robokassa';
import { checkoutHandler } from '../supabase/functions/_shared/checkout-handler';
import { SupabaseSubscriptionCheckout } from '../src/infrastructure/auth/supabase-checkout';
import type { SupabaseClient } from '@supabase/supabase-js';

const attempt: PaymentAttempt = { id: '00000000-0000-4000-8000-000000000001', userId: 'user', provider: 'robokassa',
  planId: 'monthly', amountMinor: 129000, currency: 'RUB', status: 'pending', providerPaymentReference: '12' };
const config = { merchantLogin: 'demo', password1: 'fixture-secret-only', isTest: true };
const provider = new RobokassaProvider(config);
it('builds the official MD5 signature with signed Shp parameter and recurring parent reference', async () => {
  const { checkoutUrl } = await createSubscriptionCheckout('user', { prepare: async () => attempt }, provider);
  const url = new URL(checkoutUrl), p = url.searchParams;
  expect(url.origin + url.pathname).toBe('https://auth.robokassa.ru/Merchant/Index.aspx');
  expect(p.get('OutSum')).toBe('1290.00'); expect(p.get('InvId')).toBe('12');
  expect(p.get('Recurring')).toBe('true'); expect(p.get('IsTest')).toBe('1');
  expect(p.get('Shp_attempt')).toBe(attempt.id);
  expect(p.get('SignatureValue')).toBe(createHash('md5')
    .update(`demo:1290.00:12:fixture-secret-only:Shp_attempt=${attempt.id}`).digest('hex'));
  expect(p.get('SignatureValue')).toBe('18b954b695f9bc0cb94afcef7ac0c2cc');
  // Independent fixed vector from the official basic signature format.
  expect(createHash('md5').update('demo:990.00:12:password_1').digest('hex')).toBe('6c9d6eb96b82e643b343c26a85349a37');
  expect(checkoutUrl).not.toContain(config.password1);
  expect(p.has('PreviousInvoiceID')).toBe(false); expect(p.has('Token')).toBe(false);
});
it('refuses production, missing credentials and invalid references', async () => {
  expect(() => new RobokassaProvider({ ...config, isTest: false })).toThrow('test-mode');
  expect(() => new RobokassaProvider({ ...config, password1: '' })).toThrow();
  for (const reference of ['0', '-1', '1e3', '2147483648']) await expect(provider.createCheckout({
    userId: 'user', plan: subscriptionPlan, idempotencyKey: attempt.id, providerPaymentReference: reference })).rejects.toThrow();
});
it('anonymous application request never touches repository or provider', async () => {
  const prepare = vi.fn(); await expect(createSubscriptionCheckout(null, { prepare }, provider)).rejects.toThrow('Authentication');
  expect(prepare).not.toHaveBeenCalled();
});
it('rejects wrong attempt owner, amount, plan, provider or status', async () => {
  for (const change of [{ userId: 'other' }, { amountMinor: 1 }, { planId: 'other' }, { provider: 'other' }, { status: 'succeeded' as const }]) {
    await expect(createSubscriptionCheckout('user', { prepare: async () => ({ ...attempt, ...change }) }, provider)).rejects.toThrow('Invalid');
  }
});
function fixture() {
  const prepare = vi.fn(async () => attempt);
  const authenticate = vi.fn(async (token: string) => token === 'valid' ? 'user' : null);
  return { prepare, authenticate, handler: checkoutHandler({ appOrigin: 'https://app.example', authenticate,
    repository: { prepare }, provider }) };
}
const request = (body: unknown = {}, token: string | null = 'valid') => new Request('https://edge.example/checkout', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});
it('authenticated HTTP checkout uses verified identity and server amount; repeated request reuses reference', async () => {
  const f = fixture();
  const first = await f.handler(request()); const second = await f.handler(request());
  expect(first.status).toBe(200); expect(await first.json()).toEqual(await second.json());
  expect(f.prepare).toHaveBeenCalledWith('user'); expect(f.authenticate).toHaveBeenCalledWith('valid');
  expect(attempt.status).toBe('pending');
});
it('rejects anonymous/invalid JWT and all frontend override fields without preparing an attempt', async () => {
  const f = fixture();
  for (const token of [null, 'invalid']) expect((await f.handler(request({}, token))).status).toBe(401);
  for (const body of [{ amount: 1 }, { user_id: 'other' }, { subscription_status: 'active' }, { provider: 'test' },
    { current_period_end: '2030-01-01' }, { entitlement: 'paid' }, { provider_subscription_id: 'x' }, []])
    expect((await f.handler(request(body))).status).toBe(400);
  expect(f.prepare).not.toHaveBeenCalled();
});
it('rejects foreign origins and methods; handles preflight and sanitized server errors', async () => {
  const f = fixture();
  expect((await f.handler(new Request('https://edge.example', { method: 'POST', headers: { Origin: 'https://evil.example' } }))).status).toBe(403);
  expect((await f.handler(new Request('https://edge.example'))).status).toBe(405);
  expect((await f.handler(new Request('https://edge.example', { method: 'OPTIONS' }))).status).toBe(204);
  f.prepare.mockRejectedValueOnce(new Error('server-secret'));
  const result = await f.handler(request()); expect(result.status).toBe(503); expect(await result.text()).not.toContain('server-secret');
});
it('browser sends empty body and rejects unsafe redirect URLs', async () => {
  const invoke = vi.fn(async () => ({ data: { checkoutUrl: 'https://auth.robokassa.ru/Merchant/Index.aspx?InvId=1' }, error: null }));
  const client = { functions: { invoke } } as unknown as SupabaseClient;
  await new SupabaseSubscriptionCheckout(client).createSubscriptionCheckout();
  expect(invoke).toHaveBeenCalledWith('subscription-checkout', { body: {} });
  invoke.mockResolvedValueOnce({ data: { checkoutUrl: 'https://evil.example' }, error: null });
  await expect(new SupabaseSubscriptionCheckout(client).createSubscriptionCheckout()).rejects.toThrow('адрес');
});
it('production browser import graph contains no server adapter, credentials or privileged client', () => {
  const visited = new Set<string>();
  function visit(file: string) {
    if (visited.has(file)) return; visited.add(file);
    const source = readFileSync(file, 'utf8');
    expect(source).not.toMatch(/ROBOKASSA_PASSWORD|SUPABASE_SERVICE_ROLE_KEY|node:crypto|functions\/_shared/);
    for (const match of source.matchAll(/(?:from\s+|import\s*\()(['"])(\.[^'"]+)\1/g)) {
      const path = resolve(dirname(file), match[2]!);
      const found = [path, `${path}.ts`, `${path}.tsx`].find((p) => {
        try { return readdirSync(dirname(p)).includes(p.split(/[\\/]/).at(-1)!); } catch { return false; }
      });
      if (found && /\.tsx?$/.test(found)) visit(found);
    }
  }
  visit(resolve('src/main.tsx')); expect(visited.size).toBeGreaterThan(10);
});
