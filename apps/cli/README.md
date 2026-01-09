# promptvc

Local-first, prompt-by-prompt diff tracking for AI coding sessions.

## Requirements

- Node.js 18+
- Git
- Codex CLI
- jq (required for per-prompt capture)
- macOS/Linux
- Windows: Git Bash required (run `promptvc` + `codex` in Git Bash)

### Windows notes

Install `jq` (pick one):

```bash
winget install jqlang.jq
```

```bash
choco install jq
```

```bash
scoop install jq
```

## Install

```bash
npm install -g promptvc
```

## Setup (recommended)

```bash
promptvc config
```

This command finds the installed notify hook and updates `~/.codex/config.toml`. If it cannot edit the file, it prints a ready-to-paste snippet.

### Manual setup

Add to `~/.codex/config.toml`:

```toml
[hooks]
notify = "/absolute/path/to/promptvc/hooks/codex-notify.sh"
```

If installed globally via npm, the hook is typically at:

```bash
$(npm root -g)/promptvc/hooks/codex-notify.sh
```

## Usage

Initialize a repo:

```bash
cd /path/to/your/repo
promptvc init
```

Run Codex:

```bash
codex
```

List sessions:

```bash
promptvc list
```

Show a session:

```bash
promptvc show <session-id>
```

Optional Codex wrapper:

```bash
promptvc-codex
```

## Troubleshooting

- If `promptvc` resolves to a Python shim, run `which promptvc` and ensure your npm global bin is ahead of pyenv on PATH.
- Ensure `jq` is installed and available on PATH.
