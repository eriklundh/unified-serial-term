"""
Shared pytest fixtures for the Pico CDC Test Rig verification suite.

Port detection order:
  1. --port CLI override
  2. USB VID:PID match (VID=0x2E8A PID=0x000A — Raspberry Pi Pico SDK CDC)
  3. Product-string match ("Pico CDC Test Rig") as fallback
"""

import pytest
import serial.tools.list_ports

PICO_VID = 0x2E8A
PICO_PID = 0x000A


def _find_pico_port() -> str | None:
    for port in serial.tools.list_ports.comports():
        if port.vid == PICO_VID and port.pid == PICO_PID:
            return port.device
    for port in serial.tools.list_ports.comports():
        if port.description and "Pico CDC Test Rig" in port.description:
            return port.device
    return None


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption(
        "--port",
        action="store",
        default=None,
        metavar="DEV",
        help="Serial port override, e.g. /dev/ttyACM0 (skips auto-detect)",
    )


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line(
        "markers",
        "hardware: test requires the Pico CDC Test Rig to be physically connected",
    )


@pytest.fixture(scope="session")
def pico_port(request: pytest.FixtureRequest) -> str:
    """Return the serial port path for the Pico CDC Test Rig."""
    override: str | None = request.config.getoption("--port")
    if override:
        return override
    port = _find_pico_port()
    if port is None:
        pytest.skip(
            "Pico CDC Test Rig not detected "
            f"(VID=0x{PICO_VID:04X} PID=0x{PICO_PID:04X}). "
            "Plug in the device or pass --port /dev/ttyACMn."
        )
    return port
