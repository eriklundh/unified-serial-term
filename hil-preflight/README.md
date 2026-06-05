# hil-preflight

Hardware-in-the-loop preflight verification for the unified-serial-terminal
test stack.

Runs two independent hardware checks in sequence and fails fast if either
device is missing or misbehaving:

| Step | Suite | Device | Library |
|------|-------|--------|---------|
| 1/2 | `pico-cdc-test-rig/py-verify/` | Raspberry Pi Pico (CDC loopback) | pyserial |
| 2/2 | `ftdi-loopback-verify/` | FT231X loopback plug | pyftdi |

Both sub-suites are independently runnable — this directory only orchestrates
them. See each sub-suite's own README for device-specific setup.

## When to run

Before any HIL test run in `ftdi-driver` or `terminal-app` that
requires real USB hardware. A failed preflight means the hardware environment
is not ready; the browser-facing tests will fail with confusing errors rather
than a clear hardware diagnosis.

## Usage

```bash
# From any directory — auto-detects both devices
./hil-preflight/preflight.sh

# Override serial port for the Pico
./hil-preflight/preflight.sh --port /dev/ttyACM0

# Override FTDI device URL
./hil-preflight/preflight.sh --ftdi-url ftdi://ftdi:231x/1

# Both overrides, plus extra pytest flags
./hil-preflight/preflight.sh --port /dev/ttyACM0 --ftdi-url ftdi://ftdi:231x/1 -x
```

First run bootstraps a `.venv` inside `hil-preflight/` and installs pyserial +
pyftdi + pytest. Subsequent runs reuse the existing venv.

## Integration with downstream repos

Call `preflight.sh` as a prerequisite step before the main test command.
The script exits 0 only when both devices pass; any other exit code means
hardware is not ready.

**Shell / Makefile:**
```bash
../hil-preflight/preflight.sh && npm test
```

**pytest conftest.py** (session-scoped gate):
```python
import subprocess
from pathlib import Path
import pytest

@pytest.fixture(scope="session", autouse=True)
def hil_preflight():
    script = Path(__file__).parent.parent / "hil-preflight" / "preflight.sh"
    result = subprocess.run([str(script)], check=False)
    if result.returncode != 0:
        pytest.exit("HIL preflight failed — hardware not ready.", returncode=1)
```

**CI (GitHub Actions example):**
```yaml
- name: HIL preflight
  run: ./hil-preflight/preflight.sh
- name: Run HIL tests
  run: npm test
```

## Directory layout

```
hil-preflight/
├── preflight.sh        entry point — runs both sub-suites
├── requirements.txt    pyserial + pyftdi + pytest (shared venv)
└── README.md           this file
```

The sub-suites it calls:
```
../pico-cdc-test-rig/py-verify/   Pico CDC verification
../ftdi-loopback-verify/           FTDI loopback verification
```
