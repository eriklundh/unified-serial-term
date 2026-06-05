# PLAN.md — hil-preflight

Phased plan for building and integrating the HIL preflight hardware
verification suite.

---

## Phase 0 — Bootstrap preflight runner ✅

**Goal:** `preflight.sh` orchestrates both sub-suites in sequence from a single
command; fails fast if either suite fails.

**Acceptance criteria:**
- `bash preflight.sh` exits 0 when both devices are connected and healthy.
- Exit code 1 + clear message when either suite fails.
- Shared `.venv` with pyserial + pyftdi + pytest is bootstrapped on first run.

**Commits:**
- `chore: init hil-preflight repo with preflight.sh, requirements.txt, README`

---

## Phase 1 — Add FTDI device-presence check ✅

**Goal:** Mirror the CDC suite's `TestDevicePresent` pattern in
`ftdi-loopback-verify`. A missing FTDI plug must be an explicit hard failure,
not a silent skip.

**Background:** The Pico CDC suite (`py-verify/test_pico_cdc.py`) has
`TestDevicePresent::test_pico_connected` — it calls `pytest.fail()` when no
VID=0x2E8A PID=0x000A device is found. The FTDI suite previously relied on the
`ftdi` fixture's `pytest.skip()` when `open_rig()` failed, which hides a missing
device in a multi-test run.

**What changes:**
- New file `ftdi-loopback-verify/test_0_device_present.py` (named `test_0_...`
  so it sorts before `test_data_loopback.py` and runs first).
- Uses `usb.core.find(idVendor=0x0403, idProduct=0x6015)` to enumerate the
  FT231X by VID/PID before any pyftdi open attempt.
- Calls `pytest.fail()` if device absent and no `--ftdi-url` override is given.

**Acceptance criteria:**
- `pytest ftdi-loopback-verify/` with device connected: `TestDevicePresent::test_ftdi_connected PASSED`.
- Same command with device absent (no override): hard `FAILED`, not `SKIPPED`.
- Full `preflight.sh` still exits 0 with both devices present.

**Commits:**
- `test(ftdi): add early-fail test for FTDI device presence`

---

## Phase 2 — Integrate into ftdi-driver ✅

**Goal:** `npm run test:hw` in `ftdi-driver` is automatically gated
behind the full hardware preflight.

**What changes:**
- `ftdi-driver/package.json`: add `pretest:hw` lifecycle hook.
  npm runs `pre<script>` automatically before `<script>`.
  ```json
  "pretest:hw": "bash ../hil-preflight/preflight.sh"
  ```
- `ftdi-driver/test-hw/README.md`: add **Preflight** section documenting
  the automatic gate; simplify run command (no longer needs to be shown as
  `FTDI_HW_TEST=1 npm run test:hw` since that env var is set by `test:hw`).

**Acceptance criteria:**
- `npm run test:hw` from `ftdi-driver/` runs the preflight first, then
  Vitest hardware tests.
- If a device is absent, the run exits before Vitest starts.

**Commits:**
- `feat(harness): gate test:hw behind hil-preflight`

---

## Phase 3 — Integrate into terminal-app ✅

**Goal:** `terminal-app` gets the same `test:hw` pattern as `ftdi-driver`,
plus a Playwright grep filter that gates `@hardware`-tagged tests behind
`TERMINAL_HW_TEST=1`.

**Background:** `terminal-app` has `npm test` (Vitest unit) and
`npm run test:e2e` (Playwright). Neither was hardware-gated. Future hardware
Playwright tests (e.g., connecting to the Pico via Web Serial, or the FTDI
device via WebUSB) must not run unless hardware is present.

**What changes:**
- `terminal-app/package.json`:
  ```json
  "pretest:hw": "bash ../hil-preflight/preflight.sh",
  "test:hw": "TERMINAL_HW_TEST=1 playwright test"
  ```
- `terminal-app/playwright.config.ts`: add `HW_TEST` flag; spread a `grep`
  filter into `use:` when `TERMINAL_HW_TEST` is unset, so tests titled with
  `@hardware` are excluded from non-hardware runs:
  ```typescript
  const HW_TEST = !!process.env.TERMINAL_HW_TEST;
  // in use: block:
  ...(!HW_TEST && { grep: /^(?!.*@hardware)/ }),
  ```
  Future hardware Playwright tests: tag with `@hardware` in the test title
  (e.g. `test('@hardware connects via Web Serial', ...)`).

**Acceptance criteria:**
- `npm run test:hw` runs the preflight, then Playwright with `TERMINAL_HW_TEST=1`.
- `npm run test:e2e` (without flag) runs only non-hardware Playwright tests.
- Existing smoke test (`e2e/smoke.spec.ts`) is unaffected — it has no `@hardware` tag.

**Commits:**
- `feat(harness): add test:hw command with hil-preflight gate`

---

## Future phases (not yet planned)

- **Phase 4 — Hardware Playwright tests for terminal-app.** Write Playwright
  tests tagged `@hardware` that connect to the Pico CDC device via Web Serial
  and/or the FTDI device via WebUSB and assert correct behavior in the browser
  terminal.
- **Phase 5 — CI integration.** Wire `preflight.sh` into the GitLab CI pipeline
  for the repo, running on the Pi 5 runner that has both devices attached.
- **Phase 6 — Additional rigs.** If a third USB device joins the HIL suite,
  extend `preflight.sh` with a new section and add a `test_0_device_present.py`
  to its verification repo.
