# OPERATING-CLAUDE-CODE.md — running this project autonomously

How to drive both repos with Claude Code on Pro, monitor from the
mobile app, integrate with your existing VS Code Remote-SSH workflow,
and stay inside the budget.

This document is referenced from `README.md` and both `CLAUDE.md` files.
Copy it into each repo's `docs/` folder so Claude Code can read it
from inside its workspace.

## 1. Prerequisites

### Account and auth

- **Plan:** Anthropic Pro ($20/mo), with usage credits enabled and
  monthly overflow cap set to your chosen ceiling (you have $100/mo).
- **Auth:** claude.ai OAuth. **Not** an API key — Remote Control
  rejects API-key auth.
- **Mobile app:** Claude app installed on phone, signed in with the
  same account.

### Versions

- Claude Code v2.1.110 or later (for mobile push notifications).
  Verify: `claude --version`.
- Update: `npm install -g @anthropic-ai/claude-code@latest`.

### One-time configuration

In any `claude` session:

```
/config
```

Set:
- **Enable Remote Control for all sessions** → `true`
- **Push when Claude decides** → `true`

These two flags mean every `claude` invocation is mobile-monitorable
by default, with push notifications when Claude finishes or needs you.

## 2. Project topology

Two repos as siblings under `~/unified-serial-terminal/`:

```
~/unified-serial-terminal/
├── ftdi-webusb-driver/   ← library (TDD, pure-function-heavy)
└── terminal-app/         ← Vue 3 + Vite browser terminal
```

A `claude` session runs **inside one repo at a time**. To work on both
in parallel, open two terminals (e.g. via `tmux` so they survive
disconnection), one in each repo.

## 3. One session per repo, not one for both

This project has two repos as siblings under `~/unified-serial-terminal/`. Technically
you can start Claude Code from the parent directory and have it see both
as subdirectories. **Don't.** The pattern that works is one
`claude --remote-control` session per repo, opened only when that repo
actually needs work.

### Why two separate sessions

Each `CLAUDE.md` was written as the project memory for *its repo*.
Reading two of them as siblings in one session forces Claude Code to
constantly arbitrate which set of conventions applies to the current
edit — wrong scope prefix on commits, tests written in the wrong style,
dependencies installed in the wrong `package.json`. The arbitration also
burns tokens and produces drift across phases.

Two sessions also isolate git blast radius. One session in a parent
directory is in one git state at a time but managing two repos; a
failed merge or dirty worktree on one side can leave both repos in a
half-state. Two sessions, each in its own repo, can't do that.

### The dependency graph between repos

Library work goes first because the terminal-app's Phase 3 (WebUSB
backend) imports `FtdiUart` from the library. Until the library has
exported a usable `FtdiUart` — its Phase 6 — the terminal-app can't
exercise the WebUSB path even with a stub.

```
ftdi-webusb-driver:  0 → 1 → 2 → 3 → 4 → 5 → 6 ──────────→ 7 → 8 → 9 → 10
                                                │
                                                ↓ FtdiUart usable
terminal-app:                                   0 → 1 → 2 → 3 → 4 → 5 → 6
                                                            │
                                                            ↓ needs library Phase 6
```

Concretely:

- **Library Phases 0–6 run before any terminal-app work.** Phases 1–4
  are pure-function TDD, fast and cheap. Phase 5 builds the mock,
  Phase 6 produces the `FtdiUart` class — the API surface the
  terminal-app needs.
- **Terminal-app Phases 0–2 can start once library Phase 6 lands**, in
  parallel with library Phases 7–8. Terminal-app Phase 2 only touches
  Web Serial, so no library dependency yet.
- **Terminal-app Phase 3** needs library Phase 6 done (which it is) and
  ideally Phase 7 (read/write) so the WebUSB backend has something
  useful to demonstrate.
- **Library Phase 9 (hardware-in-loop)** can run alongside terminal-app
  Phases 3–5 if you have hardware time.
