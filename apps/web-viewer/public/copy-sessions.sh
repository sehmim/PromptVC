#!/bin/bash

# Helper script to copy sessions.json to Desktop
# This makes it easier to upload to the web viewer

echo "PromptVC Session File Helper"
echo "=============================="
echo ""

# Check if .promptvc folder exists
if [ ! -d ".promptvc" ]; then
    echo "❌ Error: .promptvc folder not found in current directory"
    echo "   Please run this script from your project root directory"
    exit 1
fi

# Check if sessions.json exists
if [ ! -f ".promptvc/sessions.json" ]; then
    echo "❌ Error: sessions.json not found in .promptvc folder"
    echo "   Make sure you have PromptVC sessions saved"
    exit 1
fi

# Copy to Desktop
cp .promptvc/sessions.json ~/Desktop/sessions.json

if [ $? -eq 0 ]; then
    echo "✅ Success! sessions.json copied to your Desktop"
    echo ""
    echo "Next steps:"
    echo "1. Open the PromptVC Web Viewer in your browser"
    echo "2. Drag sessions.json from your Desktop to the upload area"
    echo "3. Start exploring your sessions!"
else
    echo "❌ Error: Failed to copy file"
    exit 1
fi
