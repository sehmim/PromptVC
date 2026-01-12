import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import kleur from 'kleur';
import { renderLogo } from './branding';
import {
  getCodexVersionInfo,
  getNotifyConfigLine,
  getCodexVersionWarnings,
  getNpmVersionInfo,
  getNpmVersionWarnings,
  EXPECTED_CODEX_VERSION,
  EXPECTED_NPM_VERSION,
  isVersionMismatch,
  allowVersionMismatch,
} from './toolVersions';
import { promptYesNo } from './prompt';

const getCodexConfigPath = (): string => path.join(os.homedir(), '.codex', 'config.toml');
const getCodexDir = (): string => path.join(os.homedir(), '.codex');
const getNotifyHookPath = (): string => path.resolve(__dirname, '..', 'hooks', 'codex-notify.sh');

const isWindows = process.platform === 'win32';

const isCodexInstalled = (): boolean => {
  const codexDir = getCodexDir();
  return fs.existsSync(codexDir);
};

const hasCodexConfig = (): boolean => {
  const configPath = getCodexConfigPath();
  return fs.existsSync(configPath);
};

const isCodexConfigured = (): boolean => {
  const configPath = getCodexConfigPath();
  if (!fs.existsSync(configPath)) {
    return false;
  }
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    return /^\s*notify\s*=/m.test(content);
  } catch {
    return false;
  }
};

const isGitBashOnWindows = (): boolean => {
  if (!isWindows) {
    return true;
  }
  const shell = (process.env.SHELL || '').toLowerCase();
  const termProgram = (process.env.TERM_PROGRAM || '').toLowerCase();
  return Boolean(process.env.MSYSTEM) || shell.includes('bash') || termProgram.includes('mintty');
};

const normalizeHookPathForToml = (hookPath: string): string => {
  if (!isWindows) {
    return hookPath;
  }
  return hookPath.replace(/\\/g, '/');
};

const hasJq = (): boolean => {
  const result = spawnSync('jq', ['--version'], { stdio: 'ignore' });
  if (result.error) {
    return false;
  }
  return result.status === 0;
};