- **Library Phase 10 (release) and terminal-app Phase 6 (deploy)** can
  close out in either order.

Until library Phase 6 lands, **only one session needs to exist** — the
library one. Don't open a terminal-app session prematurely; that's two
concurrent Pro-plan sessions burning the same shared 5-hour quota for
no reason.

### The tmux pattern

Use `tmux` so the sessions survive SSH drops. Naming the windows after
the repo makes the mobile app session list readable at a glance.

```bash
# Session 1 — library work (start this first)
tmux new -s lib
cd ~/unified-serial-terminal/ftdi-webusb-driver
claude --remote-control "ftdi-webusb-driver"
# detach with Ctrl-B d; reattach later with: tmux a -t lib

# Session 2 — terminal-app work (start only after library Phase 6 lands)
tmux new -s app
cd ~/unified-serial-terminal/terminal-app
claude --remote-control "terminal-app"
# detach with Ctrl-B d; reattach with: tmux a -t app
```

Both sessions appear in the Claude mobile app's **Code** tab under the
names you passed to `--remote-control`. Push notifications tell you
which session needs attention. You can drive either from the phone, the
VS Code panel, or claude.ai/code — see §6 for the multi-surface workflow
with VS Code Remote-SSH.

### When concurrent sessions make sense

After library Phase 6 lands and you're working on library Phase 7+
alongside terminal-app Phase 0–3, two concurrent sessions are correct.
They share the Pro plan's 5-hour quota, so coordinate the heavy phases:
don't run library Phase 8 (streams, complex) and terminal-app Phase 4
(backend selector UI, also complex) in the same window. Stagger them so
one is light/idle while the other consumes the budget, or run them in
separate windows.

## 4. Launching a phase

The standard pattern:

```bash
cd ~/unified-serial-terminal/ftdi-webusb-driver
claude --remote-control "ftdi-webusb-driver Phase N"
```

At the prompt, give Claude exactly one phase to do:

> Read CLAUDE.md and PLAN.md. Then execute Phase N from
> docs/phases/PHASE-NN-*.md end-to-end, committing as you go per the
> conventions in CLAUDE.md. Stop and ask only if a step genuinely
> needs my decision; otherwise proceed autonomously.

Scan the QR code on your phone (or open the displayed URL in any
browser). The session is now visible from three surfaces
simultaneously:

1. The terminal where you launched it (locally on the VM, or via SSH)
2. The Claude mobile app, **Code** tab
3. `https://claude.ai/code` in any browser

All three stay in sync. You can type from any of them. Push
notifications land on your phone when Claude finishes a phase or
needs a decision.

## 5. Scheduling a session to start later

You may want a phase to begin at a specific time — after a Pro plan
5-hour window resets, or overnight to hit off-peak token rates. The
Debian-native tool is `at` (one-off) or systemd-timer (recurring).

**The naive approach does not work.** Scheduling the whole launch —
`at` fires `claude --remote-control "do Phase N"` — fails the first
time Claude Code touches a directory, because it stops on the one-time
**"Do you trust the files in this folder?"** prompt before it ever
reaches the point where it accepts your phase instruction. Your
scheduled prompt gets typed into the trust dialog and discarded; you
wake to an idle, untrusted session that did nothing.

### The pattern that works: split interactive setup from scheduled work

Do the fragile interactive part (trust approval) by hand, now. Schedule
only the prompt injection into the already-running, already-trusted
session.

