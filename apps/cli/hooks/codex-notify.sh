#!/bin/bash
# PromptVC notification hook for Codex
# This script is called by Codex after each turn completes
# Add to ~/.codex/config.toml:
#   notify = ["/bin/bash", "/path/to/codex-notify.sh"]

# Get the current working directory (git repo)
REPO_DIR="$PWD"

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    exit 0
fi

# Get PromptVC directory
PROMPTVC_DIR="$REPO_DIR/.promptvc"
SESSION_FILE="$PROMPTVC_DIR/current_session.json"

# Create .promptvc directory if it doesn't exist
mkdir -p "$PROMPTVC_DIR"

# Find the latest codex session file
LATEST_SESSION=$(find "$HOME/.codex/sessions" -name "rollout-*.jsonl" -type f -print0 2>/dev/null | \
    xargs -0 ls -t 2>/dev/null | head -1)

if [ -f "$LATEST_SESSION" ]; then
    # Extract all user prompts from the session (filtering out system prompts)
    PROMPTS=$(cat "$LATEST_SESSION" | \
        jq -r 'select(.type == "response_item" and .payload.role == "user") | .payload.content[0].text' 2>/dev/null | \
        grep -v "^null$" | \
        grep -v "^# AGENTS.md" | \
        grep -v "^<environment_context>")

    if [ ! -z "$PROMPTS" ]; then
        # Filter out system prompts that start with "# AGENTS.md" or "<environment_context>"
        FILTERED_PROMPTS=$(echo "$PROMPTS" | grep -v "^# AGENTS.md" | grep -v "^<environment_context>")

        if [ ! -z "$FILTERED_PROMPTS" ]; then
            # Create a JSON structure with all prompts
            # This gets updated after each turn
            echo "$FILTERED_PROMPTS" | jq -R -s 'split("\n") | map(select(length > 0))' > "$SESSION_FILE" 2>/dev/null

            # Optional: Log for debugging
            # echo "[PromptVC] Captured $(echo "$FILTERED_PROMPTS" | wc -l | tr -d ' ') prompts" >> "$PROMPTVC_DIR/notify.log"
        fi
    fi
fi

exit 0
