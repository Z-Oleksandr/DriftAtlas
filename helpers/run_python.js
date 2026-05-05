import { spawnSync } from 'node:child_process';
import path from 'node:path';

const isWin = process.platform === 'win32';
const python = isWin
  ? path.join('preprocessing', '.venv', 'Scripts', 'python.exe')
  : path.join('preprocessing', '.venv', 'bin', 'python');

const result = spawnSync(python, ['-u', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, PYTHONUNBUFFERED: '1' },
});
process.exit(result.status ?? 1);
