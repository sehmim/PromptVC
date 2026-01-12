# promptvc

Local-first, prompt-by-prompt diff tracking for AI coding sessions.

## Requirements

- Node.js 22+ (use nvm: `nvm install 22 && nvm use 22`)
- npm 11.5.1 (set `PROMPTVC_EXPECTED_NPM_VERSION` to override)
- Git
- Codex CLI 0.80.0 (set `PROMPTVC_EXPECTED_CODEX_VERSION` to override)
- jq (optional; legacy hook fallback)
- macOS/Linux
- Windows: Git Bash required (run `promptvc` + `codex` in Git Bash)

### Windows notes

If the legacy shell hook fallback is used, install `jq` (pick one):

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

This command finds the installed notify hook, verifies Codex/npm versions, and updates `~/.codex/config.toml`. If it cannot edit the file, it prints a ready-to-paste snippet.

If you need to bypass the version guard, set:

```bash
PROMPTVC_ALLOW_VERSION_MISMATCH=1
```

### Manual setup

Add to `~/.codex/config.toml`:

```toml
notify = ["/absolute/path/to/promptvc/hooks/codex-notify.sh"]
```

If installed globally via npm, the hook is typically at:

```bash
$(npm root -g)/promptvc/hooks/codex-notify.sh
```

## Version guard

PromptVC checks Codex and npm versions during `promptvc config` and `promptvc init`.

- Expected Codex: `0.80.0` (override with `PROMPTVC_EXPECTED_CODEX_VERSION`)
- Expected npm: `11.5.1` (override with `PROMPTVC_EXPECTED_NPM_VERSION`)
- Bypass the guard: `PROMPTVC_ALLOW_VERSION_MISMATCH=1`

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
- If you’re using the legacy shell hook fallback, ensure `jq` is installed and available on PATH.
