/**
 * moltypass:// URI resolver — scratch draft, to be moved into
 * src/shared/moltypass-uri.ts once council names the workstream.
 *
 * Grammar (final v1):
 *   moltypass://<provider>/<label>[/<field>]
 *   multipass://<provider>/<label>[/<field>]      (alias per PLANS/branding-aliases.md)
 *
 * <provider> — required. Slug of the provider, e.g. `anthropic`, `openai`,
 *              `gemini`, `nebius`, `together`, `groq`, `cohere`, `mistral`.
 *              Kebab-case, no dots.
 * <label>    — required. The vault-item label, arbitrary string. Percent-encoded
 *              per RFC 3986 unreserved rules; a raw '/' in label means percent-
 *              encoded as %2F.
 * <field>    — optional. Defaults to 'key' (the primary secret). Other legal
 *              values in v1: 'notes', 'file:<n>' (Nth attached file).
 *
 * Return: ParsedMoltypassUri, or a well-typed ParseError.
 *
 * The resolver LIVES IN THE DAEMON. Callers (CLI, extension SDK) send the raw
 * URI over Native Messaging; the daemon does auth, lookup, and returns the
 * resolved value. This file is JUST the parser; resolution is elsewhere.
 */

export type ProviderSlug = string;
export type Label = string;
export type Field = 'key' | 'notes' | `file:${string}`;

export type ParsedMoltypassUri = {
  scheme: 'moltypass' | 'multipass';
  provider: ProviderSlug;
  label: Label;
  field: Field;
};

export type ParseError = {
  kind: 'bad_scheme' | 'missing_provider' | 'missing_label' | 'bad_field' | 'malformed';
  raw: string;
  detail: string;
};

const URI_RE = /^(moltypass|multipass):\/\/([^/]+)\/([^/]+)(?:\/(.+))?$/;
const PROVIDER_RE = /^[a-z][a-z0-9-]*$/;

/** Parse without doing any vault lookup. Pure function; testable. */
export function parseMoltypassUri(raw: string): ParsedMoltypassUri | ParseError {
  if (typeof raw !== 'string' || raw.length === 0) {
    return { kind: 'malformed', raw, detail: 'empty input' };
  }
  const m = URI_RE.exec(raw);
  if (!m) {
    if (!/^(moltypass|multipass):\/\//.test(raw)) {
      return { kind: 'bad_scheme', raw, detail: 'must start with moltypass:// or multipass://' };
    }
    return { kind: 'malformed', raw, detail: 'expected <scheme>://<provider>/<label>[/<field>]' };
  }
  const scheme = m[1] as 'moltypass' | 'multipass';
  const providerRaw = m[2];
  const labelRaw = m[3];
  const fieldRaw = m[4];

  if (!providerRaw) return { kind: 'missing_provider', raw, detail: 'provider segment is empty' };
  if (!PROVIDER_RE.test(providerRaw)) {
    return { kind: 'missing_provider', raw, detail: `provider must be kebab-case: got ${providerRaw}` };
  }
  if (!labelRaw) return { kind: 'missing_label', raw, detail: 'label segment is empty' };

  let label: string;
  try {
    label = decodeURIComponent(labelRaw);
  } catch {
    return { kind: 'malformed', raw, detail: 'label contains bad percent-encoding' };
  }

  let field: Field = 'key';
  if (fieldRaw !== undefined) {
    if (fieldRaw === 'key' || fieldRaw === 'notes') {
      field = fieldRaw;
    } else if (fieldRaw.startsWith('file:')) {
      const name = fieldRaw.slice(5);
      if (!name) return { kind: 'bad_field', raw, detail: 'file: field requires a name' };
      field = `file:${name}` as Field;
    } else {
      return { kind: 'bad_field', raw, detail: `unknown field: ${fieldRaw}` };
    }
  }

  return {
    scheme,
    provider: providerRaw,
    label,
    field,
  };
}

/** True if input looks like a moltypass/multipass URI. Cheap; use before parse. */
export function isMoltypassUri(raw: unknown): raw is string {
  return typeof raw === 'string' && /^(moltypass|multipass):\/\//.test(raw);
}

/**
 * Serialize back to canonical form. The canonical scheme is always 'moltypass'
 * regardless of what the input scheme was — the alias is accepted on input but
 * we present canonical on output (logs, error messages).
 */
export function formatMoltypassUri(p: ParsedMoltypassUri): string {
  const base = `moltypass://${p.provider}/${encodeURIComponent(p.label)}`;
  return p.field === 'key' ? base : `${base}/${p.field}`;
}
