#!/bin/bash
# Spin up a 5-pane tmux session "team":
#   LEFT  (50% width, full height)   : PM agent — human types here
#   RIGHT (50% width, 4 equal rows)  : Frontend, Backend, Tester, Chat log
#
# Attach: tmux attach -t team
# Detach: Ctrl-b d
# Kill:   tmux kill-session -t team

set -e

PROJECT_DIR="/mnt/e/Users/rasla/Desktop/ai-video-platform"
AGENTS_DIR="$PROJECT_DIR/.claude/agents"
SESSION="team"

cd "$PROJECT_DIR"

# Reset chat log
: > "$AGENTS_DIR/chat.md"
echo "[$(date +%H:%M:%S)] [system] team session started" >> "$AGENTS_DIR/chat.md"

chmod +x "$AGENTS_DIR/say.sh" "$AGENTS_DIR/dispatch.sh" 2>/dev/null || true

# Surgical kill
tmux kill-session -t "$SESSION" 2>/dev/null || true

# ---- Create all 5 panes ----
tmux new-session -d -s "$SESSION" -c "$PROJECT_DIR"
tmux rename-window -t "$SESSION:0" "team"
PANE_PM=$(tmux list-panes -t "$SESSION:0" -F '#{pane_id}')

# Split right from PM → FE placeholder
PANE_FE=$(tmux split-window -h -P -F '#{pane_id}' -t "$PANE_PM" -c "$PROJECT_DIR")
# Stack 3 more panes below FE on the right side
PANE_BE=$(tmux split-window -v   -P -F '#{pane_id}' -t "$PANE_FE"   -c "$PROJECT_DIR")
PANE_TEST=$(tmux split-window -v -P -F '#{pane_id}' -t "$PANE_BE"   -c "$PROJECT_DIR")
PANE_CHAT=$(tmux split-window -v -P -F '#{pane_id}' -t "$PANE_TEST" -c "$PROJECT_DIR")

# Apply main-vertical: one big pane (PM) on left, rest stacked vertically on right
tmux set-window-option -t "$SESSION:0" main-pane-width 50%
tmux select-layout -t "$SESSION:0" main-vertical

# Record pane IDs for dispatch.sh
cat > "$AGENTS_DIR/panes.env" <<EOF
PANE_PM=$PANE_PM
PANE_FE=$PANE_FE
PANE_BE=$PANE_BE
PANE_TEST=$PANE_TEST
PANE_CHAT=$PANE_CHAT
EOF

# ---- Start processes ----

# Chat viewer
tmux send-keys -t "$PANE_CHAT" "clear && echo '=== TEAM CHAT LOG ===' && tail -f $AGENTS_DIR/chat.md" Enter

# Launch Claude in all 4 agent panes in parallel
tmux send-keys -t "$PANE_PM"   "clear && claude" Enter
tmux send-keys -t "$PANE_FE"   "clear && claude" Enter
tmux send-keys -t "$PANE_BE"   "clear && claude" Enter
tmux send-keys -t "$PANE_TEST" "clear && claude" Enter

# Wait for all 4 Claude instances to boot
sleep 10

# Send role init prompts
tmux send-keys -t "$PANE_FE"   "Прочитай .claude/agents/profiles/frontend.md и .claude/agents/README.md. Ты — Frontend agent. Жди задач от PM через этот терминал. Не пиши код без явной задачи." Enter
sleep 1
tmux send-keys -t "$PANE_BE"   "Прочитай .claude/agents/profiles/backend.md и .claude/agents/README.md. Ты — Backend agent. Жди задач от PM. Не пиши код без явной задачи." Enter
sleep 1
tmux send-keys -t "$PANE_TEST" "Прочитай .claude/agents/profiles/tester.md и .claude/agents/README.md. Ты — Tester agent. Жди задач от PM. Не пиши код и не запускай проверки без явной задачи." Enter
sleep 1
# PM last so workers are ready by the time it dispatches
tmux send-keys -t "$PANE_PM"   "Прочитай .claude/agents/profiles/pm.md, .claude/agents/README.md, AGENTS.md, STATUS.md. Ты — PM. Frontend/Backend/Tester уже ждут в других панелях tmux. Задачи раздаёшь через .claude/agents/dispatch.sh <role> \"<task>\". Ответы агентов смотри в .claude/agents/chat.md. После чтения профилей поздоровайся коротко и жди задачу от человека — ничего не делай до его сообщения." Enter

tmux select-pane -t "$PANE_PM"

cat <<EOF

====================================================
 Team session "team" launched.

   LEFT           $PANE_PM   PM  ← type your tasks here
   right row 1    $PANE_FE   Frontend
   right row 2    $PANE_BE   Backend
   right row 3    $PANE_TEST Tester
   right row 4    $PANE_CHAT Chat log (tail -f)

 Attach: tmux attach -t team
 Click PM pane (left), then type your goal.

 Chat log: $AGENTS_DIR/chat.md
====================================================
EOF
