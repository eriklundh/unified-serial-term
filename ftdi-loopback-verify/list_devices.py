#!/usr/bin/env python3
"""List attached FTDI devices and their pyftdi URLs.

Use the printed URL with verify_wiring.py or the FTDI_URL env var, e.g.
    export FTDI_URL='ftdi://0x403:0x6015:FT9ABCDE/1'
The serial-qualified form is useful when several FTDI devices are
attached (e.g. the loopback rig plus a ULX3S board).

Author Erik Lundh, The Joy of Engineering, erik.lundh@ingenjorsgladje.se
"""
from pyftdi.ftdi import Ftdi

if __name__ == "__main__":
    Ftdi.show_devices()
