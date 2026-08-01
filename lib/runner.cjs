// Spawn a child with an injected env + stream stdout/stderr through the
// redactor. Uses `spawn` with an argv array (no shell interpolation) and
// sets env on the CHILD only.

'use strict';

const { spawn } = require('node:child_process');
const { redactStream } = require('./redact.cjs');

async function runExec(argv, opts) {
  opts = opts || {};
  const [command, ...args] = argv;
  if (!command) throw new Error('empty argv');

  const child = spawn(command, args, {
    cwd: opts.cwd,
    env: Object.assign({}, process.env, opts.env || {}),
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  const stdoutOut = opts.stdout || process.stdout;
  const stderrOut = opts.stderr || process.stderr;
  const stdoutRedact = redactStream();
  const stderrRedact = redactStream();

  child.stdout && child.stdout.on('data', (chunk) => {
    const r = stdoutRedact.push(chunk.toString('utf8'));
    if (r.text.length) stdoutOut.write(r.text);
  });
  child.stderr && child.stderr.on('data', (chunk) => {
    const r = stderrRedact.push(chunk.toString('utf8'));
    if (r.text.length) stderrOut.write(r.text);
  });

  const start = Date.now();
  let timedOut = false;
  const timer = opts.timeoutMs
    ? setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, opts.timeoutMs)
    : null;

  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', (err) => { if (timer) clearTimeout(timer); reject(err); });
    child.once('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve(timedOut ? 124 : (code == null ? 0 : code));
    });
  });

  const tail1 = stdoutRedact.flush();
  const tail2 = stderrRedact.flush();
  if (tail1.text.length) stdoutOut.write(tail1.text);
  if (tail2.text.length) stderrOut.write(tail2.text);

  return {
    exitCode,
    durationMs: Date.now() - start,
    redactedStdout: stdoutRedact.totals(),
    redactedStderr: stderrRedact.totals(),
  };
}

module.exports = { runExec };
