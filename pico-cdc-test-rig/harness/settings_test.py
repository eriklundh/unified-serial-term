#!/usr/bin/env python3
"""Settings round-trip: open with specific line coding, send sentinel, assert report matches."""

import argparse
import glob
import sys
import time
import serial


SENTINEL = bytes([0x01, 0x3F])


def find_port():
    candidates = glob.glob("/dev/ttyACM*") + glob.glob("/dev/ttyUSB*")
    if not candidates:
        print("ERROR: No serial device found. Is the Pico plugged in?", file=sys.stderr)
        sys.exit(1)
    return candidates[0]


def parse_report(line: str) -> dict:
    """Parse 'RIG baud=N data=N parity=X stop=X dtr=N rts=N' into a dict."""
    if not line.startswith("RIG "):
        raise ValueError(f"Unexpected report: {line!r}")
    result = {}
    for token in line[4:].split():
        k, _, v = token.partition("=")
        result[k] = v
    return result


def check_settings(port_name: str, baud: int, bytesize: int, parity: str, stopbits: float,
                   expect_parity: str, expect_stop: str, label: str) -> None:

    parity_map = {
        "N": serial.PARITY_NONE,
        "O": serial.PARITY_ODD,
        "E": serial.PARITY_EVEN,
        "M": serial.PARITY_MARK,
        "S": serial.PARITY_SPACE,
    }
    stopbits_map = {
        1:   serial.STOPBITS_ONE,
        1.5: serial.STOPBITS_ONE_POINT_FIVE,
        2:   serial.STOPBITS_TWO,
    }

    with serial.Serial(port_name, baud,
                       bytesize=bytesize,
                       parity=parity_map[parity],
                       stopbits=stopbits_map[stopbits],
                       timeout=3) as port:
        time.sleep(0.5)  # Let CDC deliver SET_LINE_CODING before we query

        port.reset_input_buffer()
        port.write(SENTINEL)
        port.flush()

        deadline = time.monotonic() + 3.0
        response = b""
        while b"\n" not in response and time.monotonic() < deadline:
            response += port.read(128)

        if not response:
            print(f"FAIL [{label}]: no response to sentinel", file=sys.stderr)
            sys.exit(1)

        line = response.decode("ascii", errors="replace").strip()
        try:
            got = parse_report(line)
        except ValueError as e:
            print(f"FAIL [{label}]: {e}", file=sys.stderr)
            sys.exit(1)

        failures = []
        if got.get("baud") != str(baud):
            failures.append(f"baud: expected {baud}, got {got.get('baud')!r}")
        if got.get("data") != str(bytesize):
            failures.append(f"data: expected {bytesize}, got {got.get('data')!r}")
        if got.get("parity") != expect_parity:
            failures.append(f"parity: expected {expect_parity!r}, got {got.get('parity')!r}")
        if got.get("stop") != expect_stop:
            failures.append(f"stop: expected {expect_stop!r}, got {got.get('stop')!r}")
        if got.get("dtr") != "1":
            failures.append(f"dtr: expected 1 (pyserial sets DTR on open), got {got.get('dtr')!r}")

        if failures:
            print(f"FAIL [{label}]:", file=sys.stderr)
            for f in failures:
                print(f"  {f}", file=sys.stderr)
            sys.exit(1)

        print(f"  PASS [{label}]: {line}")


def main():
    parser = argparse.ArgumentParser(description="Pico CDC settings round-trip test")
    parser.add_argument("--port", default=None, help="Serial port (auto-detects /dev/ttyACM*)")
    args = parser.parse_args()

    port_name = args.port or find_port()
    print(f"Testing settings on {port_name}")

    cases = [
        # (baud, bytesize, parity_char, stopbits, expect_parity, expect_stop, label)
        (115200, 8, "N", 1,   "none", "1",   "115200-8N1"),
        (9600,   8, "N", 1,   "none", "1",   "9600-8N1"),
        (9600,   7, "O", 2,   "odd",  "2",   "9600-7O2"),
        (38400,  8, "E", 1,   "even", "1",   "38400-8E1"),
        (4800,   8, "M", 1,   "mark", "1",   "4800-8M1"),
        (2400,   8, "S", 1,   "space","1",   "2400-8S1"),
    ]

    for (baud, bs, par, stop, ep, es, lbl) in cases:
        check_settings(port_name, baud, bs, par, stop, ep, es, lbl)

    print("All settings tests passed.")


if __name__ == "__main__":
    main()
