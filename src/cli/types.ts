// CLI daemon contract. The CLI is a thin client that talks to the local
// Moltypass daemon over Native Messaging. Everything the CLI needs is on
// this interface — no direct vault access, no direct filesystem access to
// the extension's chrome.storage.

export interface ToolCatalogEntry {
  /** Canonical CLI name — e.g. "hermes", "aider", "claude-code". */
  name: string;
  /** Env vars this tool reads. Injected by moltypass exec into the child. */
  envVars: readonly string[];
  /** Provider slugs to look up in the vault; first-match wins. */
  providerHints: readonly string[];
  /**
   * If true, the tool refuses to read env from parent process (some sandboxed
   * tools). Trigger the FIFO fallback in moltypass env --tool.
   */
  requiresManagedDotfile?: boolean;
}

/** Env resolution result from the daemon — never returned to the LLM. */
export interface ExecEnvResolution {
  env: Record<string, string>;
  grantIds: string[];
  providers: string[];
}

/** Minimal daemon interface the CLI depends on. */
export interface CliDaemon {
  /** True when the vault is unlocked and can serve keys. */
  unlocked(): Promise<boolean>;
  /**
   * Resolve which env vars to set for a tool + which vault labels to source
   * them from. Prompts Touch ID (via daemon UI) if the vault is locked.
   */
  resolveExecEnv(argv: string[], opts: { cwd: string; label?: string }): Promise<ExecEnvResolution>;
  /** Record the result of an exec run to the audit log. */
  recordExecResult(input: {
    grantIds: string[];
    exitCode: number;
    durationMs: number;
  }): Promise<void>;
  /** For moltypass-mcp diagnose + moltypass status. */
  ping(): Promise<{ version: string; unlocked: boolean }>;
}

/** Result of running a child process under `moltypass exec`. */
export interface ExecResult {
  exitCode: number;
  durationMs: number;
  redactedStdoutCount: number;
  redactedStderrCount: number;
  redactedProviders: string[];
}