```bash
# NOW, interactively — clear the trust prompt under your supervision:
tmux new -s app -c ~/unified-serial-terminal/terminal-app   # or: tmux attach -t app
claude --remote-control --permission-mode auto
# → approve the "trust this folder?" prompt
# → wait until the normal input prompt appears
# → do NOT type the phase prompt yet
# → Ctrl-B d to detach, leaving claude running and idle

# Schedule ONLY the prompt injection for after the window resets:
at 02:15 <<'EOF'
tmux send-keys -t app 'Read CLAUDE.md, docs/OPERATING-CLAUDE-CODE.md (especially §3 and §8), and PLAN.md. Sibling repo ~/unified-serial-terminal/ftdi-webusb-driver has Phases 1-8 complete; treat its FtdiUart API as available. Execute Phase 0 from PLAN.md end-to-end, committing per the conventions in CLAUDE.md. Read zaxbux/web-serial-console as reference before writing code. Stop and ask only if a step needs my decision. When the Phase 0 acceptance checklist passes, run /usage and exit.' Enter
EOF
atq
```

At 02:15 the prompt drops into a session that's already trusted and
waiting at its input line. Claude reads it and starts. Clean.

### Why this is safe on the budget

- **An idle session burns zero tokens.** Sitting at the prompt costs
  nothing; tokens are spent only when Claude is processing. Pre-starting
  now and idling until reset is free against quota.
- **Clearing the trust prompt costs near-zero tokens.** You're not
  sending a work prompt yet, so the current (nearly-exhausted) window
  isn't meaningfully touched.

### The one real risk: idle-session survival

If the machine is awake but can't reach Anthropic for ~10 minutes, the
session times out and exits (see §10). An idle Remote Control session
*should* stay alive as long as the network holds — it's connected, just
not working — but a multi-hour idle gap is the failure window to watch.
If the session has died by 02:15, `send-keys` types into a dead pane and
nothing happens.

Mitigations:
- Keep the idle gap short. Under ~2 hours is low-risk; a 6-hour gap is
  more exposed.
- Confirm it fired: check the mobile app or `tmux a -t app` shortly
  after the scheduled time. Don't assume; verify.

### `at` gotchas (each of these has bitten this project)

- **Time grammar takes one count + one unit, not two.** `at now + 1 hour
  55 minutes` → `Garbled time`. Use `at now + 115 minutes` or an absolute
  `at 02:15`.
- **`at` runs jobs under `/bin/sh` (dash on Debian), not bash.** Shebang
  lines in the heredoc are ignored. For the tmux-send-keys pattern this
  doesn't matter — the job only needs `tmux` (on the default PATH), and
  the actual `claude` work runs inside the tmux session's own bash. If
  you need bash for the job itself, wrap it: `bash -lc '...'`, or save a
  launcher script and `at` it with `bash ~/launch.sh`.
- **`atd` must be running:** `sudo systemctl enable --now atd`.
- **Inspect before trusting:** `at -c <jobnum>` dumps the exact script
  the job will run. Verify quoting survived.

### Canceling a scheduled job

```bash
atq                  # list jobs; first column is the job number
atrm <jobnum>        # remove one
atrm 2 3 4           # remove several
# wipe all your queued jobs:
atq | awk '{print $1}' | xargs -r atrm
```

### Permission mode for unattended runs

Use `--permission-mode auto` — the AI-classifier-driven mode. It
auto-approves actions it judges safe (the npm installs, file writes,
and commits a scaffold phase needs) and prompts only on genuinely risky
ones. Better than the blunt `acceptEdits` (too conservative — stalls on
every Bash call) or `bypassPermissions` (approves everything including
sudo, which with your `NOPASSWD: ALL` is a wide blast radius).

Caveat: because `auto` *can* still prompt on actions it deems risky, a
fully-unattended run could in principle stall on such a prompt — the
same class of problem as the trust prompt, an interactive gate with no
human present. For a scaffold phase (no sudo, no destructive ops) it's
unlikely. If you wake to a stalled session, that's probably the cause;
answer the prompt and it continues.

### Off-peak timing for the Pro plan (Sweden)

Peak-hour throttling is 5–11 AM Pacific on weekdays. Sweden is PT+9, so
peak maps to **14:00–20:00 Sweden time** on weekdays. Everything from
20:00 Sweden through the next morning is solidly off-peak — the lowest
burn multiplier. Schedule autonomous overnight phases for 22:00–06:00
Sweden time. Weekends have no peak-hour throttling at all.

