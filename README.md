# PromptVC

Local-first, prompt-by-prompt diff tracking for AI coding sessions.

Website: https://v0-prompt-version-control-pi.vercel.app/

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
- macOS/Linux
- Windows: Git Bash required (run `promptvc` + `codex` in Git Bash)

Windows notes:
- Install `jq` (pick one): `winget install jqlang.jq`, `choco install jq`, or `scoop install jq`.

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


## Workflow (daily usage)

1) Launch the debug build of the extension (from `apps/vscode-extension`):
- In VS Code: `Run -> Start Debugging -> npm build`
- This opens a new Extension Development Host window

2) In the Extension Development Host window, open the repo you want to track.

3) Initialize PromptVC in that repo:
```bash
cd /path/to/your/repo
promptvc init
```
This creates `.promptvc/` inside that repo with `sessions.json` and `settings.json`. Run this once per repo you want to track.

4) Start coding with Codex in that repo:
```bash
codex
```

5) Each prompt you run shows up in the PromptVC Sessions view:
<img src="assets/extension-demo.png" alt="PromptVC VS Code extension showing prompt-by-prompt diffs" width="3018" height="1772" />

## Usage (interactive mode)

```bash
codex
```

## Providers

- Codex (current)
- Claude (coming soon)
- Gemini (coming soon)
