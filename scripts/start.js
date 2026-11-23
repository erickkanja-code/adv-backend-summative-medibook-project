// `npm start` launches the web server and the worker as two SEPARATE Node
// processes (they share nothing in memory, only MySQL and Redis).
// They can also be run individually: `npm run start:web` / `npm run start:worker`.
const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PROCESSES = [
  { name: 'web', script: 'src/server.js' },
  { name: 'worker', script: 'src/worker.js' },
];

const children = PROCESSES.map(({ name, script }) => {
  const child = spawn(process.execPath, [path.join(ROOT, script)], { cwd: ROOT, stdio: 'inherit', env: process.env });
  child.on('exit', (code, signal) => {
    console.log(`[launcher] ${name} process exited (${signal || `code ${code}`})`);
    if (children.every((c) => c.exitCode !== null || c.signalCode !== null)) {
      process.exit(code ?? 0);
    }
  });
  return child;
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    children.forEach((child) => {
      if (child.exitCode === null) child.kill(signal);
    });
  });
}
