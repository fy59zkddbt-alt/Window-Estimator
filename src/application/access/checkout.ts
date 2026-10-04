import { subscriptionPlan } from './billing.ts';
import type { PaymentProvider } from './payment-provider.ts';

/** Browser port accepts no price, ownership or paid-state inputs. */
export interface SubscriptionCheckout {
  createSubscriptionCheckout(): Promise<{ checkoutUrl: string }>;
}
export interface PaymentAttempt {
  id: string;
  userId: string;
  provider: string;
  planId: string;
  amountMinor: number;
  currency: string;
  status: 'pending' | 'succeeded' | 'failed' | 'canceled';
  providerPaymentReference: string;
}
export interface CheckoutAttemptRepository {
  /** Atomic server-only eligibility check + reuse/create pending attempt. */
  prepare(userId: string): Promise<PaymentAttempt>;
}
export class CheckoutDenied extends Error {}
/** Authenticated identity is injected by the server, never decoded from body. */
export async function createSubscriptionCheckout(userId: string | null,
  repository: CheckoutAttemptRepository, provider: PaymentProvider) {
  if (!userId) throw new CheckoutDenied('Authentication required');
  const attempt = await repository.prepare(userId);
  if (attempt.userId !== userId || attempt.provider !== 'robokassa' || attempt.status !== 'pending'
    || attempt.planId !== subscriptionPlan.id || attempt.amountMinor !== subscriptionPlan.priceMinor
    || attempt.currency !== subscriptionPlan.currency) throw new CheckoutDenied('Invalid payment attempt');
  return provider.createCheckout({ userId, plan: subscriptionPlan, idempotencyKey: attempt.id,
    providerPaymentReference: attempt.providerPaymentReference });
}
