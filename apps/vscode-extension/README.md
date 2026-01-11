# PromptVC - Prompt Tracker & Prompt Version Control

Main marketing page: https://prompt-vc.vercel.app
Marketplace: https://marketplace.visualstudio.com/items?itemName=SehmimHaque.promptvc-vscode

> Git for prompts.

![PromptVC logo](https://raw.githubusercontent.com/sehmim/PromptVC/main/apps/vscode-extension/media/logo.png)
PromptVC is an LLM-agnostic, local-first prompt tracker and prompt version control system for AI-assisted development.

It lets you track every prompt, diff prompt evolution, and see exactly what code each prompt changed - enabling reproducible prompt-based programming and disciplined vibe coding workflows.

---

## What it does

PromptVC shows you exactly what each prompt changed in your code.

- Prompt -> Files changed -> Line diffs -> Session context
- Git-style review for prompts
- Works with any LLM (Codex today, Claude and Gemini soon)

Prompts become first-class engineering artifacts.

---

## Demo

PromptVC VS Code extension showing prompt-by-prompt diffs

![PromptVC VS Code extension showing prompt-by-prompt diffs](https://raw.githubusercontent.com/sehmim/PromptVC/main/apps/vscode-extension/media/extension-demo.png)

Each prompt is tracked, diffed, and reviewable - just like code.

---

## LLM Support

- Codex - supported today
- Claude - coming soon
- Gemini - coming soon
- Designed to work with any LLM via hooks

PromptVC is intentionally LLM-agnostic.

---

## Why PromptVC Exists

AI behavior changes when prompts drift.

Without prompt tracking:

- Bugs are hard to reproduce
- Prompt regressions are invisible
- Prompt intent is lost
- Team collaboration breaks

PromptVC makes prompt evolution visible, reviewable, and auditable.

---

## Core Capabilities

- Prompt tracking per session
- Prompt version control with Git-style diffs
- Per-prompt file and line impact
- Unified and split diff views
- Prompt review workflow (mark, hide, flag)
- Local-first storage
- CLI + VS Code UI

---

## Prompt-by-Prompt Code Impact

Each prompt is linked to:

- Files changed
- Line diffs
- Session context

You can answer:

"What did this prompt actually change?"

instantly.

---

## Built for Prompt-Based Programming

PromptVC enables:

- Prompt-based programming
- Prompt auditing
- Prompt regression detection
- Vibe coding with reproducibility
- Prompt workflow discipline

---

## Coming Soon - Prompt Tracker Platform

Team collaboration features:

- Prompt-level Pull Request review
- Prompt history across teams
- Prompt review comments
- Prompt regression detection
- Prompt analytics

Think: GitHub for prompts.

---

## Installation

### VS Code Extension

Search for PromptVC in the VS Code Marketplace or run:

```bash
code --install-extension SehmimHaque.promptvc-vscode
```

### CLI

```bash
npm install -g promptvc
```

Windows: run `promptvc` and `codex` from Git Bash and ensure `jq` is installed.

---

## Getting Started

**Requirements:**
- Node.js 22+ (use nvm: `nvm install 22 && nvm use 22`)
- Git
- jq (required for per-prompt capture)

```bash
cd your-repo
promptvc init
codex
```

PromptVC will begin tracking prompts automatically.

---

## Marketplace Description 

LLM-agnostic prompt tracker and prompt version control with Git-style diffs. See exactly what code each prompt changed.

---

## Keywords

prompt tracker, prompt version control, prompt diff, prompt history, prompt based programming, vibe coding, ai prompt tracking, llm prompts, prompt audit, prompt workflow, prompt engineering, prompt review

---

## One-Line Pitch

PromptVC is Git for prompts.

---

## Positioning

PromptVC is not a chat history tool.
PromptVC is prompt version control infrastructure.

---

## Web Viewer

https://prompt-vc.vercel.app/session
