import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const rootDir = resolve(import.meta.dirname, '..');
const distDir = resolve(rootDir, 'dist-print-agent');
const packageExe = resolve(distDir, 'YANLCPrintAgent', 'YANLCPrintAgent.exe');
const packageZip = resolve(distDir, 'YANLCPrintAgent.zip');
const installerExe = resolve(distDir, 'YANLCPrintAgentSetup.exe');
const installerConfig = resolve(rootDir, 'print-agent', 'installer', 'YANLCPrintAgent.iss');
const docsPath = resolve(rootDir, 'docs', 'print-agent-windows-installer-zh.md');

async function main() {
  const failures: string[] = [];

  await checkExists(packageExe, 'portable exe', failures);
  await checkExists(packageZip, 'portable zip', failures);
  await checkExists(installerExe, 'installer exe', failures);
  await checkExists(installerConfig, 'Inno Setup installer config', failures);
  await checkExists(docsPath, 'installer documentation', failures);

  await checkInstallerSize(failures);
  await checkNoSensitiveStrings(failures);
  await checkInstallerConfig(failures);

  if (failures.length > 0) {
    console.error('Print agent installer verification failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log('Print agent installer verification passed.');
}

async function checkExists(path: string, label: string, failures: string[]) {
  if (!existsSync(path)) failures.push(`Missing ${label}: ${path}`);
}

async function checkInstallerSize(failures: string[]) {
  if (!existsSync(installerExe)) return;
  const info = await stat(installerExe);
  if (info.size < 1024 * 1024) failures.push('Installer exe is unexpectedly small.');
}

async function checkNoSensitiveStrings(failures: string[]) {
  for (const path of [installerConfig, docsPath]) {
    if (!existsSync(path)) continue;
    const text = await readFile(path, 'utf8');
    if (/SUPABASE_SERVICE_ROLE_KEY/i.test(text)) failures.push(`${path} mentions SUPABASE_SERVICE_ROLE_KEY.`);
    if (/sk-[A-Za-z0-9_-]{20,}/.test(text)) failures.push(`${path} appears to contain a real API key.`);
  }

  if (existsSync(installerExe)) {
    const data = await readFile(installerExe);
    const digest = createHash('sha256').update(data).digest('hex');
    if (!/^[a-f0-9]{64}$/.test(digest)) failures.push('Installer checksum could not be calculated.');
  }
}

async function checkInstallerConfig(failures: string[]) {
  if (!existsSync(installerConfig)) return;
  const text = await readFile(installerConfig, 'utf8');
  const requiredSnippets = [
    'YANLCPrintAgent.exe',
    'install-mode.json',
    'YANLC 打印助手',
    'YANLC 打印助手设置',
    '--setup-ui',
    '--test-print',
    '--list-printers',
    '--uninstall-startup',
    'UninstallRun',
  ];

  for (const snippet of requiredSnippets) {
    if (!text.includes(snippet)) failures.push(`Installer config missing: ${snippet}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
