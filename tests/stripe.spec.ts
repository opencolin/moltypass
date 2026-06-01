import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  createCheckoutSession,
  createPortalSession,
  verifyWebhookSignature,
  mapSubscriptionEventToOrgUpdate,
  WebhookVerificationError,
  type StripeDeps,
} from '../web/lib/billing/stripe';

function makeDeps(overrides: Partial<StripeDeps> = {}): StripeDeps {
  return {
    fetch: vi.fn(async () => new Response(JSON.stringify({ id: 'cs_test', url: 'https://stripe.test/x', customer: 'cus_1' }), { status: 200 })) as unknown as typeof fetch,
    apiKey: 'sk_test_key',
    apiBase: 'https://api.stripe.test/v1',
    ...overrides,
  };
}

describe('createCheckoutSession', () => {
  it('posts the right payload and returns id/url/customerId', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ id: 'cs_42', url: 'https://x', customer: 'cus_7' }), { status: 200 }));
    const res = await createCheckoutSession(
      { orgId: 'org-1', priceId: 'price_1', quantity: 5, successUrl: 'https://app/ok', cancelUrl: 'https://app/no' },
      makeDeps({ fetch: fetchFn as unknown as typeof fetch }),
    );
    expect(res).toEqual({ id: 'cs_42', url: 'https://x', customerId: 'cus_7' });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://api.stripe.test/v1/checkout/sessions');
    expect((init as RequestInit).method).toBe('POST');
    const body = new URLSearchParams((init as RequestInit).body as string);
    expect(body.get('mode')).toBe('subscription');
    expect(body.get('line_items[0][price]')).toBe('price_1');
    expect(body.get('line_items[0][quantity]')).toBe('5');
    expect(body.get('client_reference_id')).toBe('org-1');
  });

  it('throws when apiKey is missing', async () => {
    await expect(createCheckoutSession(
      { orgId: 'o', priceId: 'p', quantity: 1, successUrl: 's', cancelUrl: 'c' },
      makeDeps({ apiKey: undefined }),
    )).rejects.toThrow('STRIPE_API_KEY');
  });

  it('throws on zero or negative quantity', async () => {
    await expect(createCheckoutSession(
      { orgId: 'o', priceId: 'p', quantity: 0, successUrl: 's', cancelUrl: 'c' },
      makeDeps(),
    )).rejects.toThrow('quantity');
  });

  it('forwards an existing customerId when provided', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ id: 'cs', url: 'u' }), { status: 200 }));
    await createCheckoutSession(
      { orgId: 'o', priceId: 'p', quantity: 1, successUrl: 's', cancelUrl: 'c', customerId: 'cus_existing' },
      makeDeps({ fetch: fetchFn as unknown as typeof fetch }),
    );
    const body = new URLSearchParams((fetchFn.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.get('customer')).toBe('cus_existing');
  });

  it('propagates a clear error on non-2xx Stripe response', async () => {
    const fetchFn = vi.fn(async () => new Response('your card was declined', { status: 402 }));
    await expect(createCheckoutSession(
      { orgId: 'o', priceId: 'p', quantity: 1, successUrl: 's', cancelUrl: 'c' },
      makeDeps({ fetch: fetchFn as unknown as typeof fetch }),
    )).rejects.toThrow(/stripe checkout\/sessions: 402/);
  });
});

describe('createPortalSession', () => {
  it('posts customer + return_url and returns id/url', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ id: 'bps_1', url: 'https://portal' }), { status: 200 }));
    const res = await createPortalSession(
      { customerId: 'cus_x', returnUrl: 'https://app/back' },
      makeDeps({ fetch: fetchFn as unknown as typeof fetch }),
    );
    expect(res).toEqual({ id: 'bps_1', url: 'https://portal' });
    const body = new URLSearchParams((fetchFn.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.get('customer')).toBe('cus_x');
    expect(body.get('return_url')).toBe('https://app/back');
  });
});

