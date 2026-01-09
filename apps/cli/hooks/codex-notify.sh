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
SESSIONS_FILE="$PROMPTVC_DIR/sessions.json"
LAST_PROMPT_FILE="$PROMPTVC_DIR/last_prompt_count"
LAST_SESSION_FILE="$PROMPTVC_DIR/last_session_file"
TEMP_PROMPTS_FILE="$PROMPTVC_DIR/temp_prompts.json"
SETTINGS_FILE="$PROMPTVC_DIR/settings.json"
LAST_GIT_STATE_FILE="$PROMPTVC_DIR/last_git_state.json"

# Create .promptvc directory if it doesn't exist
mkdir -p "$PROMPTVC_DIR"

if [ ! -f "$SESSIONS_FILE" ]; then
    echo "[]" > "$SESSIONS_FILE"
fi

# Play a notification sound when Codex finishes a response
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SOUND_PATH="$SCRIPT_DIR/../assets/notify.mp3"
FALLBACK_SOUND_PATH="$SCRIPT_DIR/../../../assets/notify.mp3"
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
        if [ -f "$FALLBACK_SOUND_PATH" ]; then
            SOUND_PATH="$FALLBACK_SOUND_PATH"
        else
            return
        fi
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

SESSION_ID=$(basename "$LATEST_SESSION" .jsonl)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

# Reset prompt counter when a new Codex session file appears
PREV_SESSION=""
if [ -f "$LAST_SESSION_FILE" ]; then
    PREV_SESSION=$(cat "$LAST_SESSION_FILE")
fi
NEW_SESSION="false"
if [ "$LATEST_SESSION" != "$PREV_SESSION" ]; then
    echo "0" > "$LAST_PROMPT_FILE"
    echo "$LATEST_SESSION" > "$LAST_SESSION_FILE"
    # Reset git state for new session to start fresh
    rm -f "$LAST_GIT_STATE_FILE"
    NEW_SESSION="true"
fi

# Ensure jq is available
if ! command -v jq > /dev/null 2>&1; then
    exit 0
fi

SESSIONS_JSON=$(cat "$SESSIONS_FILE" 2>/dev/null || echo "[]")
if ! echo "$SESSIONS_JSON" | jq -e . > /dev/null 2>&1; then
    SESSIONS_JSON="[]"
fi

if [ "$NEW_SESSION" = "true" ] && [ -n "$PREV_SESSION" ]; then
    PREV_SESSION_ID=$(basename "$PREV_SESSION" .jsonl)
    if [ -n "$PREV_SESSION_ID" ]; then
        SESSIONS_JSON=$(echo "$SESSIONS_JSON" | jq \
            --arg prevId "$PREV_SESSION_ID" \
            --arg endedAt "$TIMESTAMP" \
            'map(if .id == $prevId then .inProgress = false | .endedAt = $endedAt else . end)')
    fi
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

# Get the new prompts (starting from LAST_PROMPT_COUNT)
NEW_PROMPTS=$(echo "$FILTERED_PROMPTS" | jq ".[$LAST_PROMPT_COUNT:]" 2>/dev/null)

# Capture current git state
GIT_HASH=$(git rev-parse HEAD 2>/dev/null || echo "")

# Load previous git state to calculate incremental changes
PREV_STATE="{}"
if [ -f "$LAST_GIT_STATE_FILE" ]; then
    PREV_STATE=$(cat "$LAST_GIT_STATE_FILE" 2>/dev/null || echo "{}")
fi

# Get all currently changed files
ALL_CHANGED_FILES=$(git diff --name-only 2>/dev/null || echo "")

# Build current state: map of file -> checksum
CURRENT_STATE="{}"
if [ -n "$ALL_CHANGED_FILES" ]; then
    while IFS= read -r file; do
        if [ -f "$REPO_DIR/$file" ]; then
            # Calculate checksum of current file content
            CHECKSUM=$(git hash-object "$REPO_DIR/$file" 2>/dev/null || echo "")
            if [ -n "$CHECKSUM" ]; then
                CURRENT_STATE=$(echo "$CURRENT_STATE" | jq --arg file "$file" --arg sum "$CHECKSUM" '. + {($file): $sum}')
            fi
        fi
    done <<< "$ALL_CHANGED_FILES"
fi

# Identify newly changed files (files that are new or have different checksums)
NEW_CHANGED_FILES=""
if [ "$PREV_STATE" = "{}" ]; then
    # First run - all changed files are new
    NEW_CHANGED_FILES="$ALL_CHANGED_FILES"
