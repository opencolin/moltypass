// Resend wrapper for the magic-link email.
//
// Self-host parity: when RESEND_API_KEY is unset (typical dev or
// self-host without billing), we DO NOT throw — we log the link to
// the server console and return { sent: false, dryRun: true } so the
// caller can show "Check your server logs for the magic link" in dev
// mode.
//
// DI-shaped — fetch + env are injected so tests can verify the request
// shape without hitting the network or relying on process.env state.

export interface SendEmailArgs {
  to: string;
  subject: string;
  /** Plain-text fallback. */
  text: string;
  /** Optional HTML body. */
  html?: string;
}

export interface ResendDeps {
  fetch: typeof fetch;
  apiKey: string | undefined;
  from: string;
  /** Where dry-run logs go. Tests inject a vi.fn(); production uses
   *  console.log. */
  log: (msg: string) => void;
}

export type SendResult =
  | { sent: true; id: string }
  | { sent: false; dryRun: true; reason: 'no_api_key' };

const RESEND_URL = 'https://api.resend.com/emails';

export async function send(args: SendEmailArgs, deps: ResendDeps): Promise<SendResult> {
  if (!deps.apiKey) {
    deps.log(`[resend dry-run] to=${args.to} subject="${args.subject}"`);
    deps.log(`[resend dry-run] body:\n${args.text}`);
    return { sent: false, dryRun: true, reason: 'no_api_key' };
  }
  const res = await deps.fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${deps.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: deps.from,
      to: [args.to],
      subject: args.subject,
      text: args.text,
      ...(args.html ? { html: args.html } : {}),
    }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`resend: ${res.status} ${errBody.slice(0, 200)}`);
  }
  const json = await res.json() as { id?: string };
  return { sent: true, id: json.id ?? 'unknown' };
}

/** Compose the magic-link email body. Plain text only — no HTML for
 *  the first ship; reviewers may want to scrutinize this for tracking
 *  links. */
export function buildMagicLinkEmail(args: {
  email: string;
  link: string;
  ttlMinutes: number;
}): SendEmailArgs {
  return {
    to: args.email,
    subject: 'Your Moltypass sign-in link',
    text:
`Sign in to Moltypass:

${args.link}

This link expires in ${args.ttlMinutes} minutes and can be used only once.

If you didn't request this, ignore this email.
`,
  };
}

// ----- production wiring helper -----

/** Build a ResendDeps from process.env. Route handlers call this once
 *  at module load. */
export function resendDepsFromEnv(env: NodeJS.ProcessEnv): ResendDeps {
  return {
    fetch: globalThis.fetch,
    apiKey: env['RESEND_API_KEY'],
    from: env['RESEND_FROM'] ?? 'Moltypass <no-reply@moltypass.app>',
    log: console.log.bind(console),
  };
}
