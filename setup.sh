#!/bin/bash
# PromptVC Setup Script
# Automates installation and configuration

set -e

echo "🚀 PromptVC Setup"
echo "=================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found. Please install Node.js 18+ first.${NC}"
    exit 1
fi

if ! command -v pnpm &> /dev/null; then
    echo -e "${RED}❌ pnpm not found. Please install pnpm first.${NC}"
    echo "   Run: npm install -g pnpm"
    exit 1
fi

if ! command -v git &> /dev/null; then
    echo -e "${RED}❌ git not found. Please install git first.${NC}"
    exit 1
fi

if ! command -v codex &> /dev/null; then
    echo -e "${YELLOW}⚠️  Warning: codex CLI not found. Make sure to install it from https://codex.anthropic.com${NC}"
fi

echo -e "${GREEN}✓${NC} Prerequisites OK"
echo ""

# Get project root
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
echo "📁 Project root: $PROJECT_ROOT"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
cd "$PROJECT_ROOT"
pnpm install
echo -e "${GREEN}✓${NC} Dependencies installed"
echo ""

# Build packages
echo "🔨 Building packages..."

echo "  Building types..."
cd "$PROJECT_ROOT/shared/types"
pnpm build

echo "  Building CLI..."
cd "$PROJECT_ROOT/apps/cli"
pnpm build

echo "  Building VS Code extension..."
cd "$PROJECT_ROOT/apps/vscode-extension"
pnpm build

echo -e "${GREEN}✓${NC} All packages built"
echo ""

# Link CLI globally
echo "🔗 Linking CLI globally..."
cd "$PROJECT_ROOT/apps/cli"
pnpm link --global
echo -e "${GREEN}✓${NC} CLI linked (promptvc command available)"
echo ""

# Set up Codex wrapper
echo "⚙️  Setting up Codex wrapper..."

PROMPTVC_BIN_DIR="$(dirname "$(command -v promptvc-codex 2>/dev/null)")"
CODEX_WRAPPER="${PROMPTVC_BIN_DIR}/codex"

if [ -z "$PROMPTVC_BIN_DIR" ]; then
    echo -e "${YELLOW}⚠️  promptvc-codex not found in PATH. Make sure the PromptVC bin directory is on your PATH.${NC}"
else
    if [ -f "$CODEX_WRAPPER" ]; then
        echo -e "${GREEN}✓${NC} Codex wrapper already exists at $CODEX_WRAPPER"
    else
        cat > "$CODEX_WRAPPER" <<'EOF'
#!/bin/bash
exec promptvc-codex "$@"
EOF
        chmod +x "$CODEX_WRAPPER"
        echo -e "${GREEN}✓${NC} Created codex wrapper at $CODEX_WRAPPER"
    fi
fi
echo ""

# Set up Codex notify hook
echo "🪝 Setting up Codex notify hook..."

CODEX_CONFIG="$HOME/.codex/config.toml"
HOOK_PATH="$PROJECT_ROOT/apps/cli/hooks/codex-notify.sh"

# Make hook executable
chmod +x "$HOOK_PATH"

if [ -f "$CODEX_CONFIG" ]; then
    if ! grep -q "notify.*codex-notify.sh" "$CODEX_CONFIG"; then
        echo "" >> "$CODEX_CONFIG"
        echo "[hooks]" >> "$CODEX_CONFIG"
        echo "notify = \"$HOOK_PATH\"" >> "$CODEX_CONFIG"
        echo -e "${GREEN}✓${NC} Added notify hook to $CODEX_CONFIG"
    else
        echo -e "${GREEN}✓${NC} Notify hook already configured"
    fi
else
    mkdir -p "$HOME/.codex"
    echo "[hooks]" > "$CODEX_CONFIG"
    echo "notify = \"$HOOK_PATH\"" >> "$CODEX_CONFIG"
    echo -e "${GREEN}✓${NC} Created $CODEX_CONFIG with notify hook"
fi
echo ""

# Package VS Code extension
echo "📦 Packaging VS Code extension..."
cd "$PROJECT_ROOT/apps/vscode-extension"
pnpm run package
echo -e "${GREEN}✓${NC} Extension packaged"
echo ""

# Install VS Code extension
echo "🔌 Installing VS Code extension..."
VSIX_FILE="promptvc-vscode-0.1.0.vsix"

if [ -f "$VSIX_FILE" ]; then
    if command -v code &> /dev/null; then
        code --install-extension "$VSIX_FILE" --force
        echo -e "${GREEN}✓${NC} VS Code extension installed"
    else
        echo -e "${YELLOW}⚠️  VS Code CLI not found. Install extension manually:${NC}"
        echo "   code --install-extension $PROJECT_ROOT/apps/vscode-extension/$VSIX_FILE"
    fi
else
    echo -e "${RED}❌ Extension package not found${NC}"
fi
echo ""

# Summary
echo "✨ Setup Complete!"
echo "=================="
echo ""
echo "Next steps:"
echo "1. ${GREEN}Reload VS Code:${NC} Cmd/Ctrl + Shift + P → 'Reload Window'"
echo "2. ${GREEN}Test it:${NC} Run 'codex' in a git repository"
echo "3. ${GREEN}View sessions:${NC} Look for the PromptVC icon in VS Code sidebar"
echo ""
echo "📚 Read the full documentation in README.md"
echo ""
echo -e "${GREEN}Happy coding with PromptVC! 🎉${NC}"