### Worked example: hand off from a dying window to an overnight phase

The scenario this project actually hit — you've finished a phase, your
window resets in under two hours, and you want the next phase to run
overnight:

1. **Confirm the current repo is in a clean state** for the next phase:
   `git status` clean, `npm test` green, `npm run build` if a sibling
   repo depends on the output.
2. **Pre-start the next session and clear its trust prompt** (commands
   above). Detach, leaving it idle.
3. **Schedule the prompt injection** for ~5 minutes after the window
   reset time, so you're not racing the boundary.
4. **Verify**: `atq` shows the job; `at -c <n>` shows intact quoting;
   `tmux ls` shows the `app` session alive.
5. **Sleep.** Push notification fires when the session starts working.
6. **Morning**: check the phone notification, then `git log --oneline`
   in the repo to confirm the phase's commits landed as PLAN.md expects.

## 6. Combining with VS Code Remote-SSH

This is the workflow that adds zero overhead to what you're already
doing. Topology:

```
┌──────────────────────────────────┐
│  Laptop                          │
│  ├── VS Code (UI)                │
│  └── Claude mobile app (phone)   │
└──────────────┬───────────────────┘
               │ Remote-SSH
               │ + Anthropic API (outbound HTTPS, mobile push)
               ↓
┌──────────────────────────────────┐
│  Lab VM (~/unified-serial-terminal)            │
│  ├── VS Code Server              │
│  ├── Claude Code extension       │   ← installed on REMOTE, not local
│  ├── claude process              │   ← spawned by extension or terminal
│  └── repos: ftdi-webusb-driver,  │
│            terminal-app          │
└──────────────────────────────────┘
```

### Setup

1. Open VS Code on the laptop. Use the **Remote - SSH** extension to
   connect to the lab VM and open `~/unified-serial-terminal/ftdi-webusb-driver/`
   (or `terminal-app/`) as a workspace.
2. Install the **Claude Code** VS Code extension. When VS Code asks
   where to install it, choose **Install on SSH: \<your-vm-host\>**.
   Installing locally would do nothing useful — the workspace, the
   files, and the `claude` CLI all live on the remote.
3. Open the Claude Code panel in VS Code (the side bar icon).
4. In the prompt box, type `/remote-control` or `/rc`.

A banner appears in the panel showing the connection status. Click
**Open in browser** to view the session at `claude.ai/code`, or find
it in the **Code** tab of your mobile app under the auto-generated
session name. (The VS Code command doesn't show a QR code — find the
session by name instead.)

### What this gives you

Four synced surfaces for one session running on the VM:

- **VS Code on the laptop** — the Claude extension panel, with full
  file context via Remote-SSH. Type prompts here while reading code.
- **Mobile app** — read-along, approve tool calls, type follow-ups
  while away from the desk.
- **Browser at claude.ai/code** — same as mobile, in a bigger window.
- **The terminal where you launched it**, if you started from
  `claude --remote-control` instead of `/remote-control` from inside
  VS Code.

You can switch between them mid-conversation. The Claude Code session
itself never moves — it stays on the lab VM the entire time,
preserving all local context (sudo, MCP servers, environment, network
position on `194.14.84.44`).

### The launch flavor that fits this workflow best

If you live in VS Code, start the session from VS Code's Claude panel
with `/rc`. That gives you the integrated panel for typing while
reading code, plus the synced mobile/web surfaces.

If you live in the terminal (which you do, given the rest of your
workflow), start with `claude --remote-control "..."`. That gives you
the terminal as the primary, with mobile and web as secondaries. You
can still pop open the panel in VS Code afterward and it'll join the
same session.

Either way is fine. They reach the same place.

## 7. Token-conserving habits

The biggest wins, in rough order of impact:

