// Wires fake-indexeddb's auto-install into the test environment and
// exposes a per-test reset so suites don't bleed state.

import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

export function resetFakeIdb(): void {
  // Replace the global factory with a fresh one — all databases are GC'd.
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
}
