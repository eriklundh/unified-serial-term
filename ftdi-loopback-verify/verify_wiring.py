#!/usr/bin/env python3
"""Friendly wiring verification for the FTDI loopback test rig.

Verifies the soldered connections specified for the rig:
    TX  <-> RX          data loopback
    RTS --> CTS + DCD   RTS fans out to two inputs
    DTR --> DSR + RI    DTR fans out to two inputs

Run this BEFORE the ftdi-webusb-driver Phase 9 hardware tests. If this
passes, the wiring is good — so any Phase 9 failure is the driver, not
the solder joints.

Usage:
    python verify_wiring.py [ftdi-url]
    FTDI_URL=ftdi://0x403:0x6015/1 python verify_wiring.py
"""
from __future__ import annotations

import sys

from ftdi_rig import (
    DEFAULT_URL,
    MODEM_CTS,
    MODEM_DCD,
    MODEM_DSR,
    MODEM_RI,
    drive,
    open_rig,
    read_exact,
    read_modem,
)

# ANSI colours (harmless if the terminal ignores them)
GREEN = "\033[32m"
RED = "\033[31m"
DIM = "\033[2m"
RST = "\033[0m"


def verdict(passed: bool) -> str:
    return f"{GREEN}PASS{RST}" if passed else f"{RED}FAIL{RST}"


def main() -> int:
    url = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_URL
    print(f"Opening {url} ...")
    try:
        ftdi = open_rig(url)
    except Exception as exc:  # noqa: BLE001 - report any open failure plainly
        print(f"{RED}Could not open device:{RST} {exc}")
        print("List attached devices with:  python list_devices.py")
        print("On Linux you may need to unbind ftdi_sio first (see README).")
        return 2

    failures = 0

    # --- Data loopback: TX <-> RX -------------------------------------
    print("\nData loopback (TX <-> RX):")
    for payload in (b"A", b"PING\r\n", bytes(range(256)) * 4):
        ftdi.purge_buffers()
        ftdi.write_data(payload)
        got = read_exact(ftdi, len(payload))
        good = got == payload
        failures += not good
        extra = "" if good else f"  {DIM}got {len(got)}/{len(payload)} bytes{RST}"
        print(f"  {len(payload):5d} bytes  {verdict(good)}{extra}")

    # --- Modem fan-out matrix -----------------------------------------
    # Drive each output alone and observe which inputs follow. This
    # reveals not just open bridges but cross-wiring (an input following
    # the wrong output).
    print("\nModem fan-out matrix (drive one output, read all four inputs):")
    print(f"  {'driven':10}{'CTS':>5}{'DCD':>5}{'DSR':>5}{'RI':>5}")

    def sample(label: str, rts: bool, dtr: bool):
        drive(ftdi, rts, dtr)
        s = read_modem(ftdi)
        vals = (
            bool(s & MODEM_CTS),
            bool(s & MODEM_DCD),
            bool(s & MODEM_DSR),
            bool(s & MODEM_RI),
        )
        print(f"  {label:10}" + "".join(f"{int(v):>5}" for v in vals))
        return vals

    none = sample("none", False, False)
    rts_only = sample("RTS only", True, False)
    dtr_only = sample("DTR only", False, True)
    both = sample("RTS+DTR", True, True)
    drive(ftdi, False, False)

    # --- Per-bridge verdicts ------------------------------------------
    # A bridge is good if its target input follows its own driving output
    # (high when driven, low otherwise) and does NOT follow the other
    # output (which would mean swapped/cross-wired bridges).
    # Indices into the sample tuples: 0=CTS 1=DCD 2=DSR 3=RI
    print("\nBridge verdicts (expected: RTS->CTS+DCD, DTR->DSR+RI):")
    bridges = [
        ("RTS -> CTS", 0, rts_only, dtr_only),
        ("RTS -> DCD", 1, rts_only, dtr_only),
        ("DTR -> DSR", 2, dtr_only, rts_only),
        ("DTR -> RI", 3, dtr_only, rts_only),
    ]
    for name, idx, driver_sample, other_sample in bridges:
        follows_driver = driver_sample[idx]
        idle_low = not none[idx]
        not_crosstalk = not other_sample[idx]
        good = follows_driver and idle_low and not_crosstalk
        failures += not good
        note = ""
        if not good:
            if not follows_driver:
                note = f"  {DIM}input never went high — bridge open?{RST}"
            elif not not_crosstalk:
                note = f"  {DIM}follows the WRONG output — swapped bridges?{RST}"
            elif not idle_low:
                note = f"  {DIM}stuck high — short to power?{RST}"
        print(f"  {name:12} {verdict(good)}{note}")

    # --- Aggregate sanity rows ----------------------------------------
    all_low = not any(none)
    all_high = all(both)
    failures += not all_low
    failures += not all_high
    print(f"\n  all inputs low when nothing driven   {verdict(all_low)}")
    print(f"  all inputs high when both driven     {verdict(all_high)}")

    ftdi.close()

    print()
    if failures == 0:
        print(f"{GREEN}ALL CHECKS PASSED — wiring is correct.{RST}")
        return 0
    print(
        f"{RED}{failures} check(s) failed{RST} — read the matrix above to "
        f"locate the bad bridge."
    )
    print(
        f"{DIM}Open bridge: the target input never follows its output.\n"
        f"Swapped bridges: an input follows the wrong output.{RST}"
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
