# PromptVC

![PromptVC logo](https://raw.githubusercontent.com/sehmim/PromptVC/main/apps/vscode-extension/media/logo.png)

Website: https://v0-prompt-version-control-pi.vercel.app/
Marketplace: https://marketplace.visualstudio.com/items?itemName=SehmimHaque.promptvc-vscode

Local-first, prompt-by-prompt diff tracking for AI coding sessions.

## Demo

![PromptVC VS Code extension showing prompt-by-prompt diffs](https://raw.githubusercontent.com/sehmim/PromptVC/main/apps/vscode-extension/media/extension-demo.png)

## Top features

- Prompt-by-prompt and per-session views
- GitHub-style review UI (unified/split, collapsible files, mark as viewed)
- Hide/unhide/flag prompts
- Session sound notifications

## Setup

Install the extension:
- VS Code Extensions view → search "PromptVC" → Install
- Or run: `code --install-extension SehmimHaque.promptvc-vscode`

Install the CLI:
```bash
npm install -g promptvc
```

Configure the Codex notify hook:
```bash
promptvc config
```

## Manual setup

Add to `~/.codex/config.toml`:
```toml
[hooks]
notify = "/absolute/path/to/codex-notify.sh"
```
If installed via npm, the hook is typically at:
```bash
$(npm root -g)/promptvc/hooks/codex-notify.sh
```

## Usage / Getting started

Initialize a repo and start Codex:
```bash
cd /path/to/your/repo
promptvc init
codex
```

CLI view:
![PromptVC CLI showing prompt-by-prompt diffs](https://raw.githubusercontent.com/sehmim/PromptVC/main/apps/vscode-extension/media/cli-demo.png)