1. **One phase per launch.** Don't say "do Phases 0–3." Say "do
   Phase 0." When it finishes, `/usage`, decide. Phases are sized to
   be checkpoints exactly because of this.
2. **Plan mode for big phases.** Append `--permission-mode plan` to
   the launch command for the more involved phases (library 5, 6, 8;
   terminal-app 2, 4). Claude plans first, you approve, then it
   executes. Stops mid-phase wrong turns from burning tokens.
3. **Don't re-feed context.** Trust Claude Code's session memory.
   Pointing it at specific files when needed beats "and re-read
   everything to refresh."
4. **`/clear` between unrelated tasks.** Wiping context is free; paying
   to re-process irrelevant history is not.
5. **Sonnet by default.** Use Opus only when the task explicitly needs
   deeper reasoning. For TDD with known test vectors, Sonnet is
   indistinguishable in quality and 5× cheaper.
6. **`/usage` and `/context` are free.** Check them mid-session before
   asking Claude to tackle another sub-task.

## 8. Budget monitoring

### The numbers

On Pro:

- **5-hour rolling window:** ~44,000 tokens, shared across Claude
  Code, Claude.ai chat, and Cowork.
- **Weekly cap:** sits on top of the windows. Anthropic doesn't
  publish exact numbers and they've tightened it during 2026.
- **Peak hours:** 5–11 AM Pacific Time on weekdays burn faster
  (community-reported 1.3–1.5×).
- **Overflow:** with usage credits enabled, when both window and weekly
  cap are exhausted, you're billed at standard API rates. Your $100/mo
  overflow cap is the ceiling on this.

### Calibration: measured baseline (terminal-app Phase 0)

Don't guess what a phase costs — measure one, then project. This
project's measured baseline, from terminal-app Phase 0 (scaffold:
Vue + Vite + TS setup, xterm.js wiring, empty UI shell, tooling),
run unattended via scheduled launch in `auto` permission mode:

```
Total cost:           $1.37
API duration:         5m 18s        ← actual work
Wall duration:        3h 30m 54s    ← mostly idle (pre-started, waited for window)
Code changes:         355 added, 9 removed
Window used:          28% of the 5-hour window
Model split:          sonnet-4-6 did the work ($1.37);
                      haiku-4-5 trivial ($0.001)
Cache:                3.1M cache-read, 51.9k cache-write
```

Three lessons baked into these numbers:

1. **Idle time is free.** 5 minutes of API work inside a 3.5-hour
   wall-clock session — the rest was the session sitting at the prompt
   waiting for the scheduled injection. Pre-starting a session and
   letting it idle until the window resets costs nothing (confirms the
   §5 scheduling pattern is budget-safe).
2. **Caching dominates the economics.** 3.1M cache-read tokens vs 754
   fresh input tokens. Cache reads are ~10% the price of fresh input,
   which is why a phase touching this much context still only cost
   $1.37. Don't fear large context per se — fear *uncached* large
   context (see lesson 3).
3. **Watch the >150k context flag.** `/usage` reported 42% of usage was
   at >150k context. A scaffold phase shouldn't live above 150k; it got
   there from loading the planning docs + zaxbux reference reading +
   sibling-repo context and keeping it all resident. Tolerable for
   Phase 0, but it's the lever that bites on bigger phases. `/compact`
   mid-phase and `/clear` between phases keep it down.

### Projection from the measured baseline

Scaffold (Phase 0) is the light end. Applying the relative weights:

| Phase (terminal-app)            | Weight | Window % | Est. cost |
|---------------------------------|--------|----------|-----------|
| 0 — scaffold                    | base   | 28%      | $1.37 (measured) |
| 1 — SerialBackend interface     | ~1×    | ~28%     | ~$1.40    |
| 2 — Web Serial backend + wiring | ~2×    | ~50%     | ~$2.70    |
| 3 — WebUSB+FTDI backend         | ~2×    | ~50%     | ~$2.70    |
| 4 — backend selector UI         | ~2×    | ~50%     | ~$2.70    |
| 5 — settings + auto-reconnect   | ~2×    | ~50%     | ~$2.70    |
| 6 — release / deploy            | ~1.5×  | ~40%     | ~$2.00    |

