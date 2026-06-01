# FLASHING.md — putting firmware on the Pico

Three ways to flash, from simplest to most capable. For a test rig you
flash rarely (once, then it just runs), so the simplest method is
usually fine — but the faster methods pay off during Phase 0–3
iteration.

Remember the build-vs-flash split (see `CLAUDE.md`): Claude Code on
agentlab1 produces the `.uf2`; flashing happens on a machine with the
Pico attached. If you build on agentlab1 and flash on a Pi 5, copy the
artifact over first:

```bash
scp agentlab1:~/FPGA_work/pico-cdc-test-rig/build/*.uf2 .
```

## Method 1: UF2 drag-drop via BOOTSEL (simplest, no tools)

1. Hold the **BOOTSEL** button on the Pico while plugging it into USB.
2. It mounts as a mass-storage device named `RPI-RP2` (RP2040 / Pico) or
   `RP2350` (Pico 2).
3. Copy the `.uf2` onto it:
   ```bash
   cp build/pico-cdc-test-rig.uf2 /media/$USER/RPI-RP2/
   ```
   (Path varies; `lsblk` or your file manager shows the mount point.)
4. The Pico reboots automatically and runs the new firmware.

Pros: zero tooling, works everywhere. Cons: physical button press every
flash — tedious during tight iteration.

## Method 2: picotool (command-line, no button after first flash)

This firmware exposes the picotool USB reset interface. After the initial
BOOTSEL flash, all subsequent flashes need no button press:

```bash
picotool load -f -x build/pico-cdc-test-rig.uf2
#              -f = force reset of running device to BOOTSEL first
#                 -x = reboot into the new firmware after flashing
```

picotool sends a USB control request to the reset interface, the device
reboots to BOOTSEL, flashing happens, then it relaunches. The full
build-and-flash cycle from a running device:

```bash
cmake --build build && picotool load -f -x build/pico-cdc-test-rig.uf2
```

picotool also inspects binaries — useful for sanity checks:

```bash
picotool info build/pico-cdc-test-rig.uf2     # what's in this image
picotool info -a                              # what's on the attached device
```

Pros: fully scriptable, no button after the very first flash. Cons:
needs picotool installed (see `DEV-ENVIRONMENT.md` §4) and the udev rule
on Linux.

## Method 3: SWD via a debug probe (fastest iteration, full debugging)

For real debugging (breakpoints, single-stepping) and the fastest
flash-and-run cycle, wire SWD and use OpenOCD. The probe can be:

- A **Raspberry Pi Debug Probe** (the official one), or
- A **second Pico** running the `debugprobe` firmware, or
- A **Raspberry Pi 5/4** driving SWD over its GPIO header.

Wiring (3 wires): probe `SWCLK → Pico SWCLK`, `SWDIO → Pico SWDIO`,
`GND → GND`. Then:

```bash
# Flash an ELF over SWD
openocd -f interface/cmsis-dap.cfg -f target/rp2040.cfg \
        -c "program build/pico-cdc-test-rig.elf verify reset exit"
```

(Use `target/rp2350.cfg` for Pico 2.) With this set up you can also run
`gdb` against the target for breakpoint debugging — valuable if a USB
callback misbehaves and printf-over-CDC isn't enough.

Pros: fastest, full debugging, no BOOTSEL ever. Cons: needs a probe and
3 jumper wires; more setup.

## Which to use when

| Situation | Method |
|-----------|--------|
| Flashing a finished rig onto spare Picos | 1 (drag-drop the release UF2) |
| Phase 0–3 iteration on the bench | 2 (picotool) |
| Debugging a USB callback that misbehaves | 3 (SWD + gdb) |
| Claude Code on agentlab1 | builds only — produces the `.uf2`, doesn't flash |

## A note on the test rig's lifecycle

The point of this rig is "flash once, use for ages." Once v0.1.0 is
tagged with a prebuilt `.uf2` (Phase 5), flashing a fresh Pico is
Method 1 in about 15 seconds — hold BOOTSEL, drag the UF2, done. You can
keep several flashed Picos in the test drawer, each a ready Web Serial
target. No toolchain needed on the machine that does the flashing for
the release UF2 — just a file copy onto the mounted drive.

## Troubleshooting

- **`RPI-RP2` doesn't appear:** you didn't hold BOOTSEL early enough.
  Unplug, hold BOOTSEL, plug in while still holding.
- **picotool: "No accessible RP2040 devices":** udev rule missing
  (Linux), or the running firmware doesn't expose the reset interface —
  hold BOOTSEL for the first picotool flash.
- **OpenOCD: "Error connecting DP":** SWD wiring (check SWCLK/SWDIO not
  swapped), or the probe's cfg file is wrong for your probe type.
- **Flashed but nothing happens:** wrong `PICO_BOARD` at build time, or
  you flashed an ELF where a UF2 was needed (drag-drop needs UF2;
  OpenOCD takes ELF). Rebuild for the correct board.
