import { CheckoutDenied, createSubscriptionCheckout, type CheckoutAttemptRepository } from '../../../src/application/access/checkout.ts';
import type { PaymentProvider } from '../../../src/application/access/payment-provider.ts';

export interface CheckoutDependencies {
  appOrigin: string;
  authenticate(token: string): Promise<string | null>;
  repository: CheckoutAttemptRepository;
  provider: PaymentProvider;
}
export function checkoutHandler(deps: CheckoutDependencies) {
  return async (request: Request): Promise<Response> => {
    const headers = { 'Access-Control-Allow-Origin': deps.appOrigin, 'Vary': 'Origin',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store' };
    const response = (status: number, body: object) => Response.json(body, { status, headers });
    if (request.headers.get('origin') && request.headers.get('origin') !== deps.appOrigin)
      return response(403, { error: 'Origin forbidden' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return response(405, { error: 'POST required' });
    const match = /^Bearer (\S+)$/i.exec(request.headers.get('authorization') ?? '');
    if (!match) return response(401, { error: 'Authentication required' });
    try {
      const userId = await deps.authenticate(match[1]!);
      if (!userId) return response(401, { error: 'Confirmed authentication required' });
      // Reject all client parameters, including amount, user_id and provider ids.
      const body: unknown = await request.json();
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length)
        return response(400, { error: 'Checkout accepts no parameters' });
      return response(200, await createSubscriptionCheckout(userId, deps.repository, deps.provider));
    } catch (error) {
      if (error instanceof SyntaxError) return response(400, { error: 'Invalid request' });
      return response(error instanceof CheckoutDenied ? 409 : 503, { error: 'Checkout unavailable' });
    }
  };
}