describe('verifyWebhookSignature', () => {
  const SECRET = 'whsec_test_secret_' + 'A'.repeat(20);
  const body = JSON.stringify({ type: 'customer.subscription.updated', data: { object: { id: 'sub_1', status: 'active', customer: 'cus_1' } } });
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', SECRET).update(`${ts}.${body}`).digest('hex');
  const header = `t=${ts},v1=${sig}`;

  it('verifies a valid signature and returns the parsed event', () => {
    const evt = verifyWebhookSignature(body, header, SECRET);
    expect(evt.type).toBe('customer.subscription.updated');
  });

  it('rejects an expired timestamp (outside default tolerance)', () => {
    const old = ts - 10 * 60; // 10 minutes ago, default tolerance is 5min
    const oldSig = createHmac('sha256', SECRET).update(`${old}.${body}`).digest('hex');
    expect(() => verifyWebhookSignature(body, `t=${old},v1=${oldSig}`, SECRET))
      .toThrowError(WebhookVerificationError);
  });

  it('accepts a timestamp within tolerance', () => {
    const recent = ts - 60; // 1 minute ago
    const recentSig = createHmac('sha256', SECRET).update(`${recent}.${body}`).digest('hex');
    expect(() => verifyWebhookSignature(body, `t=${recent},v1=${recentSig}`, SECRET)).not.toThrow();
  });

  it('rejects a bad signature (wrong secret)', () => {
    expect(() => verifyWebhookSignature(body, header, 'not-the-secret'))
      .toThrowError(WebhookVerificationError);
  });

  it('rejects a malformed header (no t=)', () => {
    expect(() => verifyWebhookSignature(body, `v1=${sig}`, SECRET))
      .toThrowError(WebhookVerificationError);
  });

  it('rejects a malformed header (no v1=)', () => {
    expect(() => verifyWebhookSignature(body, `t=${ts}`, SECRET))
      .toThrowError(WebhookVerificationError);
  });

  it('rejects body that fails to JSON.parse even after MAC passes', () => {
    const garbage = 'not-json';
    const garbageSig = createHmac('sha256', SECRET).update(`${ts}.${garbage}`).digest('hex');
    expect(() => verifyWebhookSignature(garbage, `t=${ts},v1=${garbageSig}`, SECRET))
      .toThrowError(WebhookVerificationError);
  });

  it('accepts multiple v1 signatures in the header (rotation window)', () => {
    const badSig = '0'.repeat(64);
    expect(() => verifyWebhookSignature(body, `t=${ts},v1=${badSig},v1=${sig}`, SECRET)).not.toThrow();
  });

  it('ignores deprecated v0 entries in the header', () => {
    expect(() => verifyWebhookSignature(body, `t=${ts},v0=ignored,v1=${sig}`, SECRET)).not.toThrow();
  });
});

describe('mapSubscriptionEventToOrgUpdate', () => {
  it('extracts subscriptionId/customerId/status for customer.subscription.* events', () => {
    const update = mapSubscriptionEventToOrgUpdate({
      type: 'customer.subscription.created',
      data: { object: { id: 'sub_x', customer: 'cus_x', status: 'active' } },
    });
    expect(update).toEqual({
      subscriptionId: 'sub_x',
      customerId: 'cus_x',
      status: 'active',
    });
  });

  it('returns null for non-subscription events (e.g. invoice.*)', () => {
    expect(mapSubscriptionEventToOrgUpdate({
      type: 'invoice.paid',
      data: { object: {} },
    })).toBeNull();
  });

  it('returns status:undefined when the value is not a known subscription state', () => {
    const update = mapSubscriptionEventToOrgUpdate({
      type: 'customer.subscription.updated',
      data: { object: { id: 's', customer: 'c', status: 'unicorn' } },
    });
    expect(update?.status).toBeUndefined();
    expect(update?.subscriptionId).toBe('s'); // other fields still extracted
  });
});
