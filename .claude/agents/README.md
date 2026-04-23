# Team coordination

A 4-role team working in one tmux session (`team`) plus a PM outside it.

## Roles

| Role | Where | Scope |
|---|---|---|
| **PM** | User's main Claude Code session (outside tmux) | Reads requirements, splits into tasks, dispatches, reviews. Does not write code. |
| **Frontend** | tmux `team:0.0` (top-left) | `src/components/**`, `src/app/**/page.tsx`, styles, client state |
| **Backend** | tmux `team:0.1` (top-right) | `src/app/api/**`, `src/lib/db*`, `schema.sql`, server logic |
| **Tester** | tmux `team:0.2` (bottom-left) | Test files, running `npx tsc --noEmit`, `npm test`, reporting results |
| **Chat viewer** | tmux `team:0.3` (bottom-right) | `tail -f chat.md` — live team log for the human |

## Communication channels

### PM → agent
PM sends a message straight to the agent's tmux pane via `tmux send-keys`. It appears on the agent's terminal as if the user typed it. That IS the task directive.

### Agent → PM (and everyone)
Each agent appends a line to `.claude/agents/chat.md` using:

```bash
.claude/agents/say.sh <role> <type> "<message>"
```

- `<role>` = `frontend` | `backend` | `tester`
- `<type>` = `status` | `done` | `blocked` | `ask` | `handoff`

Examples:
- `.claude/agents/say.sh frontend status "starting VideoCard component"`
- `.claude/agents/say.sh backend done "POST /api/videos ready at src/app/api/videos/route.ts"`
- `.claude/agents/say.sh tester blocked "tsc fails — VideoDTO.thumbnail is optional in backend but required in frontend"`
- `.claude/agents/say.sh frontend handoff "need VideoDTO type — please publish it at src/lib/types.ts"`

## Rules

1. **Agents don't freelance.** No code unless PM sent a directive.
2. **Stay in lane.** Frontend doesn't edit API, backend doesn't edit components, tester doesn't edit source.
3. **Announce every task.** On receiving a task → `say.sh <role> status "..."`. On finishing → `say.sh <role> done "..."`.
4. **Short chat messages.** One line when possible. Paths + filenames help PM verify fast.
5. **Blockers surface fast.** If stuck, `say.sh <role> blocked "..."` — don't loop silently.
