# PromptVC

Local-first, prompt-by-prompt diff tracking for AI coding sessions.

test readme

## Test Title

- testing
- another test

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
- Node.js 22+ (use nvm: `nvm install 22 && nvm use 22`) and pnpm
- npm 11.5.1 (set `PROMPTVC_EXPECTED_NPM_VERSION` to override)
- VS Code 1.80+
- Codex CLI 0.80.0 (set `PROMPTVC_EXPECTED_CODEX_VERSION` to override)
- jq (optional; legacy hook fallback)
- macOS/Linux
- Windows: Git Bash required (run `promptvc` + `codex` in Git Bash)

Windows notes:
- `jq` is only needed if Node isn’t available to the hook environment (legacy fallback). Install (pick one): `winget install jqlang.jq`, `choco install jq`, or `scoop install jq`.

Version guard:
- `promptvc config` and `promptvc init` warn and stop if Codex/npm don’t match the expected versions. Set `PROMPTVC_ALLOW_VERSION_MISMATCH=1` to bypass.

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

4) Configure the Codex notify hook (recommended):
```bash
promptvc config
```
This verifies Codex/npm versions and writes the notify hook.

Manual setup (if needed): add to `~/.codex/config.toml`:
```toml
notify = ["/absolute/path/to/PromptVC/apps/cli/hooks/codex-notify.sh"]
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
