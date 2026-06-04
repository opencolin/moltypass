import { describe, it, expect, vi } from 'vitest';
import { send, buildMagicLinkEmail, type ResendDeps } from '../web/lib/email/resend';

function makeDeps(overrides: Partial<ResendDeps> = {}): ResendDeps {
  return {
    fetch: vi.fn(async () => new Response(JSON.stringify({ id: 'resend-id-1' }), { status: 200 })) as unknown as typeof fetch,
    apiKey: 'rs_TEST_KEY',
    from: 'Moltypass <no-reply@moltypass.app>',
    log: vi.fn(),
    ...overrides,
  };
}

describe('send', () => {
  it('posts the expected payload shape to the Resend API when apiKey is set', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ id: 'rs-42' }), { status: 200 }));
    const deps = makeDeps({ fetch: fetchFn as unknown as typeof fetch });
    const res = await send(
      { to: 'alice@b.test', subject: 'hi', text: 'hello' },
      deps,
    );
    expect(res).toEqual({ sent: true, id: 'rs-42' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect((init as RequestInit).method).toBe('POST');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer rs_TEST_KEY');
    expect(headers['content-type']).toBe('application/json');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({
      from: 'Moltypass <no-reply@moltypass.app>',
      to: ['alice@b.test'],
      subject: 'hi',
      text: 'hello',
    });
  });

  it('includes html when provided', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ id: 'x' }), { status: 200 }));
    await send({ to: 'a@b.test', subject: 's', text: 't', html: '<p>HTML</p>' }, makeDeps({ fetch: fetchFn as unknown as typeof fetch }));
    const body = JSON.parse((fetchFn.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.html).toBe('<p>HTML</p>');
  });

  it('returns dryRun + logs when apiKey is unset (self-host without billing)', async () => {
    const log = vi.fn();
    const fetchFn = vi.fn();
    const res = await send(
      { to: 'a@b.test', subject: 'hi', text: 'click https://x' },
      makeDeps({ apiKey: undefined, log, fetch: fetchFn as unknown as typeof fetch }),
    );
    expect(res).toEqual({ sent: false, dryRun: true, reason: 'no_api_key' });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(2);
    expect((log.mock.calls[0]![0] as string)).toContain('a@b.test');
    expect((log.mock.calls[1]![0] as string)).toContain('click https://x');
  });

  it('throws with a clear error on non-2xx Resend response', async () => {
    const fetchFn = vi.fn(async () => new Response('rate-limited', { status: 429 }));
    await expect(send(
      { to: 'a@b.test', subject: 'hi', text: 'x' },
      makeDeps({ fetch: fetchFn as unknown as typeof fetch }),
    )).rejects.toThrow(/resend: 429/);
  });

  it('truncates an oversized error body in the thrown message', async () => {
    const bigBody = 'X'.repeat(1000);
    const fetchFn = vi.fn(async () => new Response(bigBody, { status: 500 }));
    try {
      await send({ to: 'a@b.test', subject: 'hi', text: 'x' }, makeDeps({ fetch: fetchFn as unknown as typeof fetch }));
      expect.unreachable();
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toMatch(/^resend: 500/);
      // Verify we truncated to ~200 chars after the prefix.
      expect(msg.length).toBeLessThan(220);
    }
  });

  it('handles a Resend response without an id (defaults to "unknown")', async () => {
    const fetchFn = vi.fn(async () => new Response('{}', { status: 200 }));
    const res = await send({ to: 'a@b.test', subject: 'hi', text: 'x' }, makeDeps({ fetch: fetchFn as unknown as typeof fetch }));
    expect(res).toEqual({ sent: true, id: 'unknown' });
  });
});

describe('buildMagicLinkEmail', () => {
  it('composes a clean plain-text body with the link + TTL', () => {
    const msg = buildMagicLinkEmail({
      email: 'alice@b.test',
      link: 'https://moltypass.app/auth/callback?token=ABC',
      ttlMinutes: 15,
    });
    expect(msg.to).toBe('alice@b.test');
    expect(msg.subject).toContain('Moltypass sign-in');
    expect(msg.text).toContain('https://moltypass.app/auth/callback?token=ABC');
    expect(msg.text).toContain('15 minutes');
    expect(msg.text).toContain('only once');
    expect(msg.html).toBeUndefined(); // no HTML; reviewers can audit text only
  });
});
