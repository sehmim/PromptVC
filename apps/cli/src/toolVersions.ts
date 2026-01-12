import { spawnSync } from 'child_process';

export type CodexVersionInfo = {
  version: string | null;
  raw: string | null;
  binaryPath: string | null;
};

export type NpmVersionInfo = {
  version: string | null;
  raw: string | null;
  binaryPath: string | null;
};

export const EXPECTED_CODEX_VERSION = process.env.PROMPTVC_EXPECTED_CODEX_VERSION || '0.80.0';
export const EXPECTED_NPM_VERSION = process.env.PROMPTVC_EXPECTED_NPM_VERSION || '11.5.1';
export const NOTIFY_ARRAY_MIN_VERSION = '0.80.0';

const VERSION_PATTERN = /\b(\d+\.\d+\.\d+)\b/;

function parseVersion(raw: string): string | null {
  const match = raw.match(VERSION_PATTERN);
  return match ? match[1] : null;
}

function getBinaryPath(binary: string): string | null {
  const command = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(command, [binary], { encoding: 'utf8' });
  if (result.status !== 0) return null;
  const output = (result.stdout || '').trim();
  if (!output) return null;
  return output.split(/\r?\n/)[0] || null;
}

export function getCodexVersionInfo(): CodexVersionInfo {
  const commands = [['--version'], ['version']];
  let raw: string | null = null;
  for (const args of commands) {
    const result = spawnSync('codex', args, { encoding: 'utf8' });
    if (result.status !== 0) continue;
    const output = ((result.stdout || '') + (result.stderr || '')).trim();
    if (output) {
      raw = output;
      break;
    }
  }
  const version = raw ? parseVersion(raw) : null;
  return {
    version,
    raw,
    binaryPath: getBinaryPath('codex'),
  };
}

function toSemverParts(version: string): number[] {
  return version.split('.').map((part) => {
    const value = Number.parseInt(part, 10);
    return Number.isFinite(value) ? value : 0;
  });
}

export function compareSemver(a: string, b: string): number {
  const aParts = toSemverParts(a);
  const bParts = toSemverParts(b);
  const maxLen = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < maxLen; i += 1) {
    const left = aParts[i] ?? 0;
    const right = bParts[i] ?? 0;
    if (left !== right) return left > right ? 1 : -1;
  }
  return 0;
}

export function getNpmVersionInfo(): NpmVersionInfo {
  const result = spawnSync('npm', ['--version'], { encoding: 'utf8' });
  const output = ((result.stdout || '') + (result.stderr || '')).trim();
  const raw = output || null;
  const version = raw ? parseVersion(raw) : null;
  return {
    version,
    raw,
    binaryPath: getBinaryPath('npm'),
  };
}

export function getNotifyConfigLine(hookPath: string, codexVersion: string | null): {
  line: string;
  usesArray: boolean;
  useHooksSection: boolean;
} {
  const isLegacy = codexVersion ? compareSemver(codexVersion, NOTIFY_ARRAY_MIN_VERSION) < 0 : false;
  const useArray = !isLegacy;
  return {
    line: useArray ? `notify = ["${hookPath}"]` : `notify = "${hookPath}"`,
    usesArray: useArray,
    useHooksSection: isLegacy,
  };
}

export function isVersionMismatch(actual: string | null, expected: string | null): boolean {
  if (!expected) return false;
  if (!actual) return true;
  return actual !== expected;
}

export function allowVersionMismatch(): boolean {
  const value = (process.env.PROMPTVC_ALLOW_VERSION_MISMATCH || '').toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

export function getCodexVersionWarnings(codexVersion: string | null): string[] {
  if (!codexVersion) {
    return ['Codex version not detected. Run `codex --version` to verify your installation.'];
  }
  if (codexVersion !== EXPECTED_CODEX_VERSION) {
    return [
      `PromptVC expects Codex ${EXPECTED_CODEX_VERSION}, detected ${codexVersion}.`,
      'If hooks do not fire, install the tested version.',
    ];
  }
  return [];
}

export function getNpmVersionWarnings(npmVersion: string | null): string[] {
  if (!npmVersion) {
    return ['npm version not detected. Run `npm --version` to verify your installation.'];
  }
  if (npmVersion !== EXPECTED_NPM_VERSION) {
    return [
      `PromptVC expects npm ${EXPECTED_NPM_VERSION}, detected ${npmVersion}.`,
      'Install the expected npm version if you hit install issues.',
    ];
  }
  return [];
}
