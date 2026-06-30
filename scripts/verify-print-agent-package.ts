import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const rootDir = resolve(import.meta.dirname, '..');
const distDir = resolve(rootDir, 'dist-print-agent');
const packageDir = resolve(distDir, 'YANLCPrintAgent');
const zipPath = resolve(distDir, 'YANLCPrintAgent.zip');
const checksumPath = `${zipPath}.sha256.txt`;

const requiredFiles = [
  'YANLCPrintAgent.exe',
  'setup.cmd',
  'start.cmd',
  'test-print.cmd',
  'list-printers.cmd',
  'install-startup.cmd',
  'uninstall-startup.cmd',
  'config.example.json',
  'README.txt',
];

const forbiddenFiles = [
  'config.json',
  '.env',
  '.env.local',
  'print-agent.log',
];

async function main() {
  const failures: string[] = [];

  await checkPath(packageDir, 'portable package directory', failures);
  await checkPath(zipPath, 'portable zip', failures);
  await checkPath(checksumPath, 'SHA256 checksum file', failures);

  for (const file of requiredFiles) {
    await checkPath(resolve(packageDir, file), file, failures);
  }

  await checkForbiddenFiles(packageDir, failures);
  await checkExampleConfig(failures);
  await checkChecksum(failures);
  await checkZipContents(failures);
  await checkPortableHelp(failures);

  if (failures.length > 0) {
    console.error('Print agent package verification failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log('Print agent package verification passed.');
}

async function checkPath(path: string, label: string, failures: string[]) {
  if (!existsSync(path)) failures.push(`Missing ${label}: ${path}`);
}

async function checkForbiddenFiles(directory: string, failures: string[]) {
  const entries = await listFilesRecursive(directory);
  for (const entry of entries) {
    const normalized = entry.replace(/\\/g, '/').toLowerCase();
    if (forbiddenFiles.some((file) => normalized.endsWith(`/${file.toLowerCase()}`) || normalized === file.toLowerCase())) {
      failures.push(`Forbidden local/private file included: ${entry}`);
    }
  }
}

async function checkExampleConfig(failures: string[]) {
  const configPath = resolve(packageDir, 'config.example.json');
  const parsed = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;
  const text = JSON.stringify(parsed);
  if (!text.includes('your-project.supabase.co')) failures.push('config.example.json does not look like a sample config.');
  if (/sk-[A-Za-z0-9_-]{20,}/.test(text)) failures.push('config.example.json appears to contain a real API key.');
  if (/service[_-]?role/i.test(text)) failures.push('config.example.json must not mention service role keys.');
}

async function checkChecksum(failures: string[]) {
  const content = await readFile(zipPath);
  const actual = createHash('sha256').update(content).digest('hex');
  const expected = (await readFile(checksumPath, 'utf8')).trim().split(/\s+/)[0];
  if (actual !== expected) failures.push('YANLCPrintAgent.zip SHA256 checksum does not match.');
}

async function checkZipContents(failures: string[]) {
  const command = [
    "Add-Type -AssemblyName System.IO.Compression.FileSystem",
    `$zip=[System.IO.Compression.ZipFile]::OpenRead('${escapePowerShell(zipPath)}')`,
    '$zip.Entries | ForEach-Object { $_.FullName }',
    '$zip.Dispose()',
  ].join('; ');
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
    windowsHide: true,
    timeout: 15000,
  });
  const entries = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!entries.some((entry) => entry === 'YANLCPrintAgent/YANLCPrintAgent.exe' || entry === 'YANLCPrintAgent\\YANLCPrintAgent.exe')) {
    failures.push('Zip does not contain YANLCPrintAgent/YANLCPrintAgent.exe.');
  }
  if (entries.some((entry) => /config\.json$|\.env$|print-agent\.log$/i.test(entry))) {
    failures.push('Zip contains private config, env or log files.');
  }
}

async function checkPortableHelp(failures: string[]) {
  try {
    const { stdout } = await execFileAsync(resolve(packageDir, 'YANLCPrintAgent.exe'), ['--help'], {
      windowsHide: true,
      timeout: 15000,
    });
    if (!stdout.includes('YANLC Print Agent portable package')) {
      failures.push('Portable agent help output does not identify the portable package.');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`Portable agent --help failed: ${message}`);
  }
}

async function listFilesRecursive(directory: string) {
  const result: string[] = [];
  if (!existsSync(directory)) return result;
  for (const entry of await readdir(directory)) {
    const fullPath = resolve(directory, entry);
    const info = await stat(fullPath);
    if (info.isDirectory()) {
      result.push(...await listFilesRecursive(fullPath));
    } else {
      result.push(fullPath);
    }
  }
  return result;
}

function escapePowerShell(value: string) {
  return value.replace(/'/g, "''");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
