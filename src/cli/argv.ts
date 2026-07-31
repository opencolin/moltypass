// argv parser for the `moltypass` CLI. Deliberately handwritten — no
// third-party dep. Subcommands: exec, hook, env, status, diagnose, help.

export type CliCommand =
  | { kind: 'exec'; argv: string[]; label?: string; strict?: boolean }
  | { kind: 'hook'; tool?: string; provider?: string }
  | { kind: 'env'; tool: string; write?: string }
  | { kind: 'status' }
  | { kind: 'diagnose' }
  | { kind: 'help'; topic?: string }
  | { kind: 'version' }
  | { kind: 'error'; message: string };

/**
 * Parse CLI argv (excluding `argv[0]` node + `argv[1]` bin path). Never
 * throws; unknown / malformed input returns { kind: 'error' }.
 */
export function parseArgv(rawArgv: string[]): CliCommand {
  const [head, ...rest] = rawArgv;
  if (!head || head === '--help' || head === '-h' || head === 'help') {
    return { kind: 'help', topic: rest[0] };
  }
  if (head === '--version' || head === '-v' || head === 'version') {
    return { kind: 'version' };
  }
  switch (head) {
    case 'exec':
      return parseExec(rest);
    case 'hook':
      return parseHook(rest);
    case 'env':
      return parseEnv(rest);
    case 'status':
      return { kind: 'status' };
    case 'diagnose':
      return { kind: 'diagnose' };
    default:
      return { kind: 'error', message: `unknown subcommand: ${head}` };
  }
}

function parseExec(args: string[]): CliCommand {
  const out: Extract<CliCommand, { kind: 'exec' }> = { kind: 'exec', argv: [] };
  const inner: string[] = [];
  let separatorSeen = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (separatorSeen) {
      inner.push(a);
      continue;
    }
    if (a === '--') {
      separatorSeen = true;
      continue;
    }
    if (a === '--label' || a === '-l') {
      const value = args[++i];
      if (!value) return { kind: 'error', message: '--label requires a value' };
      out.label = value;
      continue;
    }
    if (a.startsWith('--label=')) {
      out.label = a.slice('--label='.length);
      continue;
    }
    if (a === '--strict') {
      out.strict = true;
      continue;
    }
    // First non-flag token — everything from here is the child command.
    inner.push(a);
    for (let j = i + 1; j < args.length; j++) inner.push(args[j]);
    break;
  }
  if (inner.length === 0) return { kind: 'error', message: 'exec requires a command' };
  out.argv = inner;
  return out;
}

function parseHook(args: string[]): CliCommand {
  const out: Extract<CliCommand, { kind: 'hook' }> = { kind: 'hook' };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--tool' || a === '-t') {
      const value = args[++i];
      if (!value) return { kind: 'error', message: '--tool requires a value' };
      out.tool = value;
    } else if (a.startsWith('--tool=')) {
      out.tool = a.slice('--tool='.length);
    } else if (a === '--provider' || a === '-p') {
      const value = args[++i];
      if (!value) return { kind: 'error', message: '--provider requires a value' };
      out.provider = value;
    } else if (a.startsWith('--provider=')) {
      out.provider = a.slice('--provider='.length);
    } else {
      return { kind: 'error', message: `unknown hook arg: ${a}` };
    }
  }
  return out;
}

function parseEnv(args: string[]): CliCommand {
  const out: Partial<Extract<CliCommand, { kind: 'env' }>> = { kind: 'env' };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--tool' || a === '-t') {
      const value = args[++i];
      if (!value) return { kind: 'error', message: '--tool requires a value' };
      out.tool = value;
    } else if (a.startsWith('--tool=')) {
      out.tool = a.slice('--tool='.length);
    } else if (a === '--write' || a === '-w') {
      const value = args[++i];
      if (!value) return { kind: 'error', message: '--write requires a path' };
      out.write = value;
    } else if (a.startsWith('--write=')) {
      out.write = a.slice('--write='.length);
    } else {
      return { kind: 'error', message: `unknown env arg: ${a}` };
    }
  }
  if (!out.tool) return { kind: 'error', message: 'env requires --tool <name>' };
  return { kind: 'env', tool: out.tool, write: out.write };
}
