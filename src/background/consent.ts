// Opens a separate popup window per consent request (MetaMask pattern).
// Pending state is persisted because the SW can be killed between the
// open-window call and the user clicking Allow.

import type { ConsentRequest, ConsentResolution } from '../shared/types';

const STORAGE_KEY = 'moltypass.pendingConsents';

interface PendingRecord {
  id: string;
  request: ConsentRequest;
  createdAt: number;
  windowId?: number;
}

interface ResolverMap {
  [id: string]: (resolution: ConsentResolution) => void;
}

// In-memory resolvers — recreated on SW wake. If a resolver is missing
// when the consent UI replies, we still persist the resolution and the
// requesting message handler will see it via a follow-up read.
const resolvers: ResolverMap = {};

export async function askForConsent(request: ConsentRequest): Promise<ConsentResolution> {
  const id = crypto.randomUUID();
  const url = chrome.runtime.getURL(`consent.html?id=${encodeURIComponent(id)}`);
  const win = await chrome.windows.create({
    url,
    type: 'popup',
    width: 440,
    height: 580,
    focused: true,
  });

  const record: PendingRecord = { id, request, createdAt: Date.now(), windowId: win.id };
  await savePending(record);

  return new Promise<ConsentResolution>(resolve => {
    resolvers[id] = resolve;

    const onClosed = (closedId: number) => {
      if (closedId !== win.id) return;
      chrome.windows.onRemoved.removeListener(onClosed);
      // If user closed without choosing, treat as denial.
      void clearPending(id);
      if (resolvers[id]) {
        resolvers[id]({ granted: false });
        delete resolvers[id];
      }
    };
    chrome.windows.onRemoved.addListener(onClosed);
  });
}

export async function getPendingRequest(id: string): Promise<ConsentRequest | null> {
  const all = await loadAllPending();
  return all.find(r => r.id === id)?.request ?? null;
}

export async function resolveConsent(id: string, resolution: ConsentResolution): Promise<void> {
  await clearPending(id);
  const resolver = resolvers[id];
  if (resolver) {
    resolver(resolution);
    delete resolvers[id];
  }
}

async function savePending(record: PendingRecord): Promise<void> {
  const all = await loadAllPending();
  all.push(record);
  await chrome.storage.local.set({ [STORAGE_KEY]: all });
}

async function clearPending(id: string): Promise<void> {
  const all = await loadAllPending();
  await chrome.storage.local.set({ [STORAGE_KEY]: all.filter(r => r.id !== id) });
}

async function loadAllPending(): Promise<PendingRecord[]> {
  const res = await chrome.storage.local.get(STORAGE_KEY);
  return (res[STORAGE_KEY] as PendingRecord[] | undefined) ?? [];
}
