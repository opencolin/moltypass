// Stripe billing for the Team plan.
//
// Three surfaces:
//   1. Checkout Session   — admin creates a paid subscription
//   2. Billing Portal      — billing role manages payment method, cancel
//   3. Webhook verification — Stripe -> /api/billing/webhook
//
// We do NOT pull the official `stripe` SDK — it's a heavy dep we don't
// need most of. Three small wire-shape helpers + an HMAC-SHA256
// signature verifier covers the surfaces above and keeps the bundle
// small.

import { createHmac, timingSafeEqual } from 'node:crypto';

// ----- DI surfaces -----

export interface StripeDeps {
  fetch: typeof fetch;
  apiKey: string | undefined;
  /** Stripe API base — overridable for stub testing. */
  apiBase: string;
}

// ----- Checkout Session -----

export interface CreateCheckoutArgs {
  orgId: string;
  /** Stripe price ID for the seat-based Team plan. */
  priceId: string;
  /** Initial seat count. */
  quantity: number;
  /** Where Stripe redirects after successful payment. */
  successUrl: string;
  cancelUrl: string;
  /** Optional existing customer; if absent Stripe creates one. */
  customerId?: string;
}

export interface CheckoutSession {
  id: string;
  url: string;
  customerId?: string;
}

export async function createCheckoutSession(
  args: CreateCheckoutArgs,
  deps: StripeDeps,
): Promise<CheckoutSession> {
  if (!deps.apiKey) throw new Error('stripe: STRIPE_API_KEY is required');
  if (args.quantity < 1) throw new Error('stripe: quantity must be >= 1');
  const body = new URLSearchParams();
  body.set('mode', 'subscription');
  body.set('success_url', args.successUrl);
  body.set('cancel_url', args.cancelUrl);
  body.set('line_items[0][price]', args.priceId);
  body.set('line_items[0][quantity]', String(args.quantity));
  body.set('client_reference_id', args.orgId);
  if (args.customerId) body.set('customer', args.customerId);

  const res = await stripeRequest('checkout/sessions', body, deps);
  return { id: res.id, url: res.url, customerId: res.customer };
}

// ----- Billing Portal -----

export async function createPortalSession(
  args: { customerId: string; returnUrl: string },
  deps: StripeDeps,
): Promise<{ id: string; url: string }> {
  if (!deps.apiKey) throw new Error('stripe: STRIPE_API_KEY is required');
  const body = new URLSearchParams();
  body.set('customer', args.customerId);
  body.set('return_url', args.returnUrl);
  const res = await stripeRequest('billing_portal/sessions', body, deps);
  return { id: res.id, url: res.url };
}

// ----- Webhook signature verification -----

const DEFAULT_TOLERANCE_SEC = 5 * 60; // 5 minutes

/**
 * Verify a Stripe webhook signature. Returns the parsed event JSON on
 * success; throws on any failure (bad header shape, expired timestamp,
 * MAC mismatch, malformed body).
 *
 * Stripe-Signature header format:
 *   t=1700000000,v1=<hex>,v0=<deprecated>
 * Signature = HMAC-SHA256(secret, `${t}.${rawBody}`)
 */
export interface VerifiedEvent {
  type: string;
  data: { object: Record<string, unknown> };
  [k: string]: unknown;
}

export class WebhookVerificationError extends Error {
  constructor(public readonly reason: 'bad_header' | 'expired' | 'mac_mismatch' | 'malformed_body') {
    super(`stripe webhook: ${reason}`);
    this.name = 'WebhookVerificationError';
  }
}

export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
  opts: { now?: number; toleranceSec?: number } = {},
): VerifiedEvent {
  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed) throw new WebhookVerificationError('bad_header');
  const { timestamp, v1Sigs } = parsed;

  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const tolerance = opts.toleranceSec ?? DEFAULT_TOLERANCE_SEC;
  if (Math.abs(now - timestamp) > tolerance) {
    throw new WebhookVerificationError('expired');
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = createHmac('sha256', secret).update(signedPayload).digest();
  // Constant-time compare against every v1 signature in the header.
  let anyMatch = false;
  for (const sig of v1Sigs) {
    const sigBuf = Buffer.from(sig, 'hex');
    if (sigBuf.length === expected.length && timingSafeEqual(expected, sigBuf)) {
      anyMatch = true;
    }
  }
  if (!anyMatch) throw new WebhookVerificationError('mac_mismatch');

  try {
    return JSON.parse(rawBody) as VerifiedEvent;
  } catch {
    throw new WebhookVerificationError('malformed_body');
  }
}

/** Pure: map a Stripe subscription event to an org update we apply. */
export function mapSubscriptionEventToOrgUpdate(event: VerifiedEvent): {
  orgId?: string;
  customerId?: string;
  subscriptionId?: string;
  status?: 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete';
} | null {
  if (!event.type.startsWith('customer.subscription.')) return null;
  const obj = event.data?.object as Record<string, unknown> | undefined;
  if (!obj) return null;
  const status = typeof obj['status'] === 'string' ? obj['status'] as string : undefined;
  const known: ReadonlySet<string> = new Set(['trialing', 'active', 'past_due', 'canceled', 'incomplete']);
  return {
    customerId: typeof obj['customer'] === 'string' ? obj['customer'] as string : undefined,
    subscriptionId: typeof obj['id'] === 'string' ? obj['id'] as string : undefined,
    status: status && known.has(status) ? status as never : undefined,
  };
}

// ----- internals -----

interface ParsedHeader {
  timestamp: number;
  v1Sigs: string[];
}

function parseSignatureHeader(header: string): ParsedHeader | null {
  if (typeof header !== 'string' || header.length === 0) return null;
  const parts = header.split(',');
  let timestamp: number | null = null;
  const v1Sigs: string[] = [];
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq < 1) return null;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k === 't') {
      const n = parseInt(v, 10);
      if (!Number.isFinite(n)) return null;
      timestamp = n;
    } else if (k === 'v1') {
      v1Sigs.push(v);
    }
    // ignore v0 (deprecated) and unknown schemes
  }
  if (timestamp === null || v1Sigs.length === 0) return null;
  return { timestamp, v1Sigs };
}

async function stripeRequest(
  path: string,
  body: URLSearchParams,
  deps: StripeDeps,
): Promise<{ id: string; url: string; customer?: string }> {
  const res = await deps.fetch(`${deps.apiBase}/${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${deps.apiKey}`,
      'content-type': 'application/x-www-form-urlencoded',
      'stripe-version': '2024-06-20',
    },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`stripe ${path}: ${res.status} ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`stripe ${path}: malformed response`);
  }
}
