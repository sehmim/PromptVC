import fs from 'fs';
import os from 'os';
import path from 'path';
import kleur from 'kleur';
import { renderLogo } from './branding';

const getCodexConfigPath = (): string => path.join(os.homedir(), '.codex', 'config.toml');
const getNotifyHookPath = (): string => path.resolve(__dirname, '..', 'hooks', 'codex-notify.sh');

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

export const runConfigCommand = (): void => {
  const hookPath = getNotifyHookPath();
  const configPath = getCodexConfigPath();
  const snippet = `[hooks]\nnotify = "${hookPath}"\n`;

  console.log(kleur.bold().cyan('PromptVC Config'));
  console.log(renderLogo());
  console.log('');
  console.log(`${kleur.bold('Hook path:')} ${hookPath}`);
  console.log(`${kleur.bold('Codex config:')} ${configPath}`);

  if (!fs.existsSync(hookPath)) {
    console.log(kleur.yellow('Warning: notify hook not found at this path.'));
  }

  try {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    const existing = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf-8') : '';
    const updated = upsertNotifyHook(existing, hookPath);
    fs.writeFileSync(configPath, updated, 'utf-8');
    console.log('');
    console.log(kleur.green('OK: updated Codex config.'));
    console.log('');
    console.log(kleur.bgBlue('Run "promptvc init" to initialize Prompt Version Controle in your repository.'));

  } catch (error) {
    console.log('');
    console.log(kleur.yellow('Manual setup required.'));
    console.log(`Add this to ${configPath}:`);
    console.log(snippet);
  }
};