Terminal-app Phases 1–6 total ≈ **$14 across ~4–5 windows** if you give
each heavy phase (2–5) its own window and batch the light ones (0, 1).
Comfortably inside the $100/mo overflow cap — and most of it draws from
the Pro subscription quota before overflow billing ever engages.

For the library (`ftdi-webusb-driver`), the same scaffold baseline
applies to its Phase 0, with the pure-function phases (1–4) near 1×,
the composition/stream phases (5–8) at 2–3×, and Phase 9
(hardware-in-loop) unpredictable — gate it specifically.

### The weekly cap is the real constraint, not dollar cost

After library Phases 1–8 *and* terminal-app Phase 0, the weekly meter
read **44% used**. The dollar cost is trivial against $100/mo; the
weekly cap is what actually paces the work. Watch the second `/usage`
bar ("Current week, all models"), not the cost figure. When it resets
weekly you get a fresh budget; if it tightens mid-week, overflow billing
engages regardless of remaining 5-hour windows.

### Signals that say "switch from Pro to Max 5x"

Don't pay overflow if you're hitting it often. Max 5x is $100/mo flat
for 5× the subscription quota with no overflow billing stress.

Switch to Max 5x if any of these happen:

- You spend >$80/month of the $100 overflow cap for two consecutive months
- You hit the weekly cap and have overflow-billed work for the rest of the week, twice
- Peak-hour throttling consistently disrupts your morning routine

Switch to Max 20x ($200/mo) only if Max 5x also chronically saturates
— unlikely for this project unless you're running both repos in
parallel during heavy phases.

### Signals that say "stop and re-think"

If you find yourself doing any of these, stop and consider the
project's structure, not just the budget:

- One phase burning more than a full 5-hour window: the phase is too
  big. Split it.
- Claude re-reading the same docs every few turns: the conversation
  history isn't cleared properly. `/clear` and restart with a tighter
  prompt.
- Tests are passing but the phase keeps going: you forgot to say
  "stop when acceptance checklist passes."
- $100 overflow burned in less than 10 days: something is wrong;
  audit `/usage` history before continuing.

### What `/usage` shows

Inside any session, `/usage` reports more than just window tokens:

- **Total cost** and **API vs wall duration** for the session (the gap
  between them is idle time, which is free)
- **Code changes** (lines added/removed)
- **Per-model breakdown** with input/output/cache-read/cache-write
  tokens and per-model cost — useful for spotting if Opus crept in
  where Sonnet would do
- **Current session bar** — % of the 5-hour window used, with reset time
- **Current week bar** — % of the weekly cap used (all models), with
  reset date. *This is the bar that actually paces the work.*
- **Context-size attribution** — e.g. "42% of your usage was at >150k
  context," a direct prompt to `/compact` mid-task and `/clear` between
  tasks

The weekly bar is the one to watch. The signal that the weekly cap (not
the 5-hour window) is your binding constraint is "the week bar climbs
fast even though individual sessions feel cheap."

## 9. Programmatic usage monitoring (not yet available)

You may have wondered — couldn't Claude Code check `/usage` itself
before starting an expensive phase, and gate its own work on remaining
budget? As of May 2026, **no**, and you shouldn't build the workaround.

### Current state

There's no `claude usage --json`, no public Anthropic Admin API
endpoint exposing Pro/Max subscription usage, and no documented way
for Claude Code (the agent) to query its own remaining quota. `/usage`
renders to the interactive TUI only — slash commands are interpreted
by the TUI host, not exposed as agent-callable tools.

This is a known gap with multiple open feature requests on the public
Claude Code repo:

