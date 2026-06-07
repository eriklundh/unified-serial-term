# macOS HIL GitLab Runner Setup

How to install and register a hardware-in-the-loop (HIL) GitLab Runner on
macOS with a Pico CDC test rig and an FTDI loopback plug physically attached.

The target machine is a **Mac Mini (Late 2014, Intel Core i5, macOS 12
Monterey)**.  Being Intel and an older model, it is slower than the Pi5 runner;
timeouts are set conservatively to account for this.

The runner picks up the manual `terminal-app:test:hw` and `ftdi-driver:test:hw`
jobs from the `hw` stage.

---

## Prerequisites

- macOS 12 Monterey (tested; 13+ should work identically)
- USB ports for the Pico and the FTDI loopback plug
- Xcode Command Line Tools (`xcode-select --install`)
- Homebrew (<https://brew.sh>)
- The `ftdi-unbind` companion repo cloned as a sibling of `unified-serial-term`
  (see Step 0)
- A GitLab runner authentication token (`glrt-…`) with the `hil-hardware` tag
  already set in GitLab (see Step 6)

---

## 0  Clone the ftdi-unbind companion repo

`pyftdi` needs the Apple FTDI kext unloaded before it can claim the device.
The `ftdi-unbind` script handles this (and the corresponding `ftdi-bind` to
restore it).  It lives in a sibling repository that must be checked out
alongside `unified-serial-term`.

```bash
# From the parent directory that contains unified-serial-term/:
cd "$(dirname "$(git -C . rev-parse --show-toplevel)")"   # up one level
git clone git@gitlab.compelcon.se:unified-serial-terminal/ftdi-unbind.git
```

After cloning, the layout should be:

```
<parent>/
├── ftdi-unbind/
│   └── macos-linux/
│       ├── ftdi-unbind    ← driver-release script
│       └── ftdi-bind      ← driver-restore script
└── unified-serial-term/
    └── hil-preflight/     ← (this doc)
```

From any component subdirectory (e.g. `hil-preflight/`), the scripts are at
`../../ftdi-unbind/macos-linux/ftdi-unbind`.

Make the scripts executable (needed once after cloning):

```bash
chmod +x ../../ftdi-unbind/macos-linux/ftdi-unbind
chmod +x ../../ftdi-unbind/macos-linux/ftdi-bind
```

---

## 1  Install toolchain via Homebrew

```bash
brew update
brew install node git-lfs libusb python@3.12
```

| Package | Why |
|---|---|
| `node` | `npm ci` and `npm run test:hw` |
| `git-lfs` | Runner prepare step calls `git lfs install` |
| `libusb` | Runtime dependency for `pyftdi` / `pyusb` |
| `python@3.12` | `preflight.sh` bootstraps a venv and runs pytest |

Verify:

```bash
node --version      # v22.x or v24.x
python3 --version   # Python 3.12.x
git lfs version     # git-lfs/3.x
pkg-config --modversion libusb-1.0   # 1.0.x
```

Homebrew links `python3` and puts it on PATH; `python3 -m venv` (used by
`preflight.sh`) works without any extra setup.

---

## 2  Register git-lfs filters

```bash
git lfs install   # writes ~/.gitconfig [filter "lfs"]
```

Suppress the GitLab CE locking-API warning:

```bash
git config --global \
  lfs.https://gitlab.compelcon.se/unified-serial-terminal/unified-serial-term.git/info/lfs.locksverify \
  false
```

---

## 3  Install Python test dependencies (smoke check)

The preflight venv is created fresh each time, but you can verify the
packages resolve correctly now:

```bash
pip3 install --dry-run pyftdi pyusb pyserial pytest 2>&1 | grep -i error || echo "ok"
```

---

## 4  Install gitlab-runner

Install via Homebrew (preferred — keeps the binary up to date with `brew
upgrade`):

```bash
brew install gitlab-runner
```

> **Alternatively**, download the binary directly:
> ```bash
> sudo curl -L "https://gitlab-runner-downloads.s3.amazonaws.com/latest/binaries/gitlab-runner-darwin-amd64" \
>   -o /usr/local/bin/gitlab-runner
> sudo chmod +x /usr/local/bin/gitlab-runner
> gitlab-runner --version
> ```
> The manual binary is not updated by `brew upgrade` — prefer the Homebrew
> package unless the version from Homebrew lags behind.

---

## 5  Install and start the service

The Homebrew formula handles the `launchd` service automatically:

```bash
brew services start gitlab-runner
brew services list | grep gitlab-runner   # should show "started"
```

The service runs as the **current user** (not root), which is the correct
model on macOS.  Jobs execute as that same user.

The service plist is written to `~/Library/LaunchAgents/homebrew.mxcl.gitlab-runner.plist`
and is loaded on login.

> **If you installed the binary manually** (not via Homebrew), install the
> service by hand:
> ```bash
> gitlab-runner install --user "$(whoami)" --working-directory "$HOME"
> gitlab-runner start
> gitlab-runner status
> ```
> This writes `~/Library/LaunchAgents/gitlab-runner.plist`.

---

## 6  Register with GitLab

In GitLab: **group → Settings → CI/CD → Runners → New group runner**.
Set the tags `hil-hardware`, `macos-hw` before saving, then copy the
`glrt-…` token.

```bash
gitlab-runner register \
  --non-interactive \
  --url "https://gitlab.compelcon.se" \
  --token "glrt-XXXXXXXXXXXXXXXXXXXX" \
  --executor "shell" \
  --description "mac-mini-2014-hw"
```

The config is written to `~/.gitlab-runner/config.toml`.

Verify:

```bash
gitlab-runner verify
gitlab-runner status
```

---

## 7  Tune timeouts for the 2014 Intel hardware

This machine is CPU-constrained.  `npm ci` (dependency install) and the
Python venv bootstrap take noticeably longer than on the Pi5.  Add a
conservative global job timeout to `~/.gitlab-runner/config.toml`:

```toml
[[runners]]
  name = "mac-mini-2014-hw"
  # ... other fields ...
  output_limit = 4096

  [runners.custom_build_dir]

  [runners.cache]
```

Edit the `[[runners]]` block to add (the default is 3600 s / 1 h):

```toml
[[runners]]
  name = "mac-mini-2014-hw"
  request_timeout = 60
```

`request_timeout` is how long the runner waits for a job to be assigned —
not the job execution time.  The job timeout is set per-job in
`.gitlab-ci.yml`.  If hw jobs start timing out during execution, increase
the per-job `timeout:` there rather than here:

```yaml
# in .gitlab-ci.yml, under the .hw template:
terminal-app:test:hw:
  extends: .hw
  timeout: 15m   # bump from the default 1h if needed for a slow machine
```

> The 1-hour default is almost certainly enough.  Baseline the real run time
> on this machine before changing anything.

---

## 8  USB device setup

### Pico CDC test rig

On macOS the Pico appears as `/dev/cu.usbmodem*` (e.g. `/dev/cu.usbmodem11301`).
The Pico test suite should auto-detect it.  If multiple CDC devices are
connected, pass `--port` explicitly:

```bash
# find the device:
ls /dev/cu.usbmodem*

# pass it via an env var or package.json edit:
"pretest:hw": "bash ../hil-preflight/preflight.sh --port /dev/cu.usbmodem11301"
```

### FTDI loopback plug

`pyftdi` accesses the FTDI chip via libusb directly, bypassing the OS driver.
The Apple FTDI kext (`com.apple.driver.AppleUSBFTDI`) claims the device on
plug-in and must be unloaded first.  Use the `ftdi-unbind` script from the
companion repo (Step 0):

```bash
# Release the device for pyftdi:
../../ftdi-unbind/macos-linux/ftdi-unbind 0403:6015
# → auto-escalates to sudo; unloads AppleUSBFTDI (and FTDIUSBSerialDriver if present)

# Verify pyftdi can see it:
../../ftdi-unbind/macos-linux/ftdi-unbind --list
# → VID:PID column for 0403:6015 should show driver "(none)"

# Restore the kext (e.g. for Web Serial browser use), or just unplug/replug:
../../ftdi-unbind/macos-linux/ftdi-bind 0403:6015
```

> **macOS kext unload is global** — all attached FTDI devices are released
> at once, not just the one specified.  On a single-device rig this is fine.

> **SIP note (macOS 11+):** System Integrity Protection may prevent unloading
> the Apple-supplied `AppleUSBFTDI` kext on some macOS versions.  The script
> prints a specific hint if this happens, including the Recovery OS workaround.
> On macOS 12 Monterey (Intel) this has not been a problem in practice.

For the CI hw test jobs to work without manual intervention, the runner's
login user needs passwordless sudo for the `ftdi-unbind` script:

```bash
SCRIPT="$(realpath ../../ftdi-unbind/macos-linux/ftdi-unbind)"
echo "$(whoami) ALL=(root) NOPASSWD: $SCRIPT" | sudo tee /etc/sudoers.d/ftdi-unbind
sudo chmod 440 /etc/sudoers.d/ftdi-unbind
sudo visudo -c   # syntax check
```

### USB access permissions (macOS 12 Monterey)

macOS 12 does not require explicit TCC permission grants for USB serial
devices accessed from the terminal.  If future macOS upgrades add a privacy
prompt, grant it to Terminal (or whichever app the runner's login shell
opens through).

---

## Runner control

The runner service is managed by `launchd` for the current user.  It starts
automatically at login.

### Brew services (recommended)

```bash
brew services stop gitlab-runner    # stop and don't restart at login
brew services start gitlab-runner   # start and restart at login
brew services restart gitlab-runner # restart (e.g. after config change)
brew services list | grep gitlab    # check status
```

### Manual (if installed without Homebrew)

```bash
gitlab-runner stop
gitlab-runner start
gitlab-runner status
```

### GitLab UI pause (for remote control)

**Admin area → CI/CD → Runners → `mac-mini-2014-hw` → Pause.**  The service
keeps running but GitLab won't assign jobs to it.  Useful when the machine is
available but you don't want hw tests running — e.g. during a manual
debugging session with the USB devices held by another process.

---

## Differences from the Pi5 runner

| | Pi5 (Raspberry OS Trixie) | Mac Mini 2014 (macOS 12) |
|---|---|---|
| Runner install | apt package (auto-updates) | Homebrew formula (auto-updates) |
| Service manager | systemd | launchd |
| Runner runs as | `gitlab-runner` user (created by package) | your login user |
| libusb | `apt install git-lfs` | `brew install libusb` |
| FTDI kext clash | Not applicable (Linux udev) | `ftdi-unbind 0403:6015` (companion repo) |
| Pico port pattern | `/dev/ttyACM0` | `/dev/cu.usbmodem*` |
| `.bash_logout` hazard | Yes (must replace with no-op) | Not applicable (macOS) |
| Expected speed | Faster | Slower (2014 Intel Core i5) |

The macOS runner does **not** have the `.bash_logout` / `clear_console` issue
that affects both Linux installs.  macOS bash does not source `.bash_logout`
in the same way.

---

## What was installed / changed

| Path | Purpose |
|---|---|
| `/opt/homebrew/bin/gitlab-runner` (Apple Silicon) or `/usr/local/bin/gitlab-runner` (Intel) | Runner binary, managed by Homebrew |
| `~/Library/LaunchAgents/homebrew.mxcl.gitlab-runner.plist` | launchd service definition |
| `~/.gitlab-runner/config.toml` | Runner configuration |
| `~/.gitconfig` | LFS filter + `locksverify = false` |

---

## Troubleshooting

### `brew services start` shows the runner as `error`

```bash
cat ~/Library/Logs/homebrew.mxcl.gitlab-runner.log
```

Common cause: stale config.toml with an expired token.  Re-register with a
fresh token.

### `pyftdi` raises `USBError: Access denied`

The Apple FTDI kext is loaded.  Run:

```bash
../../ftdi-unbind/macos-linux/ftdi-unbind 0403:6015
```

It auto-escalates to sudo.  If it reports a SIP restriction, see the hint it
prints — the Recovery OS workaround is described there.

### `pyusb` raises `NoBackendError`

`libusb` is not installed or not on the dylib search path.  Check:

```bash
brew list libusb   # should list files
pkg-config --modversion libusb-1.0   # should print a version
```

If Homebrew libusb is installed but pyusb still can't find it, set the
library path:

```bash
export DYLD_LIBRARY_PATH="$(brew --prefix libusb)/lib:$DYLD_LIBRARY_PATH"
```

To make this permanent for the runner's shell, add it to `~/.zshrc` (or
`~/.bash_profile` if the runner shell is bash).

### Jobs are slow / timing out

Expected on this machine.  Profile locally:

```bash
time npm run test:hw
```

Then set the per-job timeout in `.gitlab-ci.yml` to 1.5× the observed time,
with a minimum of 5 minutes.

### Runner not picking up jobs after machine wakes from sleep

macOS may suspend network connections during sleep, which can drop the
runner's long-poll connection to GitLab.  The runner reconnects automatically
after ~30 s once the network is back.  If it doesn't, restart:

```bash
brew services restart gitlab-runner
```

To prevent this: System Settings → Battery → Wake for network access → On.
