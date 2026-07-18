// Per-item mutation history. Reads from the existing IndexedDB audit log
// filtered to the item-mutation event kinds. No new storage — just a query
// facade so item detail UI + MCP `item_history` tool have a clean read path.

import type { AuditEvent } from '../shared/audit-types';
import { ITEM_MUTATION_KINDS } from '../shared/audit-types';
import { query } from './audit-db';

export interface ItemHistoryEvent {
  ts: number;
  kind: AuditEvent['kind'];
  actor: AuditEvent['source'];
  meta: Record<string, string | number>;
}

export interface ItemHistoryOptions {
  /** Cap the number of events returned. Default 200. */
  limit?: number;
  /** Opaque cursor from a previous page's `nextCursor`. */
  cursor?: string;
  /** Return only events at or after this ms epoch. */
  since?: number;
}

export interface ItemHistoryPage {
  events: ItemHistoryEvent[];
  nextCursor: string | null;
}

/**
 * Return the mutation history for a single vault item, newest first.
 * Only ITEM_MUTATION_KINDS events are returned; proxy/reveal/leak events
 * for the same keyId are intentionally excluded — those belong to the
 * call-log UI, not the item detail.
 */
export async function itemHistory(
  keyId: string,
  options: ItemHistoryOptions = {},
): Promise<ItemHistoryPage> {
  const result = await query(
    {
      keyIds: [keyId],
      kinds: [...ITEM_MUTATION_KINDS],
      tsRange: options.since !== undefined ? { from: options.since } : undefined,
    },
    {
      limit: options.limit ?? 200,
      order: 'desc',
      cursor: options.cursor,
    },
  );
  return {
    events: result.records.map(e => ({
      ts: e.ts,
      kind: e.kind,
      actor: e.source,
      meta: e.meta ?? {},
    })),
    nextCursor: result.nextCursor,
  };
}
