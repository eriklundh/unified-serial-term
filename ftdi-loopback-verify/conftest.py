"""pytest fixtures for the FTDI loopback verification suite.

Supports one or more FTDI loopback rigs in a single run.

Device selection (in order of precedence):
  1. --ftdi-url CLI option (repeatable for multiple rigs)
  2. FTDI_URL environment variable (comma-separated for multiple)
  3. Default: ftdi://0x403:0x6015/1

Tests are skipped automatically if a device cannot be opened, so the suite
is safe to include in a CI run or a larger suite with no hardware attached.
"""
from __future__ import annotations

import os

import pytest

from ftdi_rig import DEFAULT_URL, drive, open_rig


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption(
        "--ftdi-url",
        action="append",
        dest="ftdi_urls",
        metavar="URL",
        default=None,
        help=(
            "FTDI device URL (repeat for multiple rigs). "
            "Example: --ftdi-url ftdi://0x403:0x6015:ABC123/1"
        ),
    )


def _resolve_urls(config: pytest.Config) -> list[str]:
    urls = config.getoption("ftdi_urls", default=None)
    if urls:
        return urls
    env = os.environ.get("FTDI_URL", "")
    if env:
        return [u.strip() for u in env.split(",") if u.strip()]
    return [DEFAULT_URL]


def pytest_generate_tests(metafunc: pytest.Metafunc) -> None:
    """Parametrize the ftdi fixture over all requested device URLs.

    With a single URL (the common case) this produces test IDs like
    test_foo[ftdi://0x403:0x6015/1], which identifies the rig in the output.
    With multiple --ftdi-url arguments every test runs once per device.
    """
    if "ftdi" in metafunc.fixturenames:
        urls = _resolve_urls(metafunc.config)
        metafunc.parametrize("ftdi", urls, indirect=True, scope="session")


@pytest.fixture(scope="session")
def ftdi(request: pytest.FixtureRequest):
    """Open one FTDI loopback rig for the session; skip if unavailable."""
    url: str = request.param
    try:
        device = open_rig(url)
    except Exception as exc:  # noqa: BLE001
        pytest.skip(
            f"No FTDI device at {url} ({exc}). "
            "Use --ftdi-url or set FTDI_URL. "
            "On Linux, unbind ftdi_sio first (see README)."
        )
    yield device
    try:
        drive(device, False, False)
    finally:
        device.close()
