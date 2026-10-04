import type { subscriptionPlan } from './billing.ts';

/** Server-only port. Never composed into the browser.
 * Caller authenticates ownership; adapter keeps credentials and verifies callbacks.
 */
export interface PaymentProvider {
  createCheckout(input: { userId: string; plan: typeof subscriptionPlan; idempotencyKey: string; providerPaymentReference: string }): Promise<{ checkoutUrl: string }>;
  cancelAtPeriodEnd(providerSubscriptionId: string, idempotencyKey: string): Promise<void>;
  resumeSubscription(providerSubscriptionId: string, idempotencyKey: string): Promise<void>;
}
/** Provider-neutral event, accepted only AFTER provider authenticity verification.
 * Future server handler must deduplicate eventId and reject stale/out-of-order
 * events before changing periods. Never trust browser-supplied paid events.
 */
export type VerifiedPaymentEvent = {
  provider: string; eventId: string; occurredAt: string; providerSubscriptionId: string;
} & (
  | { type: 'paymentSucceeded'; providerCustomerId?: string; currentPeriodStart: string; currentPeriodEnd: string }
  | { type: 'paymentFailed' }
  | { type: 'renewalChanged'; cancelAtPeriodEnd: boolean }
  | { type: 'subscriptionEnded'; status: 'expired' | 'canceled' }
);
export interface SubscriptionEventHandler {
  processProviderEvent(event: VerifiedPaymentEvent): Promise<void>;
}
