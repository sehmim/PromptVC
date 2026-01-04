# Prompt Version Control

Version control for AI prompts - track, version, and visualize your AI-assisted coding sessions.

## Overview

PromptVC is a local-only tool that automatically logs AI coding sessions, tracking prompts, responses, diffs, and files changed. It consists of:

1. **CLI wrapper** - Wraps AI tools (starting with Codex) to auto-log sessions
2. **Watch mode** - Monitors git changes to log interactive sessions
3. **VS Code extension** - Browse and visualize logged sessions

All data is stored locally in a SQLite database (`.promptvc/promptvc.db`) within your repository.

## Features

- Automatic session logging for AI CLI tools
- Track prompts, responses, diffs, and changed files
- Watch mode for interactive coding sessions
- Browse sessions in VS Code with a tree view
- View detailed session information with syntax-highlighted diffs
- No cloud required - everything stays local

## Project Structure

```
promptvc/
├── apps/
│   ├── cli/              # Node.js CLI tools
│   └── vscode-extension/ # VS Code extension
└── shared/
    └── types/            # Shared TypeScript types
```

## Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0
- Git repository

## Installation

### 1. Install dependencies

```bash
pnpm install
```

### 2. Build all packages

```bash
pnpm build
```

### 3. Link the CLI globally

```bash
cd apps/cli
pnpm link --global
```

## Usage

### Wrapping Codex (or other AI CLIs)

To automatically log Codex sessions, create an alias:

```bash
alias codex='promptvc-codex'
```

Or add to your shell config (`~/.bashrc`, `~/.zshrc`, etc.):

```bash
# PromptVC wrapper for Codex
alias codex='promptvc-codex'
```

Now when you run `codex` commands, sessions will be automatically logged:

```bash
codex "refactor the login function to use hooks"
```

After execution, if files were changed, you'll see:

```
[PromptVC] Session logged: abc-123-def-456
```

### Watch Mode

To automatically log interactive coding sessions (when you make changes without using the CLI wrapper):

```bash
promptvc watch
```

This will monitor your git repository for changes and automatically log sessions when you commit.

Press `Ctrl+C` to stop watching.

### List Sessions

View recent sessions from the command line:

```bash
# List last 10 sessions (default)
promptvc list

# List last 20 sessions
promptvc list -n 20
```

### Show Session Details

View full details of a specific session:

```bash
promptvc show <session-id>
```

## VS Code Extension

### Installation

1. Open the `apps/vscode-extension` folder in VS Code
2. Press `F5` to launch the extension in debug mode
3. In the new VS Code window, open a workspace containing a PromptVC-tracked repository

### Usage

1. Look for the "PromptVC Sessions" view in the Explorer sidebar
2. Click on any session to view:
   - Prompt
   - Response
   - Changed files
   - Full diff
3. Use the refresh button to reload sessions

### Building a .vsix Package

To build a distributable extension package:

```bash
cd apps/vscode-extension
pnpm package
```

This creates a `.vsix` file you can install via:

```
code --install-extension promptvc-vscode-0.1.0.vsix
```

## Data Storage

All session data is stored in `.promptvc/promptvc.db` within your repository.

### Database Schema

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  repo_root TEXT NOT NULL,
  branch TEXT NOT NULL,
  pre_hash TEXT NOT NULL,
  post_hash TEXT,
  prompt TEXT NOT NULL,
  response_snippet TEXT NOT NULL,
  files TEXT NOT NULL,
  diff TEXT NOT NULL,
  created_at TEXT NOT NULL,
  mode TEXT NOT NULL,
  auto_tagged INTEGER NOT NULL
);
```

## Development

### Build Commands

```bash
# Build all packages
pnpm build

# Build specific package
pnpm --filter @promptvc/cli build
pnpm --filter @promptvc/types build
pnpm --filter promptvc-vscode build

# Watch mode for development
pnpm dev
```

### Project Scripts

- `pnpm build` - Build all packages
- `pnpm clean` - Clean all build artifacts
- `pnpm dev` - Run all packages in watch mode
- `pnpm typecheck` - Type-check all packages

## Architecture

### CLI Package (`@promptvc/cli`)

- `git.ts` - Git utilities (get repo info, diffs, etc.)
- `store.ts` - SQLite database operations
- `proxyCodex.ts` - Codex CLI wrapper
- `watch.ts` - Watch mode for interactive sessions
- `index.ts` - Main CLI entry point

### VS Code Extension (`promptvc-vscode`)

- `extension.ts` - Main extension code
  - `PromptSessionsProvider` - TreeView data provider
  - `showSessionDiff()` - Webview for session details

### Shared Types (`@promptvc/types`)

- `PromptSession.ts` - Core data type for sessions

## Extending to Other AI Tools

To add support for other AI CLIs (Claude, Gemini, etc.):

1. Create a new proxy file (e.g., `proxyClaude.ts`) based on `proxyCodex.ts`
2. Add a new bin entry in `apps/cli/package.json`:
   ```json
   {
     "bin": {
       "promptvc-claude": "bin/promptvc-claude"
     }
   }
   ```
3. Create the bin script in `apps/cli/bin/promptvc-claude`
4. Update the provider field in the session data

## Roadmap

- [ ] Support for more AI providers (Claude, Gemini, etc.)
- [ ] Enhanced interactive session detection
- [ ] Diff visualization improvements in VS Code
- [ ] Session search and filtering
- [ ] Export sessions to various formats
- [ ] Session tagging and categorization

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## Testing

Testing 123
testing 123
