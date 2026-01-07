#!/bin/bash
# PromptVC notification hook for Codex
# This script is called by Codex after each turn completes
# Captures prompts AND git diffs per-prompt for detailed tracking

# Check if we're in a git repository and resolve the repo root
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    exit 0
fi

REPO_DIR=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -z "$REPO_DIR" ]; then
    exit 0
fi

# Get PromptVC directory
PROMPTVC_DIR="$REPO_DIR/.promptvc"
SESSION_FILE="$PROMPTVC_DIR/current_session.json"
LAST_PROMPT_FILE="$PROMPTVC_DIR/last_prompt_count"
LAST_SESSION_FILE="$PROMPTVC_DIR/last_session_file"
TEMP_PROMPTS_FILE="$PROMPTVC_DIR/temp_prompts.json"
SETTINGS_FILE="$PROMPTVC_DIR/settings.json"

# Create .promptvc directory if it doesn't exist
mkdir -p "$PROMPTVC_DIR"

# Play a notification sound when Codex finishes a response
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SOUND_PATH="$SCRIPT_DIR/../../../assets/notify.mp3"
play_notify_sound() {
    if [ -f "$SETTINGS_FILE" ]; then
        SOUND_SETTING=""
        if command -v jq > /dev/null 2>&1; then
            SOUND_SETTING=$(jq -r '.notifySoundEnabled // true' "$SETTINGS_FILE" 2>/dev/null)
        else
            SOUND_SETTING=$(sed -nE 's/.*"notifySoundEnabled"[[:space:]]*:[[:space:]]*(true|false).*/\1/p' "$SETTINGS_FILE" | head -1)
        fi
        if [ "$SOUND_SETTING" = "false" ]; then
            return
        fi
    fi

    if [ ! -f "$SOUND_PATH" ]; then
        return
    fi

    if command -v afplay > /dev/null 2>&1; then
        afplay "$SOUND_PATH" > /dev/null 2>&1 &
    elif command -v paplay > /dev/null 2>&1; then
        paplay "$SOUND_PATH" > /dev/null 2>&1 &
    elif command -v aplay > /dev/null 2>&1; then
        aplay "$SOUND_PATH" > /dev/null 2>&1 &
    elif command -v play > /dev/null 2>&1; then
        play "$SOUND_PATH" > /dev/null 2>&1 &
    fi
}
trap 'play_notify_sound' EXIT

# Find the latest codex session file
LATEST_SESSION=$(find "$HOME/.codex/sessions" -name "rollout-*.jsonl" -type f -print0 2>/dev/null | \
    xargs -0 ls -t 2>/dev/null | head -1)

if [ ! -f "$LATEST_SESSION" ]; then
    exit 0
fi

# Reset prompt counter when a new Codex session file appears
PREV_SESSION=""
if [ -f "$LAST_SESSION_FILE" ]; then
    PREV_SESSION=$(cat "$LAST_SESSION_FILE")
fi
if [ "$LATEST_SESSION" != "$PREV_SESSION" ]; then
    echo "0" > "$LAST_PROMPT_FILE"
    echo "$LATEST_SESSION" > "$LAST_SESSION_FILE"
fi

# Ensure jq is available
if ! command -v jq > /dev/null 2>&1; then
    exit 0
fi

# Extract all user prompts as a JSON array
# This preserves multi-line prompts as single entries
cat "$LATEST_SESSION" | \
    jq -R -s 'split("\n") | map(fromjson? | select(.type == "response_item" and .payload.role == "user") | .payload.content[0].text) | map(select(. != null))' \
    > "$TEMP_PROMPTS_FILE" 2>/dev/null

if [ ! -f "$TEMP_PROMPTS_FILE" ] || [ ! -s "$TEMP_PROMPTS_FILE" ]; then
    exit 0
fi

