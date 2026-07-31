import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable, Writable } from 'node:stream';
import { runExec } from '../src/cli/runner';
import { createFakeCliDaemon } from '../src/cli/fixtures/fake-daemon';
import { lookupTool } from '../src/cli/catalog';
import { REDACTION_MARKER } from '../src/mcp/redact';

/**
 * Fake child process that emulates the surface `runner` uses:
 *   .stdout / .stderr — Readable
 *   .once('error' | 'close', cb)
 *   .kill(signal)
 * Backed by our own EventEmitter so tests fully control timing.
 */
function fakeChild(opts: {
  stdoutChunks?: string[];
  stderrChunks?: string[];
  exitCode?: number;
  errorAfterMs?: number;
} = {}) {
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });
  const ee = new EventEmitter();
  let killed = false;

  const child: any = Object.assign(ee, {
    stdout,
    stderr,
    kill(_sig: NodeJS.Signals) {
      killed = true;
      queueMicrotask(() => {
        stdout.push(null);
        stderr.push(null);
        ee.emit('close', null);
      });
    },
    get killed() { return killed; },
  });

  // Drive the streams + close from a microtask so listeners are attached first.
  queueMicrotask(async () => {
    for (const chunk of opts.stdoutChunks ?? []) {
      stdout.push(Buffer.from(chunk, 'utf8'));
      await new Promise(r => setImmediate(r));
    }
    for (const chunk of opts.stderrChunks ?? []) {
      stderr.push(Buffer.from(chunk, 'utf8'));
      await new Promise(r => setImmediate(r));
    }
    stdout.push(null);
    stderr.push(null);
    if (opts.errorAfterMs !== undefined) {
      setTimeout(() => ee.emit('error', new Error('spawn failed')), opts.errorAfterMs);
    } else {
      ee.emit('close', opts.exitCode ?? 0);
    }
  });

  return child;
}

function makeStreams() {
  const stdoutBuf: string[] = [];
  const stderrBuf: string[] = [];
  const stdout = new Writable({
    write(chunk, _enc, cb) { stdoutBuf.push(chunk.toString('utf8')); cb(); },
  });
  const stderr = new Writable({
    write(chunk, _enc, cb) { stderrBuf.push(chunk.toString('utf8')); cb(); },
  });
  return { stdout, stderr, get stdoutText() { return stdoutBuf.join(''); }, get stderrText() { return stderrBuf.join(''); } };
}

