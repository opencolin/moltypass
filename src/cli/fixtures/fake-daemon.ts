// In-memory fake CliDaemon for tests. Configurable per-test via seed.

import type { CliDaemon, ExecEnvResolution, ToolCatalogEntry } from '../types';

export interface FakeCliDaemonSeed {
  unlocked?: boolean;
  /** Env vars to return for any resolveExecEnv call, keyed by tool basename. */
  envByTool?: Record<string, Record<string, string>>;
  /** Grant ids to return for any resolveExecEnv call, keyed by tool basename. */
  grantIdsByTool?: Record<string, string[]>;
  /** Providers to report on the resolution. */
  providersByTool?: Record<string, string[]>;
}

export interface FakeCliDaemonHandle extends CliDaemon {
  calls: {
    unlocked: number;
    resolveExecEnv: Array<{ argv: string[]; cwd: string; label?: string }>;
    recordExecResult: Array<{ grantIds: string[]; exitCode: number; durationMs: number }>;
    ping: number;
  };
}

export function createFakeCliDaemon(seed: FakeCliDaemonSeed = {}): FakeCliDaemonHandle {
  const state = {
    unlocked: seed.unlocked ?? true,
    envByTool: seed.envByTool ?? {},
    grantIdsByTool: seed.grantIdsByTool ?? {},
    providersByTool: seed.providersByTool ?? {},
  };
  const handle: FakeCliDaemonHandle = {
    calls: { unlocked: 0, resolveExecEnv: [], recordExecResult: [], ping: 0 },
    async unlocked() {
      handle.calls.unlocked++;
      return state.unlocked;
    },
    async resolveExecEnv(argv, opts): Promise<ExecEnvResolution> {
      handle.calls.resolveExecEnv.push({ argv: argv.slice(), cwd: opts.cwd, label: opts.label });
      const basename = (argv[0] ?? '').split('/').pop() ?? argv[0] ?? '';
      return {
        env: state.envByTool[basename] ?? {},
        grantIds: state.grantIdsByTool[basename] ?? [`fake-grant-${basename}`],
        providers: state.providersByTool[basename] ?? ['anthropic'],
      };
    },
    async recordExecResult(input) {
      handle.calls.recordExecResult.push(input);
    },
    async ping() {
      handle.calls.ping++;
      return { version: 'fake-0.0.1', unlocked: state.unlocked };
    },
  };
  return handle;
}