const upsertNotifyHook = (content: string, notifyLine: string): string => {
  const usesCrlf = content.includes('\r\n');
  const normalized = content.replace(/\r\n/g, '\n');

  if (!normalized.trim()) {
    const fresh = `${notifyLine}\n`;
    return usesCrlf ? fresh.replace(/\n/g, '\r\n') : fresh;
  }

  const lines = normalized.split('\n');
  const filtered = lines.filter((line) => !/^\s*notify\s*=/.test(line));
  let insertIndex = filtered.findIndex((line) => /^\s*\[/.test(line));
  if (insertIndex === -1) insertIndex = filtered.length;

  filtered.splice(insertIndex, 0, notifyLine);
  let updated = filtered.join('\n');
  updated = updated.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';

  return usesCrlf ? updated.replace(/\n/g, '\r\n') : updated;
};

const upsertNotifyHookLegacy = (content: string, notifyLine: string): string => {
  const usesCrlf = content.includes('\r\n');
  const normalized = content.replace(/\r\n/g, '\n');

  if (!normalized.trim()) {
    const fresh = `[hooks]\n${notifyLine}\n`;
    return usesCrlf ? fresh.replace(/\n/g, '\r\n') : fresh;
  }

  const hooksHeader = /^\s*\[hooks\]\s*$/m;
  const sectionRegex = /^\s*\[hooks\][\s\S]*?(?=^\s*\[|\Z)/m;
  let updated = normalized;

  if (hooksHeader.test(normalized)) {
    const sectionMatch = normalized.match(sectionRegex);
    if (sectionMatch) {
      const section = sectionMatch[0];
      let nextSection = section;
      if (/^\s*notify\s*=.*$/m.test(section)) {
        nextSection = section.replace(/^\s*notify\s*=.*$/m, notifyLine);
      } else {
        nextSection = `${section.replace(/\s*$/, '')}\n${notifyLine}\n`;
      }
      updated = normalized.replace(sectionRegex, nextSection);
    }
  } else {
    updated = `${normalized.trimEnd()}\n\n[hooks]\n${notifyLine}\n`;
  }

  return usesCrlf ? updated.replace(/\n/g, '\r\n') : updated;
};

export const runConfigCommand = async (): Promise<void> => {
  if (isWindows && !isGitBashOnWindows()) {
    console.log(kleur.red('PromptVC requires Git Bash on Windows.'));
    console.log('Open Git Bash and re-run `promptvc config`.');
    process.exit(1);
  }

  if (isWindows && !hasJq()) {
    console.log(kleur.yellow('jq is required for per-prompt capture.'));
    console.log('Install jq, then re-run `promptvc config`.');
    console.log('Windows install options:');
    console.log('  - winget install jqlang.jq');
    console.log('  - choco install jq');
    console.log('  - scoop install jq');

    const shouldInstall = await promptYesNo('Install jq now? (y/N): ');
    if (shouldInstall) {
      console.log('');
      console.log('Run one of the commands above, then re-run `promptvc config`.');
      return;
    }

    console.log(kleur.yellow('Continuing without jq will disable per-prompt capture.'));
    console.log('');
  }

  const hookPath = getNotifyHookPath();
  const hookPathForConfig = normalizeHookPathForToml(hookPath);
  const codexInfo = getCodexVersionInfo();
  const npmInfo = getNpmVersionInfo();
  const notifyConfig = getNotifyConfigLine(hookPathForConfig, codexInfo.version);
  const configPath = getCodexConfigPath();
  const snippet = notifyConfig.useHooksSection
    ? `[hooks]\n${notifyConfig.line}\n`
    : `${notifyConfig.line}\n`;

  console.log(kleur.bold().cyan('PromptVC Config'));
  console.log(renderLogo());
  console.log('');

  // Check Codex installation status
  const codexInstalled = isCodexInstalled();
  const codexConfigured = isCodexConfigured();

  console.log(`${kleur.bold('Codex status:')}`);
  if (codexInstalled) {
    console.log(`  ${kleur.green('✓')} Codex is installed (${getCodexDir()} found)`);
    if (codexConfigured) {
      console.log(`  ${kleur.green('✓')} Codex is already configured with PromptVC`);
    } else if (hasCodexConfig()) {
      console.log(`  ${kleur.yellow('○')} Codex config exists but PromptVC not configured`);
    } else {
      console.log(`  ${kleur.yellow('○')} Codex config not found, will be created`);
    }
  } else {
    console.log(`  ${kleur.red('✗')} Codex not found (${getCodexDir()} does not exist)`);
    console.log(`  ${kleur.yellow('→')} Install Codex: npm i -g @openai/codex`);
  }
  console.log('');
  console.log(`${kleur.bold('Hook path:')} ${hookPathForConfig}`);
  console.log(`${kleur.bold('Codex config:')} ${configPath}`);

  if (codexInfo.binaryPath) {
    console.log(`${kleur.bold('Codex binary:')} ${codexInfo.binaryPath}`);
  }
  if (codexInfo.version) {
    console.log(`${kleur.bold('Codex version:')} ${codexInfo.version}`);
  } else if (codexInfo.raw) {
    console.log(`${kleur.bold('Codex version:')} ${codexInfo.raw}`);
  }
  if (npmInfo.binaryPath) {
    console.log(`${kleur.bold('npm binary:')} ${npmInfo.binaryPath}`);
  }
  if (npmInfo.version) {
    console.log(`${kleur.bold('npm version:')} ${npmInfo.version}`);
  } else if (npmInfo.raw) {
    console.log(`${kleur.bold('npm version:')} ${npmInfo.raw}`);
  }
  const warnings = getCodexVersionWarnings(codexInfo.version);
  if (warnings.length > 0) {
    for (const warning of warnings) {
      console.log(kleur.yellow(`Warning: ${warning}`));
    }
  }
  const npmWarnings = getNpmVersionWarnings(npmInfo.version);
  if (npmWarnings.length > 0) {
    for (const warning of npmWarnings) {
      console.log(kleur.yellow(`Warning: ${warning}`));
    }
  }
  if (notifyConfig.useHooksSection) {
    console.log(kleur.yellow('Warning: Codex is using the legacy [hooks] notify format; upgrade recommended.'));
  }
  console.log('');

  const codexMismatch = isVersionMismatch(codexInfo.version, EXPECTED_CODEX_VERSION);
  const npmMismatch = isVersionMismatch(npmInfo.version, EXPECTED_NPM_VERSION);
  if ((codexMismatch || npmMismatch) && !allowVersionMismatch()) {
    const reason = codexMismatch && npmMismatch
      ? 'Codex and npm versions do not match the expected versions.'
      : codexMismatch
        ? 'Codex version does not match the expected version.'
        : 'npm version does not match the expected version.';
    console.log(kleur.yellow(`Warning: ${reason}`));
    console.log(kleur.yellow('Set PROMPTVC_ALLOW_VERSION_MISMATCH=1 to bypass this check.'));
    const shouldContinue = await promptYesNo('Continue anyway? (y/N): ');
    if (!shouldContinue) {
      process.exit(1);
    }
    console.log('');
  }

  if (!fs.existsSync(hookPath)) {
    console.log(kleur.yellow('Warning: notify hook not found at this path.'));
  }

  try {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    const existing = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf-8') : '';
    const updated = notifyConfig.useHooksSection
      ? upsertNotifyHookLegacy(existing, notifyConfig.line)
      : upsertNotifyHook(existing, notifyConfig.line);
    fs.writeFileSync(configPath, updated, 'utf-8');
    console.log('');
    if (codexConfigured) {
      console.log(kleur.green('OK: Codex config verified (already configured).'));
    } else {
      console.log(kleur.green('OK: Codex config updated successfully.'));
    }

    if (!codexInstalled) {
      console.log('');
      console.log(kleur.yellow('Note: Codex installation not detected. Install Codex to use this integration.'));
    }
    console.log('');
    console.log(kleur.bgBlue('Run "promptvc init" to initialize Prompt Version Control in your repository.'));

  } catch (error) {
    console.log('');
    console.log(kleur.yellow('Manual setup required.'));
    console.log(`Add this to ${configPath}:`);
    console.log(snippet);
  }
};
