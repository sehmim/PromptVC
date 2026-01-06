# PromptVC

**Local-first version control for AI coding sessions**

Track, version, and visualize your AI-assisted coding sessions with beautiful GitHub-style PR reviews built right into VS Code.

## ✨ Features

### 🎯 Automatic Session Tracking
- Captures every prompt and response from AI coding sessions
- Tracks git diffs for each prompt in interactive sessions
- Per-prompt granularity shows exactly what each prompt changed
- Works with Codex (extensible to other AI CLIs)

### 🎨 GitHub-Style PR Review Interface
- **Collapsible file diffs** - Click headers to collapse/expand files
- **Mark as viewed** - Check off files as you review them (state persists!)
- **Syntax highlighting** - Code matches your editor's theme colors
- **Unified & split views** - Switch between diff view modes
- **Smart theme integration** - Automatically matches your VS Code theme

### 📊 Rich Session Management
- **Flag** important sessions for quick access
- **Tag** sessions for organization (e.g., "refactor", "bug-fix", "feature")
- **Hide/show** sessions to declutter your view
- **Real-time updates** - See sessions populate as you code
- **Clean UI** - Simple dots for sessions, no clutter

### 🔍 Granular Tracking
- See which files each prompt modified
- Track code evolution through multi-turn conversations
- Navigate complex refactoring sessions easily

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and **pnpm**
- **VS Code** 1.80+
- **Git** repository
- **[Codex CLI](https://codex.anthropic.com)** installed

### Installation

#### 1. Clone and Build

```bash
git clone <your-repo-url>
cd poop
pnpm install
```

#### 2. Build All Packages

```bash
# Build types package
cd shared/types
pnpm build

# Build CLI
cd ../../apps/cli
pnpm build

# Build VS Code extension
cd ../vscode-extension
pnpm build
```

#### 3. Install CLI Globally

```bash
cd apps/cli
pnpm link --global
```

#### 4. Set Up Codex Wrapper (PATH)

Create a small wrapper script (no symlink) that forwards to `promptvc-codex` and appears before the real `codex` on your PATH:

```bash
BIN_DIR="$(dirname "$(which promptvc-codex)")"
cat > "$BIN_DIR/codex" <<'EOF'
#!/usr/bin/env bash
exec promptvc-codex "$@"
EOF
chmod +x "$BIN_DIR/codex"
```

Confirm the wrapper is active:
```bash
which codex
```

#### 5. Configure Codex Notify Hook

Add to `~/.codex/config.toml`:

```toml
[hooks]
notify = "/absolute/path/to/poop/apps/cli/hooks/codex-notify.sh"
```

Replace `/absolute/path/to` with the actual path. For example:
```toml
[hooks]
notify = "/Users/yourusername/projects/poop/apps/cli/hooks/codex-notify.sh"
```

#### 6. Install VS Code Extension

```bash
cd apps/vscode-extension
pnpm run package  # Creates promptvc-vscode-0.1.0.vsix
code --install-extension promptvc-vscode-0.1.0.vsix
```

#### 7. Reload VS Code

Press `Cmd/Ctrl + Shift + P` → **Reload Window**

The PromptVC icon (circle) will appear in your activity bar!

## 💻 Usage

### Starting a Session

Use `codex` normally - PromptVC tracks everything automatically:

```bash
# Interactive mode (recommended)
codex

# One-shot mode
codex "add error handling to the login function"
```

### Viewing Sessions

1. **Open PromptVC sidebar** - Click the circle icon in the activity bar
2. **Click any session** - Opens GitHub-style diff viewer
3. **Review files**:
   - Click file headers to collapse/expand
   - Check boxes to mark files as viewed
   - Switch between Unified/Split view
4. **Navigate** - Scroll through files, viewed state persists

### Managing Sessions

**Right-click any session to:**
- 🚩 **Toggle Flag** - Mark as important
- 🏷️ **Edit Tags** - Add tags like "refactor", "bug-fix"
- 👁️ **Hide Session** - Declutter your view

**Toolbar actions:**
- 🔄 **Refresh** - Reload sessions
- 👁️ **Show/Hide** hidden sessions

### Features in Detail

#### ✅ Mark as Viewed
- Check the box next to any filename
- Viewed files show with strikethrough and reduced opacity
- State persists across sessions
- Great for reviewing large diffs

#### 🎨 Syntax Highlighting
- Automatically detects language from file extension
- Highlights TypeScript, JavaScript, Python, Go, Rust, and 20+ more
- Colors match your VS Code theme perfectly
- Keywords, strings, comments all styled correctly

#### 📁 Collapsible Files
- Click any file header to collapse/expand
- Start with all files expanded
- Easy navigation through multi-file changes

## 📦 Publishing to VS Code Marketplace

### Step 1: Prerequisites

1. **Create Publisher Account**
   - Go to https://marketplace.visualstudio.com/manage
   - Sign in with Microsoft/GitHub
   - Click **Create Publisher**
   - Choose a unique publisher ID (e.g., "your-company-name")

2. **Generate Personal Access Token (PAT)**
   - Go to https://dev.azure.com
   - Click **User Settings** (gear icon) → **Personal Access Tokens**
   - Click **+ New Token**
   - Name: "VS Code Marketplace"
   - Organization: **All accessible organizations**
   - Scopes: **Marketplace** → Check **Manage**
   - Click **Create**
   - **Copy the token immediately** (won't be shown again!)

### Step 2: Prepare Extension

1. **Update `apps/vscode-extension/package.json`**:

```json
{
  "name": "promptvc-vscode",
  "displayName": "PromptVC",
  "description": "View and explore AI prompt sessions tracked by PromptVC",
  "version": "0.1.0",
  "publisher": "your-publisher-id",  // ← Your publisher ID
  "icon": "icon.png",
  "repository": {
    "type": "git",
    "url": "https://github.com/your-username/promptvc.git"
  },
  "bugs": {
    "url": "https://github.com/your-username/promptvc/issues"
  },
  "homepage": "https://github.com/your-username/promptvc#readme",
  "license": "MIT",
  "keywords": [
    "ai",
    "codex",
    "prompt",
    "version-control",
    "diff",
    "git"
  ]
}
```

2. **Add Extension Icon**

Create a 128x128px PNG icon:

```bash
# Add to apps/vscode-extension/icon.png
# Recommended: Simple, recognizable icon with transparent background
```

3. **Add LICENSE File**

```bash
# Add to root: poop/LICENSE
# Use MIT, Apache 2.0, or your preferred license
```

4. **Update README with Screenshots**

Add screenshots to show off features:
- Session list view
- Diff viewer with syntax highlighting
- Collapsible files and viewed checkboxes

### Step 3: Package Extension

```bash
cd apps/vscode-extension
pnpm run package
```

This creates `promptvc-vscode-0.1.0.vsix`

### Step 4: Test Locally

```bash
# Uninstall old version
code --uninstall-extension your-publisher-id.promptvc-vscode

# Install new package
code --install-extension promptvc-vscode-0.1.0.vsix

# Test thoroughly!
```

### Step 5: Publish

```bash
# Login with your PAT
npx @vscode/vsce login your-publisher-id
# Paste your PAT when prompted

# Publish to marketplace
npx @vscode/vsce publish

# Or publish with version bump
npx @vscode/vsce publish minor  # 0.1.0 → 0.2.0
npx @vscode/vsce publish patch  # 0.1.0 → 0.1.1
```

### Step 6: Verify

1. Go to https://marketplace.visualstudio.com/items?itemName=your-publisher-id.promptvc-vscode
2. Check that all info displays correctly
3. Test installation: `code --install-extension your-publisher-id.promptvc-vscode`

### Publishing Checklist

Before publishing, ensure:

- [ ] Icon added (128x128 PNG)
- [ ] LICENSE file exists
- [ ] README has screenshots and examples
- [ ] `package.json` has correct publisher, repo URL
- [ ] Version number updated
- [ ] Extension tested locally
- [ ] All features working
- [ ] No debug code or console.logs
- [ ] Keywords added for discoverability
- [ ] Categories set appropriately

### Updating Published Extension

```bash
# Make changes, test, then:
cd apps/vscode-extension

# Bump version and publish
npx @vscode/vsce publish patch  # Bug fixes
npx @vscode/vsce publish minor  # New features
npx @vscode/vsce publish major  # Breaking changes
```

## 🏗️ Project Structure

```
poop/
├── apps/
│   ├── cli/                       # PromptVC CLI wrapper
│   │   ├── src/
│   │   │   ├── proxyCodex.ts     # Wraps codex CLI
│   │   │   ├── store.ts          # JSON session storage
│   │   │   ├── git.ts            # Git operations
│   │   │   └── index.ts          # CLI entry point
│   │   ├── hooks/
│   │   │   └── codex-notify.sh   # Codex notification hook
│   │   └── bin/
│   │       ├── promptvc          # CLI executable
│   │       └── promptvc-codex    # Codex wrapper
│   └── vscode-extension/          # VS Code extension
│       ├── src/
│       │   └── extension.ts      # Extension logic
│       ├── package.json
│       └── tsconfig.json
└── shared/
    └── types/                     # Shared TypeScript types
        └── src/
            └── PromptSession.ts   # Session data model
```

## 🛠️ Development

### Building from Source

```bash
# Install all dependencies
pnpm install

# Build all packages
pnpm -r build

# Watch mode for extension development
cd apps/vscode-extension
pnpm run dev  # TypeScript watch mode
```

### Testing the Extension

1. Open `apps/vscode-extension` in VS Code
2. Press **F5** to launch Extension Development Host
3. Open a git repository in the new window
4. Run some `codex` commands
5. Check the PromptVC sidebar

### Debugging

**CLI Debugging:**
```bash
# Enable debug logging
DEBUG=promptvc:* codex "test prompt"
```

**Extension Debugging:**
- Press F5 in VS Code
- Check **Output** panel → **PromptVC**
- Check **Developer Tools** → **Console**

## 🔧 Configuration

### Environment Variables

```bash
# Optional: Custom PromptVC directory
export PROMPTVC_DIR="$HOME/.promptvc"

# Debug logging
export DEBUG="promptvc:*"
```

### VS Code Settings

Currently no configuration needed. Future versions will add:
- Custom storage location
- Session retention policy
- Auto-hide patterns
- Default diff view (unified/split)

## 🐛 Troubleshooting

### Sessions Not Appearing

**Check Codex wrapper:**
```bash
which codex  # Should show your wrapper path
type codex   # Should show wrapper script details
```

**Verify notify hook:**
```bash
cat ~/.codex/config.toml | grep notify
```

**Check .promptvc directory:**
```bash
cd your-repo
ls -la .promptvc/
cat .promptvc/sessions.json
```

### Extension Not Loading

1. **Check Output panel**
   - View → Output → Select "PromptVC"
   - Look for error messages

2. **Reload window**
   - Cmd/Ctrl + Shift + P → "Reload Window"

3. **Verify extension enabled**
   - Extensions view → Search "PromptVC"
   - Make sure it's enabled

### Syntax Highlighting Not Working

1. **Check browser console**
   - Help → Toggle Developer Tools
   - Look for highlight.js errors

2. **Verify CDN access**
   - Check internet connection
   - Try refreshing webview

3. **Check file extension**
   - Verify file has supported extension (.ts, .js, etc.)

### Diff Not Showing

**Check git status:**
```bash
git status
git diff
```

**Verify git repository:**
```bash
git rev-parse --git-dir
```

## 🗺️ Roadmap

- [ ] **Automatic setup wizard** - One-click configuration
- [ ] **Multi-provider support** - Claude CLI, Gemini, etc.
- [ ] **Advanced search** - Filter by tags, files, dates
- [ ] **Session analytics** - Track productivity, patterns
- [ ] **Export to markdown** - Share sessions as docs
- [ ] **Session comparison** - Diff between sessions
- [ ] **Custom hooks** - Extend to other AI tools
- [ ] **Cloud sync** (optional) - Sync across machines
- [ ] **Team features** - Share sessions with team

## 🤝 Contributing

Contributions welcome! Here's how:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make changes** and test thoroughly
4. **Commit**: `git commit -m 'Add amazing feature'`
5. **Push**: `git push origin feature/amazing-feature`
6. **Open a Pull Request**

### Development Guidelines

- Use TypeScript strict mode
- Follow existing code style
- Add comments for complex logic
- Test all changes locally
- Update README if needed

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

## 💬 Support

- 🐛 **Report bugs**: [GitHub Issues](https://github.com/your-username/promptvc/issues)
- 💡 **Feature requests**: [GitHub Discussions](https://github.com/your-username/promptvc/discussions)
- 📧 **Email**: your-email@example.com
- 💬 **Discord**: [Join our community](#) (coming soon)

## 🙏 Acknowledgments

- Built with [VS Code Extension API](https://code.visualstudio.com/api)
- Syntax highlighting by [highlight.js](https://highlightjs.org/)
- Inspired by Git workflows and GitHub PR reviews
- Thanks to the Anthropic team for Codex

## 📊 Stats

- **Languages**: TypeScript, JavaScript, Bash
- **Platforms**: macOS, Linux, Windows
- **License**: MIT
- **Status**: Active development

---

**Made with ❤️ for AI-assisted coding**

*PromptVC is not affiliated with Anthropic or GitHub*
