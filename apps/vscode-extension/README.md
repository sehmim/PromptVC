# PromptVC

![PromptVC logo](media/logo.png)

Website: https://v0-prompt-version-control-pi.vercel.app/

Local-first, prompt-by-prompt diff tracking for AI coding sessions.

## 1) Demo

![PromptVC VS Code extension showing prompt-by-prompt diffs](media/extension-demo.png)

## 2) Top features

- Prompt-by-prompt and per-session views
- GitHub-style review UI (unified/split, collapsible files, mark as viewed)
- Hide/unhide/flag prompts
- Session sound notifications

## 3) Use with the CLI (required)

Install the extension:
- VS Code Extensions view → search "PromptVC" → Install
- Or run: `code --install-extension promptvc.promptvc-vscode`

Install the CLI:
```bash
npm install -g @promptvc/cli
```

Initialize a repo and start Codex:
```bash
cd /path/to/your/repo
promptvc init
codex
```

Enable the per-prompt notify hook for Codex:
```toml
[hooks]
notify = "/absolute/path/to/codex-notify.sh"
```
If installed via npm, the hook is typically at:
```bash
$(npm root -g)/@promptvc/cli/hooks/codex-notify.sh
```

CLI view:
![PromptVC CLI showing prompt-by-prompt diffs](media/cli-demo.png)
