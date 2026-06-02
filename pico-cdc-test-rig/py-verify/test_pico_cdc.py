"""
Firmware verification tests for the Pico CDC Test Rig.

Hardware target: Raspberry Pi Pico running pico-cdc-test-rig firmware.
  USB identity : VID=0x2E8A  PID=0x000A  ("Pico CDC Test Rig")
  Firmware contract:
    - Every byte sent echoes back unchanged (loopback).
    - Sending sentinel 0x01 0x3F returns a one-line settings report:
        RIG baud=N data=N parity=X stop=X dtr=N rts=N

All tests are marked `hardware` and are skipped automatically when no
device is detected (see conftest.py).  Pass --port /dev/ttyACMn to
override auto-detection.
"""

import time

import pytest
import serial
import serial.tools.list_ports

pytestmark = pytest.mark.hardware

PICO_VID = 0x2E8A
PICO_PID = 0x000A
BAUD_DEFAULT = 115200
TIMEOUT = 3.0
SENTINEL = bytes([0x01, 0x3F])


# ── internal helpers ──────────────────────────────────────────────────────────

def _roundtrip(port: serial.Serial, payload: bytes) -> bytes:
    """Write payload, read back the same number of bytes, return what arrived."""
    port.reset_input_buffer()
    port.write(payload)
    port.flush()
    if not payload:
        return b""
    received = b""
    deadline = time.monotonic() + TIMEOUT
    while len(received) < len(payload) and time.monotonic() < deadline:
        received += port.read(len(payload) - len(received))
    return received


def _sentinel_report(port: serial.Serial) -> dict[str, str]:
    """Send the sentinel, read one line, return its key=value pairs."""
    port.reset_input_buffer()
    port.write(SENTINEL)
    port.flush()
    buf = b""
    deadline = time.monotonic() + TIMEOUT
    while b"\n" not in buf and time.monotonic() < deadline:
        buf += port.read(128)
    line = buf.decode("ascii", errors="replace").strip()
    assert line.startswith("RIG "), f"Unexpected sentinel response: {line!r}"
    return {k: v for k, _, v in (tok.partition("=") for tok in line[4:].split())}


# ── 0. Device presence ───────────────────────────────────────────────────────


class TestDevicePresent:
    """Runs first. Fails hard (not skips) when the Pico is not connected."""

    def test_pico_connected(self, request: pytest.FixtureRequest) -> None:
        """Pico CDC Test Rig is detected on USB."""
        override: str | None = request.config.getoption("--port", default=None)
        if override:
            return  # explicit port supplied — trust the caller
        found = any(
            p.vid == PICO_VID and p.pid == PICO_PID
            for p in serial.tools.list_ports.comports()
        )
        if not found:
            pytest.fail(
                "Pico CDC Test Rig not detected on USB. "
                f"Expected VID=0x{PICO_VID:04X} PID=0x{PICO_PID:04X}. "
                "Plug in the device or run with --port /dev/ttyACMn."
            )


# ── 1. Enumeration ────────────────────────────────────────────────────────────


class TestEnumeration:
    def test_port_opens(self, pico_port: str) -> None:
        """The CDC port can be opened — device is enumerated and accessible."""
        with serial.Serial(pico_port, BAUD_DEFAULT, timeout=TIMEOUT) as s:
            assert s.is_open, "Serial port did not open"


# ── 2. Loopback echo ──────────────────────────────────────────────────────────


_LOOPBACK_CASES = [
    pytest.param(b"", id="empty"),
    pytest.param(b"\xAB", id="single-byte"),
    pytest.param(bytes(range(256)), id="256-byte-ramp"),
    pytest.param(b"Hello, Pico!\r\n", id="ascii-string"),
    # 4 KB burst exercises ring-buffer wrap-around (256-byte buffer, many laps)
    pytest.param(bytes(i & 0xFF for i in range(4096)), id="4KB-burst"),
]


class TestLoopback:
    @pytest.mark.parametrize("payload", _LOOPBACK_CASES)
    def test_echo(self, pico_port: str, payload: bytes) -> None:
        """Every byte written comes back unchanged."""
        with serial.Serial(pico_port, BAUD_DEFAULT, timeout=TIMEOUT) as s:
            time.sleep(0.5)  # let CDC settle after open
            received = _roundtrip(s, payload)
        assert received == payload, (
            f"Echo mismatch: sent {len(payload)} bytes, got {len(received)} — "
            f"first 32 sent: {payload[:32]!r}, first 32 received: {received[:32]!r}"
        )


# ── 3. Line-coding report (sentinel protocol) ─────────────────────────────────


_SETTINGS_CASES = [
    # (baud, bytesize, parity, stopbits, expect_parity, expect_stop)
    pytest.param(115200, 8, serial.PARITY_NONE,  serial.STOPBITS_ONE, "none",  "1", id="115200-8N1"),
    pytest.param(9600,   8, serial.PARITY_NONE,  serial.STOPBITS_ONE, "none",  "1", id="9600-8N1"),
    pytest.param(9600,   7, serial.PARITY_ODD,   serial.STOPBITS_TWO, "odd",   "2", id="9600-7O2"),
    pytest.param(38400,  8, serial.PARITY_EVEN,  serial.STOPBITS_ONE, "even",  "1", id="38400-8E1"),
    pytest.param(4800,   8, serial.PARITY_MARK,  serial.STOPBITS_ONE, "mark",  "1", id="4800-8M1"),
    pytest.param(2400,   8, serial.PARITY_SPACE, serial.STOPBITS_ONE, "space", "1", id="2400-8S1"),
]


class TestLineCoding:
    @pytest.mark.parametrize(
        "baud,bytesize,parity,stopbits,expect_parity,expect_stop",
        _SETTINGS_CASES,
    )
    def test_settings_report(
        self,
        pico_port: str,
        baud: int,
        bytesize: int,
        parity: str,
        stopbits: float,
        expect_parity: str,
        expect_stop: str,
    ) -> None:
        """Firmware reports the exact line coding the host requested."""
        with serial.Serial(
            pico_port, baud,
            bytesize=bytesize, parity=parity, stopbits=stopbits,
            timeout=TIMEOUT,
        ) as s:
            time.sleep(0.5)  # let SET_LINE_CODING reach firmware before sentinel
            got = _sentinel_report(s)

        assert got.get("baud") == str(baud), f"baud mismatch: {got}"
        assert got.get("data") == str(bytesize), f"data-bits mismatch: {got}"
        assert got.get("parity") == expect_parity, f"parity mismatch: {got}"
        assert got.get("stop") == expect_stop, f"stop-bits mismatch: {got}"
        # pyserial asserts DTR on open; firmware must reflect it
        assert got.get("dtr") == "1", f"DTR should be 1 after open: {got}"
