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

Two repos as siblings under `~/FPGA_work/`:

```
~/FPGA_work/
├── ftdi-webusb-driver/   ← library (TDD, pure-function-heavy)
└── terminal-app/         ← Vue 3 + Vite browser terminal
```

A `claude` session runs **inside one repo at a time**. To work on both
in parallel, open two terminals (e.g. via `tmux` so they survive
disconnection), one in each repo.

## 3. One session per repo, not one for both

This project has two repos as siblings under `~/FPGA_work/`. Technically
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
cd ~/FPGA_work/ftdi-webusb-driver
claude --remote-control "ftdi-webusb-driver"
# detach with Ctrl-B d; reattach later with: tmux a -t lib

# Session 2 — terminal-app work (start only after library Phase 6 lands)
tmux new -s app
cd ~/FPGA_work/terminal-app
claude --remote-control "terminal-app"
# detach with Ctrl-B d; reattach with: tmux a -t app
```

Both sessions appear in the Claude mobile app's **Code** tab under the
names you passed to `--remote-control`. Push notifications tell you
which session needs attention. You can drive either from the phone, the
VS Code panel, or claude.ai/code — see §5 for the multi-surface workflow
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
cd ~/FPGA_work/ftdi-webusb-driver
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

## 5. Combining with VS Code Remote-SSH

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
│  Lab VM (~/FPGA_work)            │
│  ├── VS Code Server              │
│  ├── Claude Code extension       │   ← installed on REMOTE, not local
│  ├── claude process              │   ← spawned by extension or terminal
│  └── repos: ftdi-webusb-driver,  │
│            terminal-app          │
└──────────────────────────────────┘
```

### Setup

1. Open VS Code on the laptop. Use the **Remote - SSH** extension to
   connect to the lab VM and open `~/FPGA_work/ftdi-webusb-driver/`
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

## 6. Token-conserving habits

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

## 7. Budget monitoring

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

### Calibration: measure before projecting

Don't guess what a phase will cost. Measure. The first time you run
Claude on this project:

1. Run `/usage` before launching anything. Note the figures.
2. Execute **Phase 0 of `ftdi-webusb-driver`** (project bootstrap —
   small, well-bounded, mostly file creation and tooling installs).
3. Run `/usage` again immediately after.

The delta is your baseline. From it, project:

- Phases 1–4 of the library (pure-function TDD) ≈ Phase 0 to 1.5×
- Phases 5–8 of the library (composition, streams) ≈ 2–3× Phase 0
- Phase 9 (hardware-in-loop) is unpredictable; gate it specifically
- Terminal-app phases scale similarly: 0, 1 are cheap; 2, 4, 5 are
  heavier

If Phase 0 consumed >30% of a 5-hour window, expect most other phases
to need their own dedicated window. If <15%, you can batch 2–3 small
phases per window.

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

Inside any session, `/usage` reports:

- Tokens used in the current 5-hour window
- Tokens remaining
- Time until the window resets
- An approximate count of prompts you could still send (depends on
  prompt size, so treat as a hint)

The weekly cap isn't exposed in `/usage` directly. The signal is "you
keep running out of window quota before the 5 hours are up" — that
usually means the weekly cap is the actual constraint.

## 8. Programmatic usage monitoring (not yet available)

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
three. Use manual `/usage` at phase boundaries (§7) instead.

### Important upcoming change: June 15, 2026

Starting **June 15, 2026**, Agent SDK and `claude -p` (headless mode)
usage on subscription plans draws from a new monthly Agent SDK credit
pool, separate from interactive usage limits.

This **does not** affect the `claude --remote-control` workflow this
project uses — Remote Control is an interactive session, just monitored
remotely. But it changes the equation if we ever shift toward `claude -p`
headless automation (cron-style nightly jobs, CI hooks). At that point,
we'd have two budget buckets to track instead of one, and the
recommendation in §7 would need to fork by execution mode.

If you ever introduce headless automation to this project:
- Re-read this section and check whether the official `claude usage`
  command has shipped by then
- Update §7 to cover both interactive and Agent SDK budgets separately
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

## 9. Troubleshooting Remote Control

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

## 10. The maintenance principle applies here too

This document, like the rest of the planning docs, is not write-once.
As you accumulate experience operating Claude Code on this project:

- If a tactic works better than what's documented, update this doc.
- If a Remote Control failure mode bites you that isn't in §9, add it.
- If you switch plans (Pro → Max 5x → Max 20x) or change the overflow
  cap, note when and why so future-you remembers the reasoning.

Commit message: `docs(ops): update OPERATING-CLAUDE-CODE based on real usage`.

## 11. Quick reference

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
cd ~/FPGA_work/ftdi-webusb-driver
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

# Reset context when changing topics
/clear

# End session cleanly
/exit
```
