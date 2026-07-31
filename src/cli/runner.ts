// Core exec runner. Spawns a child process with daemon-provided env vars
// injected, streams stdout/stderr through with buffered post-redaction, and
// returns the exit code + redaction counters.
//
// SAFETY:
// - Uses `spawn` with an argv array (never a shell string). No interpolation.
// - Env vars set on the CHILD only — never mutates process.env of the CLI.
// - stdout/stderr are streamed to the parent's stdout/stderr AS THEY ARRIVE
//   with per-line redaction, so long-running commands don't buffer forever.
// - On exit, the redaction counts are returned; no cleanup of env is needed
//   because the child process is dead and its env dies with it.

import { spawn } from 'node:child_process';
import { redactStream } from './redact';
import type { CliDaemon, ExecResult, ToolCatalogEntry } from './types';

export interface RunnerOptions {
  argv: string[];
  cwd: string;
  daemon: CliDaemon;
  tool: ToolCatalogEntry;
  label?: string;
  /** Test-only: override streams so the runner is testable without stdio. */
  streams?: {
    stdout: NodeJS.WritableStream;
    stderr: NodeJS.WritableStream;
  };
  /** Test-only: kill after this many ms. */
  timeoutMs?: number;
  /** Test-only: dependency-inject `spawn` so tests don't shell out. */
  spawnFn?: typeof spawn;
}

/**
 * Run one exec. Returns after the child exits.
 *
 * Flow:
 *   1. daemon.resolveExecEnv(argv, {cwd, label}) — prompts Touch ID if locked
 *   2. spawn(argv[0], argv.slice(1), {env: {...process.env, ...injected}})
 *   3. Pipe child stdout/stderr through redactStream() into parent streams
 *   4. On close: daemon.recordExecResult({grantIds, exitCode, durationMs})
 *   5. Return ExecResult with redaction counters
 */
export async function runExec(opts: RunnerOptions): Promise<ExecResult> {
  const start = performance.now();
  const resolution = await opts.daemon.resolveExecEnv(opts.argv, {
    cwd: opts.cwd,
    label: opts.label,
  });

  const [command, ...args] = opts.argv;
  if (!command) throw new Error('empty argv');

  const stdoutOut = opts.streams?.stdout ?? process.stdout;
  const stderrOut = opts.streams?.stderr ?? process.stderr;

  const spawner = opts.spawnFn ?? spawn;
  const child = spawner(command, args, {
    cwd: opts.cwd,
    env: { ...process.env, ...resolution.env },
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  const stdoutRedactor = redactStream();
  const stderrRedactor = redactStream();

  child.stdout?.on('data', (chunk: Buffer) => {
    const { text, redactionCount, providers } = stdoutRedactor.push(chunk.toString('utf8'));
    if (text.length) stdoutOut.write(text);
    void redactionCount;
    void providers;
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    const { text, redactionCount, providers } = stderrRedactor.push(chunk.toString('utf8'));
    if (text.length) stderrOut.write(text);
    void redactionCount;
    void providers;
  });

  let timedOut = false;
  const timer =
    opts.timeoutMs !== undefined
      ? setTimeout(() => {
          timedOut = true;
          child.kill('SIGKILL');
        }, opts.timeoutMs)
      : null;

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', err => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.once('close', code => {
      if (timer) clearTimeout(timer);
      resolve(timedOut ? 124 : (code ?? 0));
    });
  });

  // Flush any buffered tail.
  const stdoutTail = stdoutRedactor.flush();
  const stderrTail = stderrRedactor.flush();
  if (stdoutTail.text.length) stdoutOut.write(stdoutTail.text);
  if (stderrTail.text.length) stderrOut.write(stderrTail.text);

  const durationMs = Math.round(performance.now() - start);
  const finalStdout = stdoutRedactor.totals();
  const finalStderr = stderrRedactor.totals();

  await opts.daemon.recordExecResult({
    grantIds: resolution.grantIds,
    exitCode,
    durationMs,
  });

  return {
    exitCode,
    durationMs,
    redactedStdoutCount: finalStdout.count,
    redactedStderrCount: finalStderr.count,
    redactedProviders: [...new Set([...finalStdout.providers, ...finalStderr.providers])],
  };
}