- **#40793** — `claude usage --json` for programmatic access
- **#44328** — `claude usage` command / Admin API for subscription limits
- **#16629** — Programmatic access to usage data for scheduled automation
- **#8412** — Include usage data in status line JSON input

Track these. When `claude usage --json` ships, update this section and
add a pre-phase budget check to the launch pattern in §4.

### Workarounds that exist (don't build them)

- **Parse the TUI status bar via pty wrapper** — technically works,
  fragile, breaks on every Claude Code release.
- **Run a known cheap `claude -p` request and inspect headers** —
  unreliable and burns tokens to measure tokens.
- **Status line hook with custom script** — receives session context
  but not usage data (see #8412).

The cost-of-maintenance versus quality-of-signal is poor across all
three. Use manual `/usage` at phase boundaries (§8) instead.

### Important upcoming change: June 15, 2026

Starting **June 15, 2026**, Agent SDK and `claude -p` (headless mode)
usage on subscription plans draws from a new monthly Agent SDK credit
pool, separate from interactive usage limits.

This **does not** affect the `claude --remote-control` workflow this
project uses — Remote Control is an interactive session, just monitored
remotely. But it changes the equation if we ever shift toward `claude -p`
headless automation (cron-style nightly jobs, CI hooks). At that point,
we'd have two budget buckets to track instead of one, and the
recommendation in §8 would need to fork by execution mode.

If you ever introduce headless automation to this project:
- Re-read this section and check whether the official `claude usage`
  command has shipped by then
- Update §8 to cover both interactive and Agent SDK budgets separately
- Reference current Anthropic docs at https://docs.claude.com/en/api/agent-sdk
  for the latest credit-pool figures

### When the official feature ships

The integration pattern, once `claude usage --json` exists, will look
roughly like:

```bash
# Pre-phase budget check before launching
USAGE=$(claude usage --json)
REMAINING=$(echo "$USAGE" | jq '.current_session.tokens_remaining')
if [ "$REMAINING" -lt 20000 ]; then
  echo "Less than 20k tokens left in window — postpone phase."
  exit 1
fi
```

Or wired into Claude Code itself via a tool the agent can call before
expensive operations. When that lands, update §4 to include the
pre-phase check in the standard launch pattern, and add a corresponding
slash command or hook the agent can invoke mid-conversation.

## 10. Troubleshooting Remote Control

### "Remote Control requires a claude.ai subscription"

You're authenticated with an API key (likely via `ANTHROPIC_API_KEY`
env var) or a Console account. Fix:

```bash
unset ANTHROPIC_API_KEY      # remove if set
claude
# /logout
# /login → choose "claude.ai"
```

Check `~/.bashrc`, `~/.zshrc`, `/etc/environment`, and any project
`.env` files for stale `ANTHROPIC_API_KEY` exports — they override
CLI auth silently.

### "Remote Control is not yet enabled for your account"

Usually caused by one of these env vars:

- `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`
- `DISABLE_TELEMETRY`
- `CLAUDE_CODE_USE_BEDROCK` / `_VERTEX` / `_FOUNDRY`

Unset any that are present and try again.

### Session times out after ~10 minutes of no network

This is the documented behavior: if the VM is awake but can't reach
the Anthropic API for ~10 minutes, the session exits. Re-launch with
`claude --remote-control` to start a new one. Conversation state is
preserved across reconnects as long as the network outage is shorter
than 10 minutes.

### Mobile app shows "No mobile registered"

Open the Claude app on your phone once so it can refresh its push
token. The warning clears the next time Remote Control connects.

### Push notifications not arriving on iOS

Check **Settings → Notifications → Claude**. Focus modes and
notification summaries can suppress or delay them.

### Push notifications not arriving on Android

Aggressive battery optimization delays delivery. Exempt the Claude
app from battery optimization in system settings.

### Peak-hour throttling

Weekdays 5–11 AM Pacific Time burn the 5-hour window 1.3–1.5× faster.
If your work schedule overlaps that window heavily, two options:

