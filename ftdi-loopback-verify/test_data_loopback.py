"""TX <-> RX data loopback tests.

Verifies the TX-to-RX solder jumper: bytes written to the FTDI come back
unchanged. Run via:  pytest test_data_loopback.py
"""
from __future__ import annotations

import pytest

from ftdi_rig import read_exact


@pytest.mark.parametrize(
    "payload",
    [
        b"",                    # nothing in, nothing out
        b"A",                   # single byte
        b"PING\r\n",            # short line
        bytes(range(64)),       # one 64-byte USB packet
        bytes(range(256)) * 4,  # 1 KiB, spans many packets
    ],
    ids=["empty", "one", "line", "64", "1k"],
)
def test_tx_rx_loopback(ftdi, payload):
    ftdi.purge_buffers()
    ftdi.write_data(payload)
    got = read_exact(ftdi, len(payload))
    assert got == payload, f"expected {len(payload)} bytes, got {len(got)}"
