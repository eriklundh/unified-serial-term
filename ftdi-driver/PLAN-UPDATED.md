# PLAN-UPDATED.md — ftdi-webusb-driver

This file explains what changed relative to `PLAN.md`, the current completion
status of each phase, and what must be read or re-executed next.

---

## What changed

A `TEST-PLAN.md` was added to this component alongside the
`../terminal-app/TEST-PLAN.md` and the root `TEST-PLAN.md`. These files document the authoritative acceptance
criteria for all test tiers. No phase content in `PLAN.md` changed.

---

## Phase completion status

| Phase | Name | Status |
|-------|------|--------|
| 0 | Project bootstrap | **COMPLETE** |
| 1 | Baud divisor calculator | **COMPLETE** |
| 2 | Line-properties encoder | **COMPLETE** |
| 3 | Modem-control and flow-control encoders | **COMPLETE** |
| 4 | Bulk-IN status header stripping | **COMPLETE** |
| 5 | UsbTransport interface and mock | **COMPLETE** |
| 6 | FtdiUart class: open, configure, close | **COMPLETE** |
| 7 | Read and write paths with buffering | **COMPLETE** |
| 8 | Stream API | **COMPLETE** |
| 9 | Hardware-in-loop integration tests | **COMPLETE** |
| 10 | Documentation, examples, release prep | **IN PROGRESS** |

### Phase 9 verification (run at any time to confirm still-green)

```bash
../../ftdi-unbind/macos-linux/ftdi-unbind 0403:6015
FTDI_HW_TEST=1 FTDI_HW_MODEM=1 npm run test:hw    # 14/14 must pass
../../ftdi-unbind/macos-linux/ftdi-bind 0403:6015
npm test                                            # 89/89 must pass
npm run typecheck
npm run lint
```

---

## Phase 10 — What remains

The following steps from `docs/phases/PHASE-10-release.md` are done:

- [x] `API.md` (TypeDoc comments exist on public exports)
- [x] `CHANGELOG.md` exists (dated entry needed — see below)
- [x] `examples/minimal.html` exists and matches the phase doc
- [x] `package.json` version is `0.1.0`

The following step is **not yet done**:

- [ ] **Step 10.5** — Date the CHANGELOG entry, commit, push `v0.1.0` tag

  ```bash
  # Edit CHANGELOG.md: replace YYYY-MM-DD with today's date
  git add CHANGELOG.md
  git commit -m "docs: date the v0.1.0 CHANGELOG entry"
  git checkout main
  git merge --no-ff phase/10-release -m "Merge phase/10-release: v0.1.0 release"
  git tag -a v0.1.0 -m "v0.1.0 — first release"
  git push origin main
  git push origin v0.1.0
  ```

  See `docs/phases/PHASE-10-release.md §Step 10.5` for the full procedure.

  **Important:** Before running any doc-generation tool (`npm run docs`),
  commit and push all in-progress changes first. TypeDoc's clean step can
  destroy the working tree if `"out"` is misconfigured. See the CRITICAL
  warning in `docs/phases/PHASE-10-release.md §Step 10.2`.

---

## What to read when resuming work

1. `CLAUDE.md` — project conventions (read every session)
2. `PLAN.md` — full phased plan (phases 0–10)
3. `docs/phases/PHASE-10-release.md` — remaining release steps
4. `TEST-PLAN.md` — authoritative acceptance criteria for all test tiers

No re-execution of Phases 0–9 is needed. All tests are green.
