import { describe, it, expect } from 'vitest';
import { parseArgv } from '../src/cli/argv';

describe('parseArgv — help + version', () => {
  it('empty argv → help', () => {
    expect(parseArgv([])).toEqual({ kind: 'help' });
  });
  it('--help / -h / help → help', () => {
    expect(parseArgv(['--help'])).toEqual({ kind: 'help' });
    expect(parseArgv(['-h'])).toEqual({ kind: 'help' });
    expect(parseArgv(['help'])).toEqual({ kind: 'help' });
  });
  it('help exec → help with topic', () => {
    expect(parseArgv(['help', 'exec'])).toEqual({ kind: 'help', topic: 'exec' });
  });
  it('--version / -v / version → version', () => {
    expect(parseArgv(['--version'])).toEqual({ kind: 'version' });
    expect(parseArgv(['-v'])).toEqual({ kind: 'version' });
    expect(parseArgv(['version'])).toEqual({ kind: 'version' });
  });
});

describe('parseArgv — exec', () => {
  it('exec <cmd> args', () => {
    const r = parseArgv(['exec', 'hermes', 'greet', '--verbose']);
    expect(r).toEqual({ kind: 'exec', argv: ['hermes', 'greet', '--verbose'] });
  });
  it('exec with --label', () => {
    const r = parseArgv(['exec', '--label', 'work', 'hermes']);
    expect(r).toEqual({ kind: 'exec', argv: ['hermes'], label: 'work' });
  });
  it('exec with -l', () => {
    const r = parseArgv(['exec', '-l', 'personal', 'aider', 'x.py']);
    expect(r).toMatchObject({ kind: 'exec', argv: ['aider', 'x.py'], label: 'personal' });
  });
  it('exec with --label=value', () => {
    const r = parseArgv(['exec', '--label=work', 'hermes']);
    expect(r).toMatchObject({ kind: 'exec', label: 'work' });
  });
  it('exec with --strict', () => {
    const r = parseArgv(['exec', '--strict', 'hermes']);
    expect(r).toMatchObject({ kind: 'exec', strict: true });
  });
  it('exec with -- separator captures child flags literally', () => {
    // Without --, our args would try to interpret --label as an exec flag.
    const r = parseArgv(['exec', '--', 'hermes', '--label', 'value']);
    expect(r).toEqual({ kind: 'exec', argv: ['hermes', '--label', 'value'] });
  });
  it('exec without a command → error', () => {
    const r = parseArgv(['exec']);
    expect(r).toEqual({ kind: 'error', message: 'exec requires a command' });
  });
  it('exec --label without value → error', () => {
    const r = parseArgv(['exec', '--label']);
    expect(r).toMatchObject({ kind: 'error' });
  });
  it('flags between label and cmd', () => {
    const r = parseArgv(['exec', '--label', 'x', '--strict', 'hermes', 'arg']);
    expect(r).toMatchObject({
      kind: 'exec',
      argv: ['hermes', 'arg'],
      label: 'x',
      strict: true,
    });
  });
});

describe('parseArgv — hook', () => {
  it('hook with no args', () => {
    expect(parseArgv(['hook'])).toEqual({ kind: 'hook' });
  });
  it('hook --tool cursor', () => {
    expect(parseArgv(['hook', '--tool', 'cursor'])).toEqual({ kind: 'hook', tool: 'cursor' });
  });
  it('hook --tool=cursor', () => {
    expect(parseArgv(['hook', '--tool=cursor'])).toEqual({ kind: 'hook', tool: 'cursor' });
  });
  it('hook --provider anthropic', () => {
    expect(parseArgv(['hook', '--provider', 'anthropic'])).toEqual({
      kind: 'hook',
      provider: 'anthropic',
    });
  });
  it('hook with unknown arg → error', () => {
    expect(parseArgv(['hook', '--xyz'])).toMatchObject({ kind: 'error' });
  });
});

describe('parseArgv — env', () => {
  it('env --tool hermes', () => {
    expect(parseArgv(['env', '--tool', 'hermes'])).toEqual({ kind: 'env', tool: 'hermes' });
  });
  it('env --tool hermes --write ~/.hermes/.env', () => {
    expect(parseArgv(['env', '--tool', 'hermes', '--write', '~/.hermes/.env'])).toEqual({
      kind: 'env',
      tool: 'hermes',
      write: '~/.hermes/.env',
    });
  });
  it('env without --tool → error', () => {
    expect(parseArgv(['env'])).toMatchObject({ kind: 'error' });
  });
});

describe('parseArgv — status / diagnose', () => {
  it('status', () => {
    expect(parseArgv(['status'])).toEqual({ kind: 'status' });
  });
  it('diagnose', () => {
    expect(parseArgv(['diagnose'])).toEqual({ kind: 'diagnose' });
  });
});

describe('parseArgv — unknown', () => {
  it('unknown subcommand → error', () => {
    expect(parseArgv(['nope'])).toMatchObject({ kind: 'error' });
  });
});
