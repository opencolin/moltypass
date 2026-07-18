// Pure URL contract for the dashboard filter chips. Lives in its own
// file (no drizzle import) so root-level Vitest can cover it.

export interface AuditFilter {
  /** ms epoch range; inclusive bounds when set. */
  tsRange?: { from?: number; to?: number };
  origins?: string[];
  services?: Array<'anthropic' | 'openai' | 'gemini'>;
  fingerprints?: string[];
  /** Audit event kinds — extension-side enum mirrored here as strings. */
  kinds?: string[];
  /** Inclusive integer range. */
  status?: { min?: number; max?: number };
  /** Optional limit / offset for paginated tables. */
  limit?: number;
  offset?: number;
}

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;

/** Pure: build an AuditFilter from URLSearchParams. */
export function parseFilters(sp: URLSearchParams): AuditFilter {
  const out: AuditFilter = {};

  const from = parseInt(sp.get('from') ?? '', 10);
  const to = parseInt(sp.get('to') ?? '', 10);
  if (Number.isFinite(from) || Number.isFinite(to)) {
    out.tsRange = {};
    if (Number.isFinite(from)) out.tsRange.from = from;
    if (Number.isFinite(to)) out.tsRange.to = to;
  }

  const origins = sp.getAll('origin').filter(Boolean);
  if (origins.length) out.origins = origins;

  const services = sp.getAll('service').filter(s => s === 'anthropic' || s === 'openai' || s === 'gemini') as AuditFilter['services'];
  if (services && services.length) out.services = services;

  const fingerprints = sp.getAll('fp').filter(Boolean);
  if (fingerprints.length) out.fingerprints = fingerprints;

  const kinds = sp.getAll('kind').filter(Boolean);
  if (kinds.length) out.kinds = kinds;

  const statusMin = parseInt(sp.get('status_min') ?? '', 10);
  const statusMax = parseInt(sp.get('status_max') ?? '', 10);
  if (Number.isFinite(statusMin) || Number.isFinite(statusMax)) {
    out.status = {};
    if (Number.isFinite(statusMin)) out.status.min = statusMin;
    if (Number.isFinite(statusMax)) out.status.max = statusMax;
  }

  const limit = parseInt(sp.get('limit') ?? '', 10);
  if (Number.isFinite(limit) && limit > 0) {
    out.limit = Math.min(limit, MAX_LIMIT);
  } else {
    out.limit = DEFAULT_LIMIT;
  }

  const offset = parseInt(sp.get('offset') ?? '', 10);
  if (Number.isFinite(offset) && offset >= 0) out.offset = offset;

  return out;
}

/** Pure: serialize back into URLSearchParams for filter-chip / paginate links. */
export function filterToSearchParams(f: AuditFilter): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.tsRange?.from !== undefined) sp.set('from', String(f.tsRange.from));
  if (f.tsRange?.to !== undefined) sp.set('to', String(f.tsRange.to));
  for (const o of f.origins ?? []) sp.append('origin', o);
  for (const s of f.services ?? []) sp.append('service', s);
  for (const fp of f.fingerprints ?? []) sp.append('fp', fp);
  for (const k of f.kinds ?? []) sp.append('kind', k);
  if (f.status?.min !== undefined) sp.set('status_min', String(f.status.min));
  if (f.status?.max !== undefined) sp.set('status_max', String(f.status.max));
  if (f.limit !== undefined && f.limit !== DEFAULT_LIMIT) sp.set('limit', String(f.limit));
  if (f.offset !== undefined && f.offset > 0) sp.set('offset', String(f.offset));
  return sp;
}

export const __consts = { MAX_LIMIT, DEFAULT_LIMIT };
