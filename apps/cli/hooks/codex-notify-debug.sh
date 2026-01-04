#!/bin/bash
# Debug script to see what codex provides to notify hooks

LOG_FILE="/tmp/codex-notify-debug.log"

echo "=== Codex Notify Called ===" >> "$LOG_FILE"
echo "Date: $(date)" >> "$LOG_FILE"
echo "PWD: $PWD" >> "$LOG_FILE"
echo "Arguments: $@" >> "$LOG_FILE"
echo "Environment:" >> "$LOG_FILE"
env | grep -i codex >> "$LOG_FILE" 2>&1 || echo "No CODEX env vars" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

# List codex session directory
if [ -d "$HOME/.codex/sessions" ]; then
    echo "Latest session files:" >> "$LOG_FILE"
    ls -lt "$HOME/.codex/sessions" | head -5 >> "$LOG_FILE"
fi

echo "---" >> "$LOG_FILE"