else
    # Compare current state with previous state
    while IFS= read -r file; do
        if [ -z "$file" ]; then
            continue
        fi
        CURRENT_SUM=$(echo "$CURRENT_STATE" | jq -r --arg file "$file" '.[$file] // ""')
        PREV_SUM=$(echo "$PREV_STATE" | jq -r --arg file "$file" '.[$file] // ""')

        # Include file if it's new or checksum changed
        if [ "$CURRENT_SUM" != "$PREV_SUM" ]; then
            if [ -z "$NEW_CHANGED_FILES" ]; then
                NEW_CHANGED_FILES="$file"
            else
                NEW_CHANGED_FILES="$NEW_CHANGED_FILES"$'\n'"$file"
            fi
        fi
    done <<< "$ALL_CHANGED_FILES"
fi

# Generate diff only for newly changed files
if [ -z "$NEW_CHANGED_FILES" ]; then
    GIT_DIFF=""
    CHANGED_FILES_RAW=""
    FILES_ARRAY="[]"
else
    # Create array of files for git diff
    FILE_ARGS=""
    while IFS= read -r file; do
        if [ -n "$file" ]; then
            FILE_ARGS="$FILE_ARGS $file"
        fi
    done <<< "$NEW_CHANGED_FILES"

    # Generate diff only for these files
    GIT_DIFF=$(git diff -- $FILE_ARGS 2>/dev/null || echo "")
    CHANGED_FILES_RAW="$NEW_CHANGED_FILES"
    FILES_ARRAY=$(echo "$NEW_CHANGED_FILES" | jq -R -s 'split("\n") | map(select(length > 0))')
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

LATEST_PROMPT=$(echo "$NEW_PROMPTS" | jq -r '.[-1]' 2>/dev/null)
if [ -z "$LATEST_PROMPT" ] || [ "$LATEST_PROMPT" = "null" ]; then
    LATEST_PROMPT=""
fi

# Update sessions.json with the latest prompt changes
if [ "$NEW_ENTRIES" != "[]" ]; then
    UPDATED_SESSIONS=$(echo "$SESSIONS_JSON" | jq \
        --arg id "$SESSION_ID" \
        --arg repoRoot "$REPO_DIR" \
        --arg branch "$BRANCH" \
        --arg timestamp "$TIMESTAMP" \
        --arg prompt "$LATEST_PROMPT" \
        --arg hash "$GIT_HASH" \
        --argjson files "$FILES_ARRAY" \
        --argjson diff "$ESCAPED_DIFF" \
        --argjson newEntries "$NEW_ENTRIES" \
        '
        def merge_files(existing; incoming):
          reduce incoming[] as $item (existing; if index($item) then . else . + [$item] end);
        def prompt_count(entries):
          entries | length;
        def response_snippet(entries):
          "Interactive session: " + (prompt_count(entries) | tostring) + " prompt" + (if prompt_count(entries) != 1 then "s" else "" end);
        def update_session(session):
          session
          | .provider = "codex"
          | .repoRoot = $repoRoot
          | .branch = $branch
          | .prompt = $prompt
          | .diff = $diff
          | .mode = "interactive"
          | .autoTagged = true
          | .inProgress = true
          | .updatedAt = $timestamp
          | .files = merge_files((.files // []); $files)
          | .perPromptChanges = ((.perPromptChanges // []) + $newEntries)
          | .responseSnippet = response_snippet(.perPromptChanges);
        if map(.id == $id) | any then
          map(if .id == $id then
                update_session(.)
                | if (.createdAt // "") == "" then .createdAt = $timestamp else . end
                | if (.preHash // "") == "" then .preHash = $hash else . end
                | .postHash = (.postHash // null)
              else . end)
        else
          [ {
              id: $id,
              provider: "codex",
              repoRoot: $repoRoot,
              branch: $branch,
              preHash: $hash,
              postHash: null,
              prompt: $prompt,
              responseSnippet: response_snippet($newEntries),
              files: $files,
              diff: $diff,
              createdAt: $timestamp,
              updatedAt: $timestamp,
              mode: "interactive",
              autoTagged: true,
              inProgress: true,
              perPromptChanges: $newEntries
            } ] + .
        end
        ')

    echo "$UPDATED_SESSIONS" > "$SESSIONS_FILE"

    # Update last prompt count
    echo "$CURRENT_PROMPT_COUNT" > "$LAST_PROMPT_FILE"

    # Save current git state for next incremental diff
    echo "$CURRENT_STATE" > "$LAST_GIT_STATE_FILE"
fi

# Clean up
rm -f "$TEMP_PROMPTS_FILE"

exit 0
