import fs from 'node:fs';

const isWin = process.platform === 'win32';
const pythonPath = isWin
  ? 'preprocessing/.venv/Scripts/python.exe'
  : 'preprocessing/.venv/bin/python';

if (!fs.existsSync(pythonPath)) {
  const activate = isWin ? '.venv\\Scripts\\pip' : '.venv/bin/pip';
  console.error(
    `Venv not found. Run:\n  cd preprocessing && python -m venv .venv && ${activate} install -r requirements.txt`,
  );
  process.exit(1);
}

console.log(pythonPath);
