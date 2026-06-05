"""Modem-signal loopback tests — the four-row truth table.

Verifies the fan-out wiring:
    RTS -> CTS + DCD
    DTR -> DSR + RI

Driving RTS and/or DTR and reading the modem status byte must reproduce
this table:

    | RTS | DTR | CTS | DCD | DSR | RI |
    |-----|-----|-----|-----|-----|----|
    |  0  |  0  |  0  |  0  |  0  |  0 |
    |  1  |  0  |  1  |  1  |  0  |  0 |
    |  0  |  1  |  0  |  0  |  1  |  1 |
    |  1  |  1  |  1  |  1  |  1  |  1 |

Run via:  pytest test_modem_loopback.py
"""
from __future__ import annotations

import pytest

from ftdi_rig import (
    MODEM_CTS,
    MODEM_DCD,
    MODEM_DSR,
    MODEM_RI,
    drive,
    read_modem,
)

# (rts, dtr, exp_cts, exp_dcd, exp_dsr, exp_ri)
TRUTH_TABLE = [
    (False, False, False, False, False, False),
    (True, False, True, True, False, False),
    (False, True, False, False, True, True),
    (True, True, True, True, True, True),
]


@pytest.mark.parametrize(
    "rts,dtr,exp_cts,exp_dcd,exp_dsr,exp_ri",
    TRUTH_TABLE,
    ids=["none", "rts", "dtr", "both"],
)
def test_modem_truth_table(ftdi, rts, dtr, exp_cts, exp_dcd, exp_dsr, exp_ri):
    drive(ftdi, rts, dtr)
    status = read_modem(ftdi)
    assert bool(status & MODEM_CTS) == exp_cts, f"CTS (status=0x{status:02x})"
    assert bool(status & MODEM_DCD) == exp_dcd, f"DCD (status=0x{status:02x})"
    assert bool(status & MODEM_DSR) == exp_dsr, f"DSR (status=0x{status:02x})"
    assert bool(status & MODEM_RI) == exp_ri, f"RI (status=0x{status:02x})"


def test_lines_return_low_after_test(ftdi):
    """Sanity: dropping both outputs drops all four inputs."""
    drive(ftdi, False, False)
    status = read_modem(ftdi)
    assert status & (MODEM_CTS | MODEM_DCD | MODEM_DSR | MODEM_RI) == 0
