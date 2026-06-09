#!/usr/bin/env python3
"""Loopback echo verification: every byte sent comes back unchanged.

Author Erik Lundh, The Joy of Engineering, erik.lundh@ingenjorsgladje.se
"""

import argparse
import glob
import sys
import time
import serial


def find_port():
    candidates = glob.glob("/dev/ttyACM*") + glob.glob("/dev/ttyUSB*")
    if not candidates:
        print("ERROR: No serial device found. Is the Pico plugged in?", file=sys.stderr)
        sys.exit(1)
    return candidates[0]


def roundtrip(port: serial.Serial, payload: bytes, label: str) -> None:
    port.reset_input_buffer()
    port.write(payload)
    port.flush()

    received = b""
    deadline = time.monotonic() + 3.0
    while len(received) < len(payload) and time.monotonic() < deadline:
        chunk = port.read(len(payload) - len(received))
        received += chunk

    if received != payload:
        print(f"FAIL [{label}]: sent {len(payload)} bytes, got {len(received)}", file=sys.stderr)
        if received:
            print(f"  expected: {payload[:32]!r}...", file=sys.stderr)
            print(f"  got:      {received[:32]!r}...", file=sys.stderr)
        sys.exit(1)
    print(f"  PASS [{label}]: {len(payload)} bytes round-tripped correctly")


def main():
    parser = argparse.ArgumentParser(description="Pico CDC loopback test")
    parser.add_argument("--port", default=None, help="Serial port (auto-detects /dev/ttyACM*)")
    parser.add_argument("--baud", type=int, default=115200)
    args = parser.parse_args()

    port_name = args.port or find_port()
    print(f"Opening {port_name} at {args.baud} baud")

    with serial.Serial(port_name, args.baud, timeout=3) as port:
        time.sleep(0.5)  # Let CDC settle after open

        roundtrip(port, b"", "empty payload")
        roundtrip(port, b"\xAB", "single byte")
        roundtrip(port, bytes(range(256)), "256-byte ramp")
        roundtrip(port, b"Hello, Pico!\r\n", "ASCII string")

        # 4 KB burst — exercises ring buffer wrap-around under real USB pacing
        big = bytes(i & 0xFF for i in range(4096))
        roundtrip(port, big, "4 KB burst")

    print("All loopback tests passed.")


if __name__ == "__main__":
    main()
