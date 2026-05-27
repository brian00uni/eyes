import { spawn } from 'node:child_process';

const processes = [
  {
    name: 'api',
    command: 'yarn',
    args: ['--cwd', 'server', 'dev'],
  },
  {
    name: 'web',
    command: 'yarn',
    args: ['--cwd', 'client', 'dev'],
  },
];

let shuttingDown = false;

const children = processes.map(({ name, command, args }) => {
  const child = spawn(command, args, {
    stdio: ['inherit', 'pipe', 'pipe'],
    env: process.env,
  });

  child.stdout.on('data', (chunk) => writePrefixed(name, chunk));
  child.stderr.on('data', (chunk) => writePrefixed(name, chunk));

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.error(`[${name}] exited with ${signal || code}`);
    shutdown(code || 1);
  });

  return child;
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

function writePrefixed(name, chunk) {
  const lines = chunk.toString().split(/\r?\n/);
  for (const line of lines) {
    if (line) console.log(`[${name}] ${line}`);
  }
}

function shutdown(code) {
  shuttingDown = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 150);
}
