# Windows HIL GitLab Runner Setup

How to install and register a hardware-in-the-loop (HIL) GitLab Runner on a
Windows 11 machine with a Pico CDC test rig and an FTDI loopback plug
physically attached.

The runner picks up the manual `terminal-app:test:hw` and `ftdi-driver:test:hw`
jobs from the `hw` stage.  The `check` stage runs on Agentlab1 (no USB) and
the macOS runner — Windows only handles the `hw` stage.

**This is an on-demand runner.**  The CI hw jobs are `when: manual`, so nobody
can trigger them unintentionally.  Service management (when to accept jobs) is
covered in the [Runner control](#runner-control) section.

---

## Prerequisites

- Windows 11 (64-bit)
- USB ports available for the Pico and the FTDI loopback plug
- The `ftdi-unbind` companion repo cloned as a sibling of `unified-serial-term`
  (contains `windows\ftdi-unbind.exe` and `windows\ftdi-bind.exe`)
- A GitLab runner authentication token (`glrt-…`) with the `hil-hardware` tag
  already set in GitLab (see Step 7)
- Administrator access

---

## 1  Install Git for Windows

`preflight.sh` is a bash script.  The CI jobs invoke it via `npm run test:hw`
which calls `bash ../hil-preflight/preflight.sh`.  Git for Windows ships with
Git Bash (MinGW) and puts `bash.exe` on the system PATH.

Download from <https://git-scm.com/download/win> and install with:
- **"Git from the command line and also from 3rd-party software"** (PATH option)
- **"Use Windows' default console window"** for the terminal emulator

After install, verify from a new PowerShell prompt:

```powershell
bash --version    # GNU bash, version 5.x
git --version     # git version 2.x
```

---

## 2  Install Node.js

The hw jobs run `npm ci` and `npm run test:hw`.

```powershell
winget install OpenJS.NodeJS.LTS
```

Or download the LTS `.msi` from <https://nodejs.org/>.  During install, leave
"Add to PATH" checked.

After install:

```powershell
node --version    # v22.x or v24.x
npm --version
```

---

## 3  Install Python 3

`preflight.sh` bootstraps a `.venv` and runs `pytest` inside it.  Python 3.11
or later is recommended.

```powershell
winget install Python.Python.3.12
```

Or download from <https://python.org/downloads/windows/>.  During install:
- Check **"Add Python to PATH"**
- Check **"Disable PATH length limit"** at the end

Verify:

```powershell
python --version    # Python 3.12.x
python3 --version   # same (the installer creates both aliases on Windows 3.11+)
```

> **Note:** `preflight.sh` calls `python3 -m venv`.  If `python3` is not on
> PATH (older installs), create a symlink or add the alias:
> ```powershell
> # Run once in an elevated prompt:
> New-Item -ItemType HardLink `
>   -Path "$env:LOCALAPPDATA\Programs\Python\Python312\python3.exe" `
>   -Target "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe"
> ```

---

## 4  Install libusb (required for pyftdi)

`pyftdi` uses `pyusb` which needs the `libusb-1.0` DLL at runtime.

**Option A — pip package (simplest):**

```powershell
pip install libusb-package
```

This puts `libusb-1.0.dll` in a location that pyusb finds automatically.

**Option B — manual DLL placement:**

Download the libusb Windows release from
<https://github.com/libusb/libusb/releases>, unzip it, and copy
`MS64\dll\libusb-1.0.dll` to `C:\Windows\System32\`.

Verify after pip installing pyusb + pyftdi:

```powershell
pip install pyusb pyftdi pyserial
python -c "import usb.core; print('libusb ok')"
```

---

## 5  Install git-lfs

```powershell
winget install GitHub.GitLFS
```

Or download the Windows installer from <https://git-lfs.com/>.

Register the LFS filters globally:

```powershell
git lfs install
```

Suppress the GitLab CE locking-API warning:

```powershell
git config --global `
  lfs.https://gitlab.compelcon.se/unified-serial-terminal/unified-serial-term.git/info/lfs.locksverify `
  false
```

> This writes to `%USERPROFILE%\.gitconfig`.  There is no "system" git config on
> Windows in the same sense as Linux — setting it globally (for the user account
> that runs the runner) is the right scope here.

---

## 6  Install gitlab-runner

Download the Windows binary and install it as a Windows Service.

```powershell
# Create a working directory
New-Item -ItemType Directory -Force "C:\GitLab-Runner"
Set-Location "C:\GitLab-Runner"

# Download the binary (check https://gitlab.com/gitlab-org/gitlab-runner/-/releases for latest)
Invoke-WebRequest -Uri "https://gitlab-runner-downloads.s3.amazonaws.com/latest/binaries/gitlab-runner-windows-amd64.exe" `
  -OutFile "gitlab-runner.exe"

# Install as a Windows Service (run from an elevated prompt)
.\gitlab-runner.exe install --working-directory "C:\GitLab-Runner" --user "SYSTEM"
```

The service is registered as **GitLab Runner** in the Windows Services panel.

> There is no apt/winget package for gitlab-runner on Windows — the binary
> must be updated manually by downloading a new release and restarting the
> service.  Check the GitLab Runner releases page periodically.

---

## 7  Register with GitLab

In GitLab: **group → Settings → CI/CD → Runners → New group runner**.
Set the tags `hil-hardware`, `windows-hw` before saving, then copy the
`glrt-…` token.

```powershell
Set-Location "C:\GitLab-Runner"
.\gitlab-runner.exe register `
  --non-interactive `
  --url "https://gitlab.compelcon.se" `
  --token "glrt-XXXXXXXXXXXXXXXXXXXX" `
  --executor "shell" `
  --shell "powershell" `
  --description "windows-laptop-hw"
```

Verify:

```powershell
.\gitlab-runner.exe verify
```

The `config.toml` is written to `C:\GitLab-Runner\config.toml`.

### Shell choice: PowerShell vs cmd

The `--shell powershell` flag tells the runner to invoke jobs via PowerShell.
This is the correct choice on Windows 11.  The CI job scripts call `npm` and
`bash` which are both on PATH; PowerShell has no trouble invoking them.

Do **not** use `--shell bash` — the runner would try to launch a bash login
shell for the outer job wrapper, which conflicts with how the Windows service
account works.

---

## 8  USB device setup

### Pico CDC test rig

The Pico appears as a virtual COM port (`COMx`) on Windows.  Device Manager →
Ports (COM & LPT) shows it as **USB Serial Device**.

`preflight.sh` accepts `--port COMx` to tell the Pico suite which port to use.
If the Pico always enumerates as the same port (common when only one CDC device
is plugged in), the auto-detection in the test suite should work.  If you need
to pass it explicitly, set a CI/CD variable or edit the npm script:

```json
"pretest:hw": "bash ../hil-preflight/preflight.sh --port COM4"
```

### FTDI loopback plug

`pyftdi` uses `libusb` to talk to the FTDI chip directly (bypassing the OS
serial driver).  This requires switching the loopback plug to the **WinUSB**
driver.

**For runtime use in CI — `ftdi-unbind.exe` (preferred):**

The `ftdi-unbind` companion repo (same sibling-repo layout as on macOS/Linux)
ships a `windows\ftdi-unbind.exe` that switches the driver programmatically
with the same flags as the bash script:

```powershell
# From the ftdi-unbind repo's windows\ directory (or add it to PATH):
.\ftdi-unbind.exe 0403:6015     # switch to WinUSB for pyftdi
.\ftdi-bind.exe   0403:6015     # switch back to VCP for Web Serial
.\ftdi-unbind.exe --list        # show all USB devices and current drivers
```

**For one-time initial setup — Zadig (fallback):**

If `ftdi-unbind.exe` is not yet compiled, use **Zadig** to bind WinUSB
manually:

1. Download from <https://zadig.akeo.ie/>
2. Plug in the FTDI loopback plug
3. Options → List All Devices
4. Select your FTDI device (VID `0403`, PID `6015`)
5. Set driver to **WinUSB** → **Replace Driver**

> **Loopback plug vs browser app:** both the browser's WebUSB backend and
> `pyftdi` need WinUSB binding.  The Web Serial backend needs the VCP driver.
> For this runner (hw tests only), WinUSB is the right persistent state.
> Use `ftdi-bind.exe` (or Zadig) to switch back if you need Web Serial from
> this machine.

---

## Runner control

The runner is a Windows Service.  **Jobs will only run while the service is
running** — so stopping the service is a hard gate: no jobs are accepted.

### From the GitLab UI (recommended for day-to-day)

**Admin area → CI/CD → Runners → `windows-laptop-hw` → Pause.**  The service
keeps running but GitLab won't assign jobs to it.  Unpause when you want it to
accept work.  This works remotely (from any browser).

### From PowerShell (elevated)

```powershell
Stop-Service "gitlab-runner"   # stop accepting jobs immediately
Start-Service "gitlab-runner"  # resume
Get-Service "gitlab-runner"    # check status
```

### From the Services panel

`Win + R` → `services.msc` → **GitLab Runner** → Start / Stop / Properties.

### Automatic vs on-demand startup

By default the service starts automatically at boot.  If you prefer it
on-demand (only accept jobs when you explicitly start it):

```powershell
# Set to Manual start — survives reboots without auto-starting
Set-Service "gitlab-runner" -StartupType Manual
```

To restore automatic start:

```powershell
Set-Service "gitlab-runner" -StartupType Automatic
```

### Recommended policy when others commit to the project

The hw jobs are `when: manual` and require the `windows-hw` tag, so nobody
can trigger them accidentally.  Keep the service running with **GitLab Pause**
as your lever: pause before you step away from the machine, unpause when
you're ready to run a hw test.

---

## What was installed / changed

| Location | Purpose |
|---|---|
| `C:\GitLab-Runner\gitlab-runner.exe` | Runner binary (manually updated) |
| `C:\GitLab-Runner\config.toml` | Runner configuration |
| Windows Service **GitLab Runner** | Service entry (runs as SYSTEM) |
| `%USERPROFILE%\.gitconfig` | LFS filter + `locksverify = false` |

---

## Troubleshooting

### `bash: command not found` in CI job log

Git for Windows is not on the system PATH seen by the SYSTEM service account.
Fix: re-run the Git for Windows installer and choose **"Git from the command
line and also from 3rd-party software"**, or manually add
`C:\Program Files\Git\bin` to the **System** (not User) PATH variable:
System Properties → Advanced → Environment Variables → System variables → Path.

Restart the `gitlab-runner` service after changing PATH.

### `python3: command not found` in preflight.sh

Windows Python installs only create `python.exe` on older versions.  Create
a `python3.exe` alias as shown in Step 3, or add `python3` to PATH by
symlinking it.

### `usb.core.NoBackendError` / pyftdi can't find libusb

The `libusb-1.0.dll` is not on the DLL search path.  Either install
`libusb-package` via pip (Option A in Step 4) or place the DLL in
`C:\Windows\System32\`.

### FTDI device not found by pyftdi

The loopback plug is still bound to the FTDI VCP driver.  Run
`ftdi-unbind.exe 0403:6015` (or open Zadig and rebind to WinUSB — Step 8).

### "prepare environment" failures

Unlike Linux, Windows does not have a `.bash_logout` issue.  If the runner
fails at prepare, check:
- `.\gitlab-runner.exe verify` — is the token still valid?
- Is the runner service running? (`Get-Service gitlab-runner`)
- Does `bash` resolve in a SYSTEM-context PowerShell? (Test via a scheduled
  task running as SYSTEM.)
