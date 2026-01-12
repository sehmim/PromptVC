#!/bin/bash
# Debug script to see what codex provides to notify hooks

LOG_FILE="/tmp/codex-notify-debug.log"

echo "=== Codex Notify Called ===" >> "$LOG_FILE"
echo "Date: $(date)" >> "$LOG_FILE"
echo "PWD: $PWD" >> "$LOG_FILE"
echo "Arguments: $@" >> "$LOG_FILE"
echo "PATH: $PATH" >> "$LOG_FILE"
echo "which git: $(command -v git 2>/dev/null || echo 'missing')" >> "$LOG_FILE"
echo "which jq: $(command -v jq 2>/dev/null || echo 'missing')" >> "$LOG_FILE"
if [ ! -t 0 ]; then
    PAYLOAD=$(cat)
    if [ -n "$PAYLOAD" ]; then
        echo "Payload: $PAYLOAD" >> "$LOG_FILE"
    else
        echo "Payload: (empty)" >> "$LOG_FILE"
    fi
else
    echo "Payload: (tty)" >> "$LOG_FILE"
fi
echo "Environment:" >> "$LOG_FILE"
env | grep -i codex >> "$LOG_FILE" 2>&1 || echo "No CODEX env vars" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

# List codex session directory
if [ -d "$HOME/.codex/sessions" ]; then
    echo "Latest session files:" >> "$LOG_FILE"
    ls -lt "$HOME/.codex/sessions" | head -5 >> "$LOG_FILE"
fi

echo "---" >> "$LOG_FILE"
