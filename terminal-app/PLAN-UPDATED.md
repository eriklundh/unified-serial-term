# PLAN-UPDATED.md — terminal-app

This file explains what changed in `PLAN.md`, the current completion status of
each phase, and what must be read or re-executed to continue.

---

## What changed

Two new phases were inserted and the original Phase 6 was renumbered:

| Old number | New number | Phase name |
|------------|------------|------------|
| — | **Phase 6** (new) | Terminal completeness |
| — | **Phase 7** (new) | E2E Playwright acceptance tests |
| Phase 6 | **Phase 8** | Polish, deployment, release |

Additionally:
- `TEST-PLAN.md` was added as the authoritative acceptance criteria reference.
- `docs/MANUAL-SMOKE.md` was added with the manual browser smoke test protocol.
- `docs/phases/` directory created with phase docs for Phases 6, 7, and 8.

---

## Phase completion status

| Phase | Name | Status |
|-------|------|--------|
| 0 | Project scaffold and empty terminal shell | **COMPLETE** |
| 1 | Define the SerialBackend interface | **COMPLETE** |
| 2 | Web Serial backend and basic connection flow | **COMPLETE** |
| 3 | WebUSB + FTDI backend | **COMPLETE** (manual HW smoke test outstanding) |
| 4 | Backend selector UI | **COMPLETE** |
| 5 | Settings persistence and auto-reconnect | **COMPLETE** (HW auto-reconnect outstanding) |
| 6 | Terminal completeness | **NOT STARTED** |
| 7 | E2E Playwright acceptance tests | **NOT STARTED** |
| 8 | Polish, deployment, release | **NOT STARTED** |

**Outstanding items from previous phases (will be resolved by Phases 6–7):**

- Phase 3: "Manual smoke test exchanges bytes with real FT231XS hardware" — covered by `docs/MANUAL-SMOKE.md` (Smoke test B)
- Phase 5: "Auto-reconnect works for both backends on real hardware" — covered by `docs/MANUAL-SMOKE.md` (Smoke test C)

---

## What to read when starting work on Phase 6

1. `CLAUDE.md` — project conventions (read every session)
2. `PLAN.md` — Phase 6 section
3. `docs/phases/PHASE-06-terminal-completeness.md` — detailed step-by-step
4. `src/components/Terminal.vue` — current implementation (the two gaps are here)
5. `src/App.vue` — needs `:local-echo` prop added
6. `TEST-PLAN.md` — T-H-WS-04 (local echo) and T-H-WS-06 (resize) are the acceptance criteria

## What to read when starting work on Phase 7

1. `CLAUDE.md`
2. `PLAN.md` — Phase 7 section
3. `docs/phases/PHASE-07-e2e-acceptance.md` — detailed step-by-step with all test file contents
4. `docs/PLAYWRIGHT.md` — CRITICAL: Pi5 constraints, mock patterns (§3, §4, §7), Approach B for WebUSB
5. `TEST-PLAN.md` — T-E-* and T-H-* sections map to the Playwright tests to implement
6. `docs/MANUAL-SMOKE.md` — run this after Phase 7 against real hardware

## What to read when starting work on Phase 8

1. `CLAUDE.md`
2. `PLAN.md` — Phase 8 section
3. `docs/phases/PHASE-08-release.md` — full content (also in PLAN.md Phase 8)

---

## How to verify current state (before starting Phase 6)

```bash
# Unit tests — must be 100% green
npm test

# Typecheck and lint
npm run typecheck
npm run lint

# E2E smoke — currently the placeholder; will fail or trivially pass
npm run test:e2e
```

Current known failures:
- `e2e/smoke.spec.ts` passes trivially (navigates `about:blank`) — fixed in Phase 6
- No `@hardware` tests exist yet — written in Phase 7
