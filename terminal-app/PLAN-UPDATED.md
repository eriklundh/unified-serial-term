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
| 6 | Terminal completeness | **COMPLETE** |
| 7 | E2E Playwright acceptance tests | **COMPLETE** |
| 8 | Polish, deployment, release | **COMPLETE** (deploy + git push pending) |

**Outstanding hardware smoke tests (manual steps required):**

- Phase 3: "Manual smoke test exchanges bytes with real FT231XS hardware" — protocol in `docs/MANUAL-SMOKE.md` (Smoke test B)
- Phase 5: "Auto-reconnect works for both backends on real hardware" — protocol in `docs/MANUAL-SMOKE.md` (Smoke test C)

**Outstanding Phase 8 items (require external access):**

- nginx not yet configured on lab VM; `/var/www/` does not exist; deploy pending
- SSH key not confirmed for `git@gitlab.compelcon.se`; `git push origin main` and `git push origin v0.1.0` pending

---

## Current state (as of 2026-06-02)

All phases are complete. Run any time to verify:

```bash
npm test                 # 105/105 Vitest tests
npm run test:e2e         # 41/41 Playwright tests
npm run typecheck        # clean
npm run lint             # clean
npm run build            # dist/ produced with relative asset paths
```

Tagged: `v0.1.0` (local tag; push to remote pending SSH key).
