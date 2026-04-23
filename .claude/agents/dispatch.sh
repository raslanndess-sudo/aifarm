#!/bin/bash
# PM helper: send a task directly to an agent's tmux pane AND log it to chat.md.
# Runs inside WSL. Resolves pane IDs from panes.env (written by start_team.sh).
# Usage: dispatch.sh <role> "<task message>"
#   role: frontend | backend | tester
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
CHAT="$DIR/chat.md"
PANES_ENV="$DIR/panes.env"

if [ ! -f "$PANES_ENV" ]; then
    echo "panes.env not found — run start_team.sh first" >&2
    exit 1
fi

# shellcheck disable=SC1090
source "$PANES_ENV"

ROLE="$1"
shift
MSG="$*"

if [ -z "$ROLE" ] || [ -z "$MSG" ]; then
    echo "Usage: dispatch.sh <role> \"<message>\"" >&2
    exit 1
fi

case "$ROLE" in
    frontend) PANE="$PANE_FE" ;;
    backend)  PANE="$PANE_BE" ;;
    tester)   PANE="$PANE_TEST" ;;
    *) echo "Unknown role: $ROLE (frontend|backend|tester)" >&2; exit 1 ;;
esac

printf '[%s] [pm → %s] %s\n' "$(date +%H:%M:%S)" "$ROLE" "$MSG" >> "$CHAT"
tmux send-keys -t "$PANE" "$MSG" Enter

echo "(sent to $ROLE @ $PANE)"