# Filter out system prompts using jq (checking entire message content)
# Remove prompts that contain system instruction markers
FILTERED_PROMPTS=$(cat "$TEMP_PROMPTS_FILE" | \
    jq 'map(select(
        (. | startswith("# AGENTS.md") | not) and
        (. | startswith("<INSTRUCTIONS>") | not) and
        (. | startswith("<environment_context>") | not) and
        (. | contains("# AGENTS.md instructions") | not) and
        (. | contains("<INSTRUCTIONS>") | not) and
        (. | contains("## Skills") | not) and
        (. | contains("These skills are discovered at startup") | not)
    ))' 2>/dev/null)

# Count current prompts
CURRENT_PROMPT_COUNT=$(echo "$FILTERED_PROMPTS" | jq 'length' 2>/dev/null || echo "0")

if [ "$CURRENT_PROMPT_COUNT" = "0" ]; then
    rm -f "$TEMP_PROMPTS_FILE"
    exit 0
fi

# Get the last processed prompt count
LAST_PROMPT_COUNT=0
if [ -f "$LAST_PROMPT_FILE" ]; then
    LAST_PROMPT_COUNT=$(cat "$LAST_PROMPT_FILE")
fi

# If no new prompts, exit
if [ "$CURRENT_PROMPT_COUNT" -le "$LAST_PROMPT_COUNT" ]; then
    rm -f "$TEMP_PROMPTS_FILE"
    exit 0
fi

# Initialize or load existing session data
if [ -f "$SESSION_FILE" ]; then
    EXISTING_SESSION=$(cat "$SESSION_FILE")
else
    EXISTING_SESSION="[]"
fi

# Get the new prompts (starting from LAST_PROMPT_COUNT)
NEW_PROMPTS=$(echo "$FILTERED_PROMPTS" | jq ".[$LAST_PROMPT_COUNT:]" 2>/dev/null)

# Capture current git state
GIT_HASH=$(git rev-parse HEAD 2>/dev/null || echo "")
GIT_DIFF=$(git diff 2>/dev/null || echo "")
CHANGED_FILES_RAW=$(git diff --name-only 2>/dev/null || echo "")
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Build files array as JSON
if [ -z "$CHANGED_FILES_RAW" ]; then
    FILES_ARRAY="[]"
else
    FILES_ARRAY=$(echo "$CHANGED_FILES_RAW" | jq -R -s 'split("\n") | map(select(length > 0))')
fi

# Escape diff for JSON
ESCAPED_DIFF=$(echo "$GIT_DIFF" | jq -R -s '.')

# Process each new prompt
PROMPT_COUNT=$(echo "$NEW_PROMPTS" | jq 'length' 2>/dev/null || echo "0")

if [ "$PROMPT_COUNT" = "0" ]; then
    rm -f "$TEMP_PROMPTS_FILE"
    exit 0
fi

# Build array of new prompt entries
NEW_ENTRIES="[]"
for ((i=0; i<$PROMPT_COUNT; i++)); do
    PROMPT=$(echo "$NEW_PROMPTS" | jq -r ".[$i]" 2>/dev/null)

    if [ -z "$PROMPT" ] || [ "$PROMPT" = "null" ]; then
        continue
    fi

    # Escape prompt for JSON
    ESCAPED_PROMPT=$(echo "$PROMPT" | jq -R -s '.')

    # Create prompt entry
    PROMPT_ENTRY=$(cat <<EOF
{
  "prompt": $ESCAPED_PROMPT,
  "timestamp": "$TIMESTAMP",
  "hash": "$GIT_HASH",
  "files": $FILES_ARRAY,
  "diff": $ESCAPED_DIFF
}
EOF
)

    # Add to new entries array
    NEW_ENTRIES=$(echo "$NEW_ENTRIES" | jq ". + [$PROMPT_ENTRY]" 2>/dev/null)
done

# Merge with existing session
if [ "$NEW_ENTRIES" != "[]" ]; then
    UPDATED_SESSION=$(echo "$EXISTING_SESSION" | jq ". + $NEW_ENTRIES" 2>/dev/null)
    echo "$UPDATED_SESSION" > "$SESSION_FILE"

    # Update last prompt count
    echo "$CURRENT_PROMPT_COUNT" > "$LAST_PROMPT_FILE"
fi

# Clean up
rm -f "$TEMP_PROMPTS_FILE"

exit 0
