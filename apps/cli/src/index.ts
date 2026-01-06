#!/usr/bin/env node

import { Command } from 'commander';
import { getSessions, initDb, getSessionById } from './store';
import { getRepoRoot } from './git';

const program = new Command();

program
  .name('promptvc')
  .description('Version control for AI prompts - track, version, and visualize your AI-assisted coding sessions')
  .version('0.1.0');

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

program.parse();
