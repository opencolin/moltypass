// Minimal in-memory chrome.* surface for unit tests. Only what's used
// across the extension's background modules is mocked. Add more as
// modules under test reach for it.

type Listener = (...args: unknown[]) => void;

interface FakeStorageArea {
  get(keys: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  clear(): Promise<void>;
}

function makeStorageArea(): FakeStorageArea & { __data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    __data: data,
    async get(keys) {
      if (keys === null || keys === undefined) {
        return Object.fromEntries(data);
      }
      if (typeof keys === 'string') {
        return data.has(keys) ? { [keys]: data.get(keys) } : {};
      }
      if (Array.isArray(keys)) {
        const out: Record<string, unknown> = {};
        for (const k of keys) if (data.has(k)) out[k] = data.get(k);
        return out;
      }
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(keys)) {
        out[k] = data.has(k) ? data.get(k) : v;
      }
      return out;
    },
    async set(items) {
      for (const [k, v] of Object.entries(items)) data.set(k, v);
    },
    async remove(keys) {
      const arr = Array.isArray(keys) ? keys : [keys];
      for (const k of arr) data.delete(k);
    },
    async clear() {
      data.clear();
    },
  };
}

interface FakeAlarms {
  create(name: string, alarmInfo: { delayInMinutes?: number; periodInMinutes?: number; when?: number }): Promise<void>;
  clear(name: string): Promise<boolean>;
  get(name: string): Promise<{ name: string; scheduledTime: number; periodInMinutes?: number } | undefined>;
  onAlarm: { addListener(l: Listener): void; removeListener(l: Listener): void };
  __fire(name: string): void;
}

function makeAlarms(): FakeAlarms {
  const alarms = new Map<string, { name: string; scheduledTime: number; periodInMinutes?: number }>();
  const listeners = new Set<Listener>();
  return {
    async create(name, info) {
      alarms.set(name, {
        name,
        scheduledTime: Date.now() + (info.delayInMinutes ?? 0) * 60_000,
        periodInMinutes: info.periodInMinutes,
      });
    },
    async clear(name) {
      return alarms.delete(name);
    },
    async get(name) {
      return alarms.get(name);
    },
    onAlarm: {
      addListener: l => listeners.add(l),
      removeListener: l => listeners.delete(l),
    },
    __fire(name) {
      const alarm = alarms.get(name);
      if (!alarm) return;
      for (const l of listeners) l(alarm);
    },
  };
}

interface FakeRuntime {
  sendMessage(message: unknown): Promise<unknown>;
  onMessage: { addListener(l: (msg: unknown, sender: unknown, sendResponse: (r: unknown) => void) => boolean | void): void };
  __sender: unknown;
  __handlers: Set<(msg: unknown, sender: unknown, sendResponse: (r: unknown) => void) => boolean | void>;
}

function makeRuntime(): FakeRuntime {
  const handlers = new Set<(msg: unknown, sender: unknown, sendResponse: (r: unknown) => void) => boolean | void>();
  return {
    __sender: { origin: 'https://example.test', url: 'https://example.test/' },
    __handlers: handlers,
    onMessage: { addListener: h => handlers.add(h) },
    async sendMessage(message) {
      return new Promise<unknown>((resolve, reject) => {
        let resolved = false;
        for (const h of handlers) {
          const ret = h(message, this.__sender, (response) => {
            if (resolved) return;
            resolved = true;
            resolve(response);
          });
          if (ret !== true && !resolved) {
            // synchronous handler with no response
            resolved = true;
            resolve(undefined);
            return;
          }
        }
        // Time out after a tick if nobody answers — caller treats as undefined.
        queueMicrotask(() => {
          if (!resolved) reject(new Error('no handler responded'));
        });
      });
    },
  };
}

const local = makeStorageArea();
const session = makeStorageArea();
const managed = makeStorageArea();
const alarms = makeAlarms();
const runtime = makeRuntime();

(globalThis as any).chrome = {
  storage: { local, session, managed },
  alarms,
  runtime,
};

export function resetFakeChrome(): void {
  local.__data.clear();
  session.__data.clear();
  managed.__data.clear();
}

export const fakeChrome = { local, session, managed, alarms, runtime };
