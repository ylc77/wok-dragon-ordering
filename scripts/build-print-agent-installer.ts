import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const rootDir = resolve(import.meta.dirname, '..');
const distDir = resolve(rootDir, 'dist-print-agent');
const packageDir = resolve(distDir, 'YANLCPrintAgent');
const installerConfig = resolve(rootDir, 'print-agent', 'installer', 'YANLCPrintAgent.iss');
const outputExe = resolve(distDir, 'YANLCPrintAgentSetup.exe');
const isccPath = resolve(rootDir, 'node_modules', 'innosetup-compiler', 'bin', 'ISCC.exe');

async function main() {
  await execFileAsync('cmd.exe', ['/c', 'npm', 'run', 'build:print-agent-package'], {
    cwd: rootDir,
    windowsHide: true,
    timeout: 240000,
  });

  await mkdir(distDir, { recursive: true });
  const installModePath = resolve(packageDir, 'install-mode.json');
  await writeFile(installModePath, '{}\n', 'utf8');

  try {
    await execFileAsync(isccPath, [
      `/DSourceDir=${packageDir}`,
      `/DOutputDir=${distDir}`,
      installerConfig,
    ], {
      cwd: rootDir,
      windowsHide: true,
      timeout: 120000,
    });
  } finally {
    await rm(installModePath, { force: true });
  }

  console.log(`Windows installer generated: ${outputExe}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
