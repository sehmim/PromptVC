#!/usr/bin/env node

import { Command } from 'commander';
import { getSessions, initDb, getSessionById, initRepoStorage } from './store';
import { getRepoRoot } from './git';
import { runConfigCommand } from './config';
import {
  getCodexVersionInfo,
  getCodexVersionWarnings,
  getNpmVersionInfo,
  getNpmVersionWarnings,
  EXPECTED_CODEX_VERSION,
  EXPECTED_NPM_VERSION,
  isVersionMismatch,
  allowVersionMismatch,
} from './toolVersions';
import { promptYesNo } from './prompt';
import kleur from 'kleur';

const program = new Command();

program
  .name('promptvc')
  .description('Version control for AI prompts - track, version, and visualize your AI-assisted coding sessions')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize PromptVC storage in the current git repository')
  .action(async () => {
    try {
      const repoRoot = await getRepoRoot();
      const codexInfo = getCodexVersionInfo();
      const npmInfo = getNpmVersionInfo();

      if (codexInfo.binaryPath) {
        console.log(`Codex binary: ${codexInfo.binaryPath}`);
      }
      if (codexInfo.version) {
        console.log(`Codex version: ${codexInfo.version}`);
      }
      if (npmInfo.binaryPath) {
        console.log(`npm binary: ${npmInfo.binaryPath}`);
      }
      if (npmInfo.version) {
        console.log(`npm version: ${npmInfo.version}`);
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

      const result = initRepoStorage(repoRoot);

      console.log(`Initialized PromptVC in ${result.promptvcDir}`);
      console.log(`Sessions: ${result.sessionsFilePath}`);
      console.log(`Settings: ${result.settingsFilePath}`);
      console.log('');
      console.log(kleur.blue('Run your coding ai. (codex, claude, gemini)'));
      console.log('');
      console.log(kleur.green('Get the Prompt Version Control VSCode extension to enhance your experience!'));
      console.log(kleur.blue('https://marketplace.visualstudio.com/items?itemName=SehmimHaque.promptvc-vscode'));
      console.log('');
      console.log(kleur.green('Findout more at https://prompt-vc.vercel.app'));

    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List recent prompt sessions')
  .option('-n, --limit <number>', 'Number of sessions to show', '10')
  .action(async (options) => {
    try {
      const repoRoot = await getRepoRoot();
      initDb(repoRoot);
      const limit = parseInt(options.limit, 10);
      const sessions = getSessions(limit);

      if (sessions.length === 0) {
        console.log('No sessions found.');
        return;
      }

      console.log(`\nShowing ${sessions.length} most recent session(s):\n`);

      sessions.forEach((session, index) => {
        const date = new Date(session.createdAt).toLocaleString();
        const promptPreview = session.prompt.substring(0, 50);
        const filesCount = session.files.length;

        console.log(`${index + 1}. [${session.provider}] ${promptPreview}${session.prompt.length > 50 ? '...' : ''}`);
        console.log(`   ID: ${session.id}`);
        console.log(`   Date: ${date}`);
        console.log(`   Branch: ${session.branch}`);
        console.log(`   Files: ${filesCount}`);
        console.log(`   Mode: ${session.mode}`);
        console.log('');
      });
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

program
  .command('show <session-id>')
  .description('Show details of a specific session')
  .action(async (sessionId: string) => {
    try {
      const repoRoot = await getRepoRoot();
      initDb(repoRoot);
      const session = getSessionById(sessionId);

      if (!session) {
        console.error(`Session not found: ${sessionId}`);
        process.exit(1);
      }

      console.log('\n=== Prompt Session ===\n');
      console.log(`ID: ${session.id}`);
      console.log(`Provider: ${session.provider}`);
      console.log(`Date: ${new Date(session.createdAt).toLocaleString()}`);
      console.log(`Branch: ${session.branch}`);
      console.log(`Mode: ${session.mode}`);
      console.log(`\nPrompt:\n${session.prompt}`);
      console.log(`\nResponse:\n${session.responseSnippet}`);
      console.log(`\nFiles (${session.files.length}):`);
      session.files.forEach((file: string) => console.log(`  - ${file}`));
      console.log(`\nDiff:\n${session.diff}`);
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

program
  .command('config')
  .description('Configure the Codex notify hook for PromptVC')
  .action(async () => {
    await runConfigCommand();
  });

program.parse();