describe('runExec', () => {
  it('spawns the child, injects env, records exit=0', async () => {
    const daemon = createFakeCliDaemon({
      envByTool: { hermes: { NEBIUS_API_KEY: 'sk-fake' } },
    });
    let seen: { command: string; args: string[]; env?: Record<string, string> } | null = null;
    const spawnFn: any = (cmd: string, args: string[], opts: any) => {
      seen = { command: cmd, args, env: opts.env };
      return fakeChild({ stdoutChunks: ['ok\n'], exitCode: 0 });
    };
    const streams = makeStreams();
    const result = await runExec({
      argv: ['hermes', 'ask', 'hi'],
      cwd: '/tmp/proj',
      daemon,
      tool: lookupTool('hermes'),
      streams,
      spawnFn,
    });
    expect(result.exitCode).toBe(0);
    expect(seen).not.toBeNull();
    expect(seen!.command).toBe('hermes');
    expect(seen!.args).toEqual(['ask', 'hi']);
    expect(seen!.env?.NEBIUS_API_KEY).toBe('sk-fake');
    expect(streams.stdoutText).toBe('ok\n');
    expect(daemon.calls.resolveExecEnv).toHaveLength(1);
    expect(daemon.calls.recordExecResult).toHaveLength(1);
    expect(daemon.calls.recordExecResult[0].exitCode).toBe(0);
  });

  it('propagates non-zero exit codes', async () => {
    const daemon = createFakeCliDaemon();
    const spawnFn: any = () => fakeChild({ exitCode: 42 });
    const result = await runExec({
      argv: ['hermes'],
      cwd: '/tmp',
      daemon,
      tool: lookupTool('hermes'),
      streams: makeStreams(),
      spawnFn,
    });
    expect(result.exitCode).toBe(42);
    expect(daemon.calls.recordExecResult[0].exitCode).toBe(42);
  });

  it('redacts key-shaped strings in stdout before writing to parent', async () => {
    const daemon = createFakeCliDaemon();
    const fakeKey = 'sk-ant-' + 'A'.repeat(40);
    const padding = 'x'.repeat(300);
    const spawnFn: any = () =>
      fakeChild({
        stdoutChunks: [padding, fakeKey, padding],
        exitCode: 0,
      });
    const streams = makeStreams();
    const result = await runExec({
      argv: ['aider', 'x.py'],
      cwd: '/tmp',
      daemon,
      tool: lookupTool('aider'),
      streams,
      spawnFn,
    });
    expect(result.exitCode).toBe(0);
    expect(streams.stdoutText).not.toContain(fakeKey);
    expect(streams.stdoutText).toContain(REDACTION_MARKER);
    expect(result.redactedStdoutCount).toBe(1);
    expect(result.redactedProviders).toEqual(['anthropic']);
  });

  it('redacts key-shaped strings in stderr independently', async () => {
    const daemon = createFakeCliDaemon();
    const fakeKey = 'AIza' + 'C'.repeat(35);
    const padding = 'y'.repeat(300);
    const spawnFn: any = () =>
      fakeChild({
        stderrChunks: [padding, fakeKey, padding],
        exitCode: 1,
      });
    const streams = makeStreams();
    const result = await runExec({
      argv: ['pytest'],
      cwd: '/tmp',
      daemon,
      tool: lookupTool('pytest'),
      streams,
      spawnFn,
    });
    expect(result.exitCode).toBe(1);
    expect(streams.stderrText).not.toContain(fakeKey);
    expect(streams.stderrText).toContain(REDACTION_MARKER);
    expect(result.redactedStderrCount).toBe(1);
    expect(result.redactedProviders).toContain('gemini');
  });

  it('resolveExecEnv called with argv + cwd + label', async () => {
    const daemon = createFakeCliDaemon();
    const spawnFn: any = () => fakeChild({ exitCode: 0 });
    await runExec({
      argv: ['hermes', 'greet'],
      cwd: '/proj',
      daemon,
      tool: lookupTool('hermes'),
      label: 'work',
      streams: makeStreams(),
      spawnFn,
    });
    expect(daemon.calls.resolveExecEnv[0]).toMatchObject({
      argv: ['hermes', 'greet'],
      cwd: '/proj',
      label: 'work',
    });
  });

  it('recordExecResult includes grant ids from resolution', async () => {
    const daemon = createFakeCliDaemon({
      grantIdsByTool: { hermes: ['g-1', 'g-2'] },
    });
    const spawnFn: any = () => fakeChild({ exitCode: 0 });
    await runExec({
      argv: ['hermes'],
      cwd: '/',
      daemon,
      tool: lookupTool('hermes'),
      streams: makeStreams(),
      spawnFn,
    });
    expect(daemon.calls.recordExecResult[0].grantIds).toEqual(['g-1', 'g-2']);
  });

  it('rejects when spawn emits error', async () => {
    const daemon = createFakeCliDaemon();
    const spawnFn: any = () => fakeChild({ errorAfterMs: 5 });
    await expect(
      runExec({
        argv: ['nope'],
        cwd: '/',
        daemon,
        tool: lookupTool('nope'),
        streams: makeStreams(),
        spawnFn,
      }),
    ).rejects.toThrow(/spawn failed/);
  });

  it('kills the child on timeout and returns 124', async () => {
    const daemon = createFakeCliDaemon();
    // A child that never emits close on its own; kill() will drive close.
    const spawnFn: any = () => fakeChild({ stdoutChunks: [] });
    // Override to make it NEVER close naturally.
    const stall: any = (cmd: string, args: string[], _opts: any) => {
      const ee = new EventEmitter();
      const stdout = new Readable({ read() {} });
      const stderr = new Readable({ read() {} });
      let killed = false;
      const c: any = Object.assign(ee, {
        stdout, stderr,
        kill() {
          killed = true;
          queueMicrotask(() => {
            stdout.push(null); stderr.push(null); ee.emit('close', null);
          });
        },
        get killed() { return killed; },
      });
      return c;
    };
    void spawnFn;
    const result = await runExec({
      argv: ['forever'],
      cwd: '/',
      daemon,
      tool: lookupTool('forever'),
      streams: makeStreams(),
      spawnFn: stall,
      timeoutMs: 20,
    });
    expect(result.exitCode).toBe(124);
  });

  it('throws on empty argv', async () => {
    await expect(
      runExec({
        argv: [],
        cwd: '/',
        daemon: createFakeCliDaemon(),
        tool: lookupTool(''),
        streams: makeStreams(),
        spawnFn: (() => fakeChild()) as any,
      }),
    ).rejects.toThrow(/empty argv/);
  });
});
