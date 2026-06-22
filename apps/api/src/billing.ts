import Stripe from 'stripe';
import { env, toAccountSummary, type UserRow } from '@vpat/backend';
import type { AccountSummary, SelfServePlan, SubscriptionPlan } from '@vpat/shared';
import * as store from './store.js';

const ACTIVE_STATUSES = new Set<Stripe.Subscription.Status>(['active', 'trialing', 'past_due', 'unpaid']);
const hasValidStripeSecretKey = env.stripe.secretKey.startsWith('sk_');

const stripe = hasValidStripeSecretKey
  ? new Stripe(env.stripe.secretKey, { apiVersion: '2026-02-25.clover' as Stripe.LatestApiVersion })
  : null;

const PRICE_BY_PLAN: Record<SelfServePlan, string> = {
  starter: env.stripe.starterPriceId,
  growth: env.stripe.growthPriceId,
};

const PLAN_BY_PRICE = new Map<string, SelfServePlan>(
  Object.entries(PRICE_BY_PLAN)
    .filter(([, value]) => value)
    .map(([plan, value]) => [value, plan as SelfServePlan]),
);

function requireStripe(): Stripe {
  if (!stripe) {
    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY to a secret key starting with sk_ and provide the price ids.');
  }
  return stripe;
}

function planForPriceId(priceId: string | null): SelfServePlan | null {
  if (!priceId) return null;
  return PLAN_BY_PRICE.get(priceId) ?? null;
}

function effectivePlanForSubscription(priceId: string | null, status: Stripe.Subscription.Status): SubscriptionPlan {
  const paidPlan = planForPriceId(priceId);
  if (!paidPlan) return 'starter';
  return ACTIVE_STATUSES.has(status) ? paidPlan : 'starter';
}

function appUrl(path: string): string {
  return new URL(path, env.appUrl).toString();
}

export function billingEnabled(): boolean {
  return Boolean(stripe);
}

export function isSelfServePlan(plan: SubscriptionPlan): plan is SelfServePlan {
  return plan === 'starter' || plan === 'growth';
}

export async function ensureCustomer(user: UserRow): Promise<string> {
  if (user.stripe_customer_id) return user.stripe_customer_id;
  const api = requireStripe();
  const customer = await api.customers.create({
    email: user.billing_email ?? user.email,
    metadata: { userId: user.id },
  });
  await store.setStripeCustomer(user.id, customer.id, customer.email ?? user.email);
  return customer.id;
}

export async function createCheckoutUrl(user: UserRow, plan: SelfServePlan): Promise<string> {
  const api = requireStripe();
  const price = PRICE_BY_PLAN[plan];
  if (!price) throw new Error(`Missing Stripe price id for ${plan}`);
  const customer = await ensureCustomer(user);
  const session = await api.checkout.sessions.create({
    mode: 'subscription',
    client_reference_id: user.id,
    customer,
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
    line_items: [{ price, quantity: 1 }],
    success_url: appUrl('/?checkout=success&session_id={CHECKOUT_SESSION_ID}'),
    cancel_url: appUrl('/?checkout=cancel'),
    subscription_data: {
      metadata: { userId: user.id, plan },
    },
  });
  if (!session.url) throw new Error('Stripe Checkout did not return a redirect URL');
  return session.url;
}

async function customerEmail(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null): Promise<string | null> {
  if (!customer) return null;
  if (typeof customer !== 'string') {
    return 'deleted' in customer ? null : (customer.email ?? null);
  }
  const api = requireStripe();
  const found = await api.customers.retrieve(customer);
  return typeof found === 'string' || 'deleted' in found ? null : (found.email ?? null);
}

export async function syncSubscriptionToUser(
  userId: string,
  subscription: Stripe.Subscription,
): Promise<AccountSummary> {
  const priceId = subscription.items.data[0]?.price.id ?? null;
  const nextPlan = effectivePlanForSubscription(priceId, subscription.status);
  const stripeCustomerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id ?? null;
  await store.applyStripeSubscription(userId, {
    plan: nextPlan,
    stripeCustomerId,
    stripeSubscriptionId: subscription.id,
    stripePriceId: priceId,
    subscriptionStatus: subscription.status,
    billingEmail: await customerEmail(subscription.customer),
  });
  const user = await store.getUserRow(userId);
  if (!user) throw new Error('user not found after Stripe sync');
  const activeReports = await store.countActiveReports(userId);
  return toAccountSummary(user, activeReports);
}

export async function clearSubscriptionForCustomer(customerId: string, status: string): Promise<void> {
  const user = await store.getUserByStripeCustomerId(customerId);
  if (!user) return;
  await store.applyStripeSubscription(user.id, {
    plan: 'starter',
    stripeCustomerId: customerId,
    stripeSubscriptionId: null,
    stripePriceId: null,
    subscriptionStatus: status,
    billingEmail: await customerEmail(customerId),
  });
}

export async function confirmCheckoutSession(userId: string, sessionId: string): Promise<AccountSummary> {
  const api = requireStripe();
  const session = await api.checkout.sessions.retrieve(sessionId, {
    expand: ['subscription'],
  });
  if (session.client_reference_id !== userId) throw new Error('Checkout session does not belong to the current user');
  if (!session.subscription || typeof session.subscription === 'string') {
    throw new Error('Stripe Checkout session is missing a subscription');
  }
  return syncSubscriptionToUser(userId, session.subscription);
}

export async function createPortalUrl(user: UserRow, returnPath = '/'): Promise<string> {
  const api = requireStripe();
  const customer = await ensureCustomer(user);
  const session = await api.billingPortal.sessions.create({
    customer,
    return_url: appUrl(returnPath),
  });
  return session.url;
}

export async function constructWebhookEvent(payload: string, signature: string): Promise<Stripe.Event> {
  const api = requireStripe();
  if (!env.stripe.webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  return api.webhooks.constructEventAsync(payload, signature, env.stripe.webhookSecret);
}
