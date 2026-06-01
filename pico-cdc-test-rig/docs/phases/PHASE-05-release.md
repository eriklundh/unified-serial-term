# PHASE-05-release.md — Documentation, flashing, release

Branch: `phase/05-release`

## Goal

Ship v0.1.0: a documented, reproducible test rig with a prebuilt `.uf2`
so a fresh Pico becomes a Web Serial test target in ~15 seconds without
anyone needing the toolchain.

## Tasks

### 5.1 — README.md

Cover:
- **What it is:** a Pico CDC loopback rig for testing the terminal-app's
  Web Serial backend.
- **Behavior contract:** echoes all bytes; on receiving the sentinel
  `0x01 0x3F`, replies with a one-line settings report instead of
  echoing it; mirrors DTR to the onboard LED.
- **Wiring:** none — the loopback is in firmware. Just a USB cable.
- **Board support:** `PICO_BOARD=pico` default; `pico2`, `pico_w`,
  `pico2_w` supported.
- **Quick-start (no build):** download the release `.uf2`, hold BOOTSEL,
  drag it on, done.
- **Quick-start (build):** the `cmake -B build -G Ninja && cmake --build
  build` flow, linking to `docs/DEV-ENVIRONMENT.md`.
- **Verify:** point at `harness/run.sh`.

Commit: `docs: write README with behavior contract and quick-start`

### 5.2 — Finalize FLASHING.md

Ensure `docs/FLASHING.md` covers UF2 drag-drop, picotool, and SWD with
their trade-offs (already drafted — confirm it matches what actually
worked during Phases 0–3, update if not).

Commit: `docs(flash): finalize flashing guide`

### 5.3 — CHANGELOG and LICENSE

- `CHANGELOG.md` — v0.1.0 entry summarizing the rig's capabilities.
- `LICENSE` — BSD-3-Clause (matches the Pico SDK / TinyUSB ecosystem)
  or MIT. Pick one; note that TinyUSB is MIT and the SDK is BSD-3, so
  either is compatible.

Commit: `chore: add CHANGELOG and LICENSE`

### 5.4 — Build and attach the release UF2

Build the release artifact for the default board and attach it to the
git tag (GitLab release asset):

```bash
cmake -B build -G Ninja -DPICO_BOARD=pico
cmake --build build
cp build/pico-cdc-test-rig.uf2 pico-cdc-test-rig-v0.1.0-pico.uf2
```

If you use multiple board types in the lab, build one UF2 per board and
attach all of them, named by board.

Commit: `chore: build release UF2 for pico board`

### 5.5 — Tag

```bash
git tag -a v0.1.0 -m "Pico CDC loopback test rig v0.1.0"
git push --tags
```

Attach the `.uf2`(s) to the GitLab release for the tag.

Commit: `chore: tag v0.1.0`

## Acceptance checklist

- [ ] A fresh Pico flashed from the release `.uf2` passes
      `harness/run.sh` without anything being built locally
- [ ] README lets a new user flash and verify in minutes
- [ ] Release `.uf2`(s) attached to the `v0.1.0` tag
- [ ] `v0.1.0` tagged and pushed

## The payoff

After this, your "many Picos laying around" become interchangeable Web
Serial test targets. Flash any of them from the release UF2 in seconds,
plug into the bench machine, and the terminal-app's Web Serial backend
has a known-good device to talk to. Pair one flashed Pico (Web Serial)
with the FT231X loopback dongle (WebUSB) and you can smoke-test both of
the terminal-app's backends in one sitting.
