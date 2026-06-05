"""Shared helpers for the FTDI loopback verification suite.

Independent of the ftdi-driver under test: this talks to the chip
via pyftdi (libusb), using modem-status bit definitions taken directly
from the FTDI vendor protocol. The masks below are defined here on their
own, NOT imported from the driver — that independence is the point. If
the driver's understanding of these bits were wrong, this suite (which
derives them separately) would disagree.

Wiring this suite verifies (the test-rig solder connections):
    TX  <-> RX          data loopback
    RTS --> CTS + DCD   RTS fans out to two inputs
    DTR --> DSR + RI    DTR fans out to two inputs
"""
from __future__ import annotations

import os
import time

from pyftdi.ftdi import Ftdi

# Default device URL — FT231X (VID 0x0403, PID 0x6015), interface 1.
# Override with the FTDI_URL environment variable, e.g.
#   export FTDI_URL='ftdi://0x403:0x6015:FT123ABC/1'   (by serial)
DEFAULT_URL = os.environ.get("FTDI_URL", "ftdi://0x403:0x6015/1")

# Modem status byte 0 bit masks (FTDI vendor protocol; matches ftdi_sio.h).
# Defined here independently as the verification reference.
MODEM_CTS = 0x10  # Clear To Send
MODEM_DSR = 0x20  # Data Set Ready
MODEM_RI = 0x40   # Ring Indicator
MODEM_DCD = 0x80  # Data Carrier Detect (RLSD)

# Allow the looped-back pin level to settle before reading it back.
SETTLE_S = 0.02


def open_rig(url: str = DEFAULT_URL) -> Ftdi:
    """Open the FTDI device in UART mode with hardware flow control off.

    Hardware flow control MUST be disabled: with RTS/CTS handshaking on,
    the chip auto-drives RTS from the CTS input, which would make the
    modem loopback test meaningless. It is off by default after open;
    we set it explicitly to be certain.
    """
    ftdi = Ftdi()
    ftdi.open_from_url(url)
    ftdi.set_baudrate(115200)
    ftdi.set_line_property(8, 1, "N")  # 8 data bits, 1 stop bit, no parity
    try:
        ftdi.set_flowctrl("")  # '' disables hardware/software flow control
    except Exception:
        # Default is already disabled; some pyftdi versions differ on the
        # exact call signature, so don't hard-fail on it.
        pass
    ftdi.purge_buffers()
    return ftdi


def read_modem(ftdi: Ftdi, settle: float = SETTLE_S) -> int:
    """Return modem status byte 0 — the CTS/DSR/RI/DCD byte.

    Use poll_modem_status(), NOT modem_status(): in pyftdi,
    poll_modem_status() returns the raw 16-bit status (the two status
    bytes packed little-endian, so the modem-line byte 0 is the low 8
    bits). modem_status() instead returns a tuple of *decoded signal
    name strings* — masking that with the bit constants would raise a
    TypeError. We want the raw byte so we can apply our own independent
    bit masks (the whole point of this suite).
    """
    time.sleep(settle)
    status = ftdi.poll_modem_status()  # 16-bit; byte 0 is the low 8 bits
    return status & 0xFF


def read_exact(ftdi: Ftdi, n: int, timeout: float = 1.0) -> bytes:
    """Read exactly n bytes, or whatever arrived before the timeout."""
    buf = bytearray()
    deadline = time.time() + timeout
    while len(buf) < n and time.time() < deadline:
        chunk = ftdi.read_data(n - len(buf))
        if chunk:
            buf.extend(chunk)
        else:
            time.sleep(0.005)
    return bytes(buf)


def drive(ftdi: Ftdi, rts: bool, dtr: bool) -> None:
    """Set the two host-controlled outputs (RTS, DTR)."""
    ftdi.set_rts(rts)
    ftdi.set_dtr(dtr)


def decode_inputs(status: int) -> dict:
    """Map a modem status byte to the four input line booleans."""
    return {
        "CTS": bool(status & MODEM_CTS),
        "DCD": bool(status & MODEM_DCD),
        "DSR": bool(status & MODEM_DSR),
        "RI": bool(status & MODEM_RI),
    }
