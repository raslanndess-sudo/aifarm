# skrpt auth hg

One-click bootstrap so any Claude Code session can drive Higgsfield through the
chrome-devtools MCP without you re-logging in.

## What it does

1. Starts Chrome with `--remote-debugging-port=9222` and a **persistent**
   `--user-data-dir` (`E:\Users\rasla\chrome-automation`) where Higgsfield
   cookies live.
2. Opens `https://higgsfield.ai/ai/image?model=nano-banana-2`.
3. Claude Code's chrome-devtools MCP (already configured for `localhost:9222`)
   automatically attaches — `mcp__chrome-devtools__list_pages` will show the
   Higgsfield tab.

If Chrome is already running on port 9222, the script just opens a new tab
instead of launching a second instance.

## Профили

- `start.bat` или `start.bat manual` — ручной профиль (MCP, порт 9222)
- `start.bat playwright` — автоматизация (Playwright, порт 9223)

Два профиля изолированы. Бан одного не затрагивает другой.
Первый запуск playwright-профиля требует ручной логин в Higgsfield.

## How to use

**Double-click** `start.bat`. That's it. Wait ~3 seconds.

Or from a terminal:

```bash
# CMD / Explorer — manual (default)
start.bat

# CMD — playwright profile
start.bat playwright

# PowerShell — manual
powershell -ExecutionPolicy Bypass -File start.ps1

# PowerShell — playwright
powershell -ExecutionPolicy Bypass -File start.ps1 -Profile playwright
```

## First-run only

The first time you launch Chrome with this user-data-dir, you are not logged in
to Higgsfield. Log in **once manually** in the Chrome window the script opened.
Cookies are stored in the user-data-dir and survive reboots — every subsequent
run starts already-logged-in.

If cookies expire (Higgsfield logs you out), repeat the manual login once.

## How the next Claude Code session uses it

After running `start.bat`:

1. Open Claude Code (this project or any other).
2. Ask Claude to drive Higgsfield. It will call:
   - `mcp__chrome-devtools__list_pages` → sees the Higgsfield tab
   - `mcp__chrome-devtools__select_page` → attaches
   - `mcp__chrome-devtools__navigate_page`, `take_snapshot`, `click`, etc.

Tell the new Claude:
> Higgsfield is already open in Chrome on port 9222 (skrpt auth hg / start.bat
> was run). Use chrome-devtools MCP. The working URL pattern is
> `https://higgsfield.ai/ai/image?model=<slug>`. Common slugs:
> `nano-banana-2`, `nano-banana-pro`, `seedream_v5_lite`, `soul-v2`.
> Video generator: `https://higgsfield.ai/ai/video?model=seedance_2_0`.
> The prompt textbox is a Lexical contenteditable div — `mcp__chrome-devtools__fill`
> works on it directly via uid; do NOT try to write to a `<textarea>`.

## Paths to edit if your setup differs

`start.bat` / `start.ps1` — top of file:

| Var | Default | Change if... |
|-----|---------|--------------|
| `CHROME` | `E:\Program Files\Google\Chrome\Application\chrome.exe` | Chrome installed elsewhere |
| `USERDATA` | `E:\Users\rasla\chrome-automation` | You want a different profile dir |
| `PORT` | `9222` | chrome-devtools MCP configured for a different port |
| `URL` | `…?model=nano-banana-2` | You want a different default landing page |

## Troubleshooting

- **"Chrome not found"** → fix the `CHROME` path in the script.
- **DevTools didn't respond in 15s** → Chrome is still loading; wait and retry.
  If it persists, check that port 9222 isn't blocked by another app.
- **Logged-out state every launch** → another Chrome instance with the same
  user-data-dir is already open and stole the lock. Close all Chrome windows
  using `chrome-automation` and rerun.
- **MCP says "no pages"** → Claude's chrome-devtools MCP is configured for a
  different port. Check `.claude/settings.local.json` or `.mcp.json` for the
  expected port and align with `PORT` in the script.
