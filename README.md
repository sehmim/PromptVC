# PromptVC

Local-first, prompt-by-prompt diff tracking for AI coding sessions.

PromptVC is a coding AI CLI visualization that records each prompt and shows what changed in your repo after every response, in VS Code and the terminal.

## Feature 1: VS Code Extension (VS Code Marketplace coming soon)

- Ding after each response finishes
- Per-prompt and per-session views
- Hide/unhide/flag prompts
- GitHub-style review UI (unified/split, collapsible files, mark as viewed)

![PromptVC VS Code extension showing prompt-by-prompt diffs](assets/extension-demo.png)

## Feature 2: CLI visualization

- Captures prompt-by-prompt diffs in interactive sessions
- See exactly what the AI changed after each prompt

![PromptVC CLI showing prompt-by-prompt diffs](assets/cli-demo.png)

## Getting started (from scratch)

Requirements:
- Git
- Node.js 18+ and pnpm
- VS Code 1.80+
- Codex CLI
- jq (required for per-prompt capture)
- macOS/Linux (Windows: use WSL or Git Bash)

1) Clone and install dependencies:
```bash
git clone https://github.com/sehmim/PromptVC.git
cd PromptVC
pnpm install
```

2) Build all packages:
```bash
pnpm -r build
```

3) Install the CLI globally:
```bash
cd apps/cli
pnpm link --global
```

4) Enable the per-prompt notify hook (no wrapper required):
Add to `~/.codex/config.toml`:
```toml
[hooks]
notify = "/absolute/path/to/PromptVC/apps/cli/hooks/codex-notify.sh"
```
Tip: run `pwd` inside the PromptVC repo to get the absolute path.

5) Initialize a repo you want to track:
```bash
cd /path/to/your/repo
promptvc init
```
This creates `.promptvc/` inside that repo with `sessions.json` and `settings.json`. Run this once per repo you want to track.

6) Install the VS Code extension from the repo:
```bash
cd apps/vscode-extension
pnpm run package
code --install-extension promptvc-vscode-0.1.0.vsix
```
If the `code` command is not available, open VS Code and use:
`Cmd/Ctrl + Shift + P` -> "Extensions: Install from VSIX..."

7) Open the repo in VS Code and reload:
- `Cmd/Ctrl + Shift + P` -> "Reload Window"
- Open the PromptVC sidebar (circle icon)
- The extension reads `.promptvc/sessions.json` from the folder you opened

8) Run Codex in that repo to generate sessions:
```bash
codex
```

## Usage (interactive mode)

```bash
codex
```

## Providers

- Codex (current)
- Claude (coming soon)
- Gemini (coming soon)
