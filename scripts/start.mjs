import { spawn } from 'node:child_process';
import { cpSync, existsSync } from 'node:fs';
// Run a production build on loopback by default. Public serving belongs on the external host.
const args = process.argv.slice(2);
const portFlag = args.indexOf('--port');
const port = portFlag >= 0 ? args[portFlag + 1] : process.env.PORT || '3000';
if (!existsSync('.next/standalone/server.js')) throw new Error('Run npm run build first.');
cpSync('.next/static', '.next/standalone/.next/static', { recursive: true });
cpSync('public', '.next/standalone/public', { recursive: true });
const child = spawn(process.execPath, ['.next/standalone/server.js'], { stdio: 'inherit', windowsHide: true,
  env: { ...process.env, HOSTNAME: process.env.HOSTNAME || '127.0.0.1', PORT: port } });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', code => process.exit(code ?? 1));
