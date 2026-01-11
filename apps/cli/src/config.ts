import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import * as readline from 'readline/promises';
import kleur from 'kleur';
import { renderLogo } from './branding';

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

const promptYesNo = async (message: string): Promise<boolean> => {
  if (!process.stdin.isTTY) {
    return false;
  }
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = await rl.question(message);
    return ['y', 'yes'].includes(answer.trim().toLowerCase());
  } finally {
    rl.close();
  }
};

const upsertNotifyHook = (content: string, hookPath: string): string => {
  const usesCrlf = content.includes('\r\n');
  const normalized = content.replace(/\r\n/g, '\n');
  const notifyLine = `notify = "${hookPath}"`;

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
  const configPath = getCodexConfigPath();
  const snippet = `[hooks]\nnotify = "${hookPathForConfig}"\n`;

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
    console.log(`  ${kleur.yellow('→')} Install Codex from: https://www.codex.chat/`);
  }
  console.log('');
  console.log(`${kleur.bold('Hook path:')} ${hookPathForConfig}`);
  console.log(`${kleur.bold('Codex config:')} ${configPath}`);

  if (!fs.existsSync(hookPath)) {
    console.log(kleur.yellow('Warning: notify hook not found at this path.'));
  }

  try {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    const existing = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf-8') : '';
    const updated = upsertNotifyHook(existing, hookPathForConfig);
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
