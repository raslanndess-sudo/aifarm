#!/bin/bash
# Appends a line to the team chat log.
# Usage: say.sh <role> <type> "<message>"
#   role: frontend | backend | tester | pm
#   type: status | done | blocked | ask | handoff
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
CHAT="$DIR/chat.md"

ROLE="$1"
TYPE="$2"
shift 2
MSG="$*"

if [ -z "$ROLE" ] || [ -z "$TYPE" ] || [ -z "$MSG" ]; then
    echo "Usage: say.sh <role> <type> \"<message>\"" >&2
    echo "  role: frontend | backend | tester | pm" >&2
    echo "  type: status | done | blocked | ask | handoff" >&2
    exit 1
fi

printf '[%s] [%s] [%s] %s\n' "$(date +%H:%M:%S)" "$ROLE" "$TYPE" "$MSG" >> "$CHAT"
echo "(posted to chat)"
