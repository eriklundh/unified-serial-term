"""pytest fixtures for the FTDI loopback verification suite.

These tests require a real FT231X dongle wired per the rig spec:
    TX <-> RX,  RTS -> CTS + DCD,  DTR -> DSR + RI

They are skipped automatically if no device can be opened, so the suite
is safe to include in a CI run that has no hardware attached (it simply
reports skips, not failures).
"""
from __future__ import annotations

import pytest

from ftdi_rig import DEFAULT_URL, drive, open_rig


@pytest.fixture(scope="session")
def ftdi():
    try:
        device = open_rig()
    except Exception as exc:  # noqa: BLE001
        pytest.skip(
            f"No FTDI device at {DEFAULT_URL} ({exc}). "
            f"Set FTDI_URL or attach the rig. On Linux, unbind ftdi_sio."
        )
    yield device
    # Leave the lines low and release the device.
    try:
        drive(device, False, False)
    finally:
        device.close()
