#!/bin/bash
# PromptVC Publishing Script
# Helps publish the VS Code extension to the marketplace

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}📦 PromptVC Publishing Assistant${NC}"
echo "=================================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: Must run from apps/vscode-extension directory${NC}"
    exit 1
fi

# Check if vsce is installed
if ! command -v vsce &> /dev/null; then
    echo -e "${YELLOW}⚠️  vsce not found. Installing @vscode/vsce...${NC}"
    npm install -g @vscode/vsce
fi

# Pre-flight checklist
echo -e "${BLUE}📋 Pre-flight Checklist${NC}"
echo ""

ERRORS=0

# Check for icon
if [ ! -f "icon.png" ]; then
    echo -e "${RED}❌ Missing icon.png${NC}"
    echo "   Add a 128x128px PNG icon to apps/vscode-extension/"
    ERRORS=$((ERRORS+1))
else
    echo -e "${GREEN}✓${NC} icon.png found"
fi

# Check for LICENSE
if [ ! -f "../../LICENSE" ]; then
    echo -e "${YELLOW}⚠️  Missing LICENSE file in project root${NC}"
    echo "   Add a LICENSE file (e.g., MIT, Apache 2.0)"
fi

# Check package.json fields
echo ""
echo -e "${BLUE}📝 Checking package.json...${NC}"

PUBLISHER=$(node -p "require('./package.json').publisher || ''")
REPO=$(node -p "require('./package.json').repository?.url || ''")
VERSION=$(node -p "require('./package.json').version")

if [ -z "$PUBLISHER" ] || [ "$PUBLISHER" = "promptvc" ]; then
    echo -e "${RED}❌ Publisher not set or using default${NC}"
    echo "   Update 'publisher' field in package.json"
    ERRORS=$((ERRORS+1))
else
    echo -e "${GREEN}✓${NC} Publisher: $PUBLISHER"
fi

if [ -z "$REPO" ]; then
    echo -e "${YELLOW}⚠️  Repository URL not set${NC}"
    echo "   Add 'repository.url' to package.json"
else
    echo -e "${GREEN}✓${NC} Repository: $REPO"
fi

echo -e "${GREEN}✓${NC} Version: $VERSION"

if [ $ERRORS -gt 0 ]; then
    echo ""
    echo -e "${RED}❌ Fix the above errors before publishing${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✓ Pre-flight check passed${NC}"
echo ""

# Build extension
echo -e "${BLUE}🔨 Building extension...${NC}"
pnpm build

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Build successful"
echo ""

# Package extension
echo -e "${BLUE}📦 Packaging extension...${NC}"
pnpm run package

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Packaging failed${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Extension packaged"
echo ""

# Ask what to do
echo -e "${BLUE}🚀 What would you like to do?${NC}"
echo ""
echo "1. Test locally (install .vsix file)"
echo "2. Publish to marketplace"
echo "3. Exit"
echo ""
read -p "Enter choice (1-3): " choice

case $choice in
    1)
        echo ""
        echo -e "${BLUE}📥 Installing extension locally...${NC}"
        VSIX_FILE=$(ls -t *.vsix | head -1)

        if [ -z "$VSIX_FILE" ]; then
            echo -e "${RED}❌ No .vsix file found${NC}"
            exit 1
        fi

        code --install-extension "$VSIX_FILE" --force
        echo ""
        echo -e "${GREEN}✓${NC} Extension installed!"
        echo -e "${YELLOW}⚠️  Reload VS Code to activate: Cmd/Ctrl + Shift + P → 'Reload Window'${NC}"
        ;;

    2)
        echo ""
        echo -e "${BLUE}🔐 Publishing to marketplace...${NC}"
        echo ""

        # Check if logged in
        read -p "Have you logged in with 'vsce login $PUBLISHER'? (y/n): " logged_in

        if [ "$logged_in" != "y" ]; then
            echo ""
            echo "Please login first:"
            echo "  vsce login $PUBLISHER"
            echo ""
            echo "You'll need your Personal Access Token from:"
            echo "  https://dev.azure.com → User Settings → Personal Access Tokens"
            exit 0
        fi

        echo ""
        echo "Publishing version $VERSION..."
        echo ""

        read -p "Publish now? (y/n): " confirm

        if [ "$confirm" = "y" ]; then
            vsce publish

            if [ $? -eq 0 ]; then
                echo ""
                echo -e "${GREEN}✓ Published successfully!${NC}"
                echo ""
                echo "Your extension is now available at:"
                echo "https://marketplace.visualstudio.com/items?itemName=$PUBLISHER.promptvc-vscode"
                echo ""
                echo "It may take a few minutes to appear in search results."
            else
                echo -e "${RED}❌ Publishing failed${NC}"
                exit 1
            fi
        else
            echo "Publishing cancelled"
        fi
        ;;

    3)
        echo "Exiting..."
        exit 0
        ;;

    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}Done!${NC}"
