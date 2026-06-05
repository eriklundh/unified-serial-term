"""Early-fail device presence check — runs before all other tests.

Uses pyusb to enumerate USB devices by VID/PID. If no FT231X is found
and no --ftdi-url override is supplied, calls pytest.fail() (hard failure,
not a skip) so a missing device is an explicit red rather than a silent skip.
"""
from __future__ import annotations

import pytest
import usb.core

FTDI_VID = 0x0403
FTDI_PID = 0x6015  # FT231X


class TestDevicePresent:
    """Runs first. Fails hard when the FT231X loopback plug is not connected."""

    def test_ftdi_connected(self, request: pytest.FixtureRequest) -> None:
        """FT231X loopback plug is detected on USB."""
        urls = request.config.getoption("ftdi_urls", default=None)
        if urls:
            return  # explicit URL supplied — trust the caller
        found = usb.core.find(idVendor=FTDI_VID, idProduct=FTDI_PID) is not None
        if not found:
            pytest.fail(
                "FT231X loopback plug not detected on USB. "
                f"Expected VID=0x{FTDI_VID:04X} PID=0x{FTDI_PID:04X}. "
                "Plug in the device or run with --ftdi-url ftdi://..."
            )