- Do exploration and planning work during peak (cheaper tokens), do
  the heavy phase execution outside peak.
- Switch to Max 5x or Max 20x, which have less throttling pressure.

### Weekly cap hit

When the weekly cap is reached, the 5-hour window stops mattering —
you're paying overflow API rates regardless. If this happens in the
middle of a project week:

1. Check overflow remaining (Anthropic console)
2. Decide whether to continue on overflow or pause until Monday
3. If overflow is approaching the $100 cap, **stop**. Don't let it
   hit the cap mid-phase; you'll have a half-done branch you can't
   merge until next week.

## 11. The maintenance principle applies here too

This document, like the rest of the planning docs, is not write-once.
As you accumulate experience operating Claude Code on this project:

- If a tactic works better than what's documented, update this doc.
- If a Remote Control failure mode bites you that isn't in §10, add it.
- If you switch plans (Pro → Max 5x → Max 20x) or change the overflow
  cap, note when and why so future-you remembers the reasoning.

Commit message: `docs(ops): update OPERATING-CLAUDE-CODE based on real usage`.

## 12. Known tool hazards — lessons from real incidents

### typedoc `"out"` set to `"."` destroys the project (2026-06-01)

**What happened:** During Phase 10, `typedoc-plugin-markdown` v4+ was run
with `"out": "."` in `typedoc.json`. The plugin cleans its output directory
before generating docs. With the output directory set to the project root, it
deleted the entire working tree — `src/`, `.git/`, `node_modules/`,
`docs/`, config files, everything — then wrote markdown there. Recovery
required a fresh `git clone` from the remote.

**Rule:** Never set `"out"` (or any equivalent "clean before writing" output
path) to `.`, `..`, or any ancestor of the project source. Always use a
dedicated leaf directory (`"out": "docs-out"`, `"out": "generated"`, etc.).
Add that directory to `.gitignore` so the generated files are not committed.

**Applies to:** typedoc, typedoc-plugin-markdown, any static-site generator
or doc tool that advertises a "clean output directory" step (VuePress, VitePress
in SSG mode, Storybook build, etc.).

**Before running any `npm run docs` or `build` script for the first time:**
inspect what the script actually calls, check the configured output path in
the tool's config file, and confirm it points at a subdirectory that does not
contain source files or a `.git/` directory.

## 13. Quick reference

```bash
# Update Claude Code
npm install -g @anthropic-ai/claude-code@latest

# Check version (need 2.1.110+ for push notifications)
claude --version

# One-time config (inside any session)
/config
# → Enable Remote Control for all sessions: true
# → Push when Claude decides: true

# Launch a phase (terminal)
cd ~/unified-serial-terminal/ftdi-webusb-driver
claude --remote-control "Phase N name"

# Launch a phase (VS Code panel via Remote-SSH)
# 1. Open workspace via Remote-SSH
# 2. Open Claude Code panel
# 3. /rc

# Check budget mid-session
/usage
/context

# Plan mode for risky/big phases
claude --remote-control --permission-mode plan "Phase N name"

# Autonomous unattended run (AI-classifier permission mode)
claude --remote-control --permission-mode auto "Phase N name"

# Schedule a phase for later (split pattern: pre-start, then inject prompt)
#   1. Now, interactively — clear the trust prompt, then detach:
tmux new -s app -c ~/unified-serial-terminal/terminal-app
claude --remote-control --permission-mode auto   # approve trust, Ctrl-B d
#   2. Schedule only the prompt injection:
at 02:15 <<'SCHED'
tmux send-keys -t app 'Read CLAUDE.md and PLAN.md, execute Phase N end-to-end...' Enter
SCHED
atq                 # list scheduled jobs
at -c <jobnum>      # inspect a job before trusting it
atrm <jobnum>       # cancel a job

# Reset context when changing topics
/clear

# End session cleanly
/exit
```
