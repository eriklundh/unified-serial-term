# RPi5 HIL GitLab Runner Setup

How to install and register a hardware-in-the-loop (HIL) GitLab Runner on a
Raspberry Pi 5 running Raspberry OS Trixie (Debian 13, aarch64).

The runner executes CI jobs directly on the Pi so that scripts like
`diagnosis.sh`, `ftdi-unbind`, and `ftdi-bind` can be tested against real
connected FTDI hardware without SSH.

---

## Prerequisites

- Raspberry Pi 5, Raspberry OS Trixie (arm64)
- An FTDI device (e.g. ULX3S, VID:PID `0403:6015`) connected via USB
- A GitLab instance with a group or project runner token
- `sudo` access

---

## 1  Install gitlab-runner via the official apt repository

Use the apt repository so that `apt upgrade` keeps the runner current.
Do **not** download the binary manually — a manually-placed binary at
`/usr/local/bin/gitlab-runner` is invisible to `apt` and will never be
updated.

```bash
curl -L "https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.deb.sh" | sudo bash
sudo apt-get install -y gitlab-runner
apt list --installed 2>/dev/null | grep gitlab-runner   # confirm package is registered
gitlab-runner --version                                  # confirm arm64, version ≥ 19.x
```

The script adds the GitLab Runner apt source to
`/etc/apt/sources.list.d/` and imports the signing key.  After this,
`sudo apt upgrade` will update the runner alongside everything else.

### 1a  Migrating from a manually-downloaded binary

If `gitlab-runner` was previously installed by downloading the binary directly
to `/usr/local/bin/gitlab-runner`, the apt package will install a **second**
copy at `/usr/bin/gitlab-runner` but the existing systemd service file will
still reference the old path.  After installing via apt, regenerate the service
file and restart:

```bash
sudo apt-get install -y gitlab-runner
sudo gitlab-runner install \
  --user=gitlab-runner \
  --working-directory=/home/gitlab-runner
sudo systemctl daemon-reload
sudo systemctl restart gitlab-runner
sudo gitlab-runner status

# Optional: remove the old manual binary
sudo rm -f /usr/local/bin/gitlab-runner
```

`apt list --installed 2>/dev/null | grep gitlab-runner` will now show the
package as managed.

## 2  Create the runner user

```bash
sudo useradd --comment 'GitLab Runner' --create-home gitlab-runner --shell /bin/bash
sudo usermod -aG dialout gitlab-runner   # USB serial port access
```

## 3  Fix the gitlab-runner user's .bash_logout  ← CRITICAL

The default Debian `~/.bash_logout` (in `/home/gitlab-runner/`) calls
`clear_console -q`, which exits 1 when there is no tty.  The runner
prepare-script sets `set -o errexit`, so when the login shell for the
`gitlab-runner` user exits it sources that file, `clear_console` fails, and
the non-zero exit propagates back to the runner as a "prepare environment"
failure.

```bash
echo '# no-op for CI runner — clear_console fails without a tty' | \
  sudo -u gitlab-runner tee /home/gitlab-runner/.bash_logout
```

Without this fix every job fails with:
> Job failed: prepare environment: exit status 1

## 4  Install git-lfs

The runner calls `git lfs install` during prepare.  Without it the prepare
script fails.

```bash
sudo apt-get install -y git-lfs

# System-level: works for all users regardless of home-dir state
sudo git lfs install --system

# Per-user: belt-and-suspenders for older runner versions
sudo -u gitlab-runner bash -c 'cd /tmp && git lfs install'
```

### 4a  Suppress the LFS locking-API warning

GitLab CE does not implement the LFS locking API.  Without this setting,
every `git push` (and CI jobs that push) prints a noisy warning:

```
Remote "origin" does not support the Git LFS locking API.
```

Suppress it system-wide:

```bash
sudo git config --system \
  lfs.https://<your-gitlab-host>/<group>/<repo>.git/info/lfs.locksverify \
  false
```

For this project:

```bash
sudo git config --system \
  lfs.https://gitlab.compelcon.se/unified-serial-terminal/unified-serial-term.git/info/lfs.locksverify \
  false
```

## 5  Install and start the service

```bash
sudo gitlab-runner install \
  --user=gitlab-runner \
  --working-directory=/home/gitlab-runner
sudo systemctl daemon-reload
sudo systemctl enable --now gitlab-runner
sudo gitlab-runner status
```

> **Note:** `gitlab-runner install` writes
> `/etc/systemd/system/gitlab-runner.service`.  The service runs as **root**
> and uses `su -s /bin/bash gitlab-runner` to execute each job as the
> `gitlab-runner` user.  Do NOT add `User=gitlab-runner` to the service file
> and do NOT remove the `--user gitlab-runner` flag — both of those break the
> su handoff (see Troubleshooting below).

## 6  Grant passwordless sudo

This Pi is a dedicated hardware test device.  Giving the runner full
passwordless sudo is the simplest way to let it run `ftdi-unbind` and
`ftdi-bind` (which write to sysfs and require root).

```bash
echo 'gitlab-runner ALL=(ALL) NOPASSWD: ALL' | \
  sudo tee /etc/sudoers.d/gitlab-runner
sudo chmod 440 /etc/sudoers.d/gitlab-runner
sudo visudo -c    # syntax check
```

## 7  Register with GitLab

Obtain a runner authentication token from GitLab:
- **Group-scoped** (recommended): group → Settings → CI/CD → Runners → New group runner
- **Project-scoped**: project → Settings → CI/CD → Runners → New project runner

Set the desired tags (e.g. `rpi5`, `hardware`, `arm64`) on the GitLab side
before registering.  With the new `glrt-` token format, tags cannot be set
via the CLI.

```bash
sudo gitlab-runner register \
  --non-interactive \
  --url "https://<your-gitlab-host>" \
  --token "<glrt-...token...>" \
  --executor "shell" \
  --description "picotester-rpi5"
```

Verify:

```bash
sudo gitlab-runner verify
```

---

## What was installed / changed

| Path | Purpose |
|---|---|
| `/usr/bin/gitlab-runner` | Runner binary, managed by apt |
| `/etc/systemd/system/gitlab-runner.service` | Systemd unit (root daemon, `--user gitlab-runner`) |
| `/etc/gitlab-runner/config.toml` | Runner config (owned by `gitlab-runner`) |
| `/etc/sudoers.d/gitlab-runner` | Passwordless sudo for HIL scripts |
| `/home/gitlab-runner/.bash_logout` | No-op (suppresses `clear_console` tty error) |
| `/home/gitlab-runner/.gitconfig` | LFS filter written by `git lfs install` (per-user) |
| `/etc/gitconfig` | LFS filter (system-wide) + `locksverify = false` |

## Differences from the Agentlab1 runner

Both runners are now installed from the same GitLab apt repository.  The
remaining differences are due to how the `gitlab-runner` OS user was created:

| | Pi5 | Agentlab1 |
|---|---|---|
| User type | Regular user uid=1001 (`useradd --create-home`) — **skel files copied** | System user uid=999 (`adduser --system`) — **skel files NOT copied** |
| `.bash_logout` on fresh install | Skel copy has `clear_console` — **must be replaced with no-op** | File absent — **must be created as no-op if user is recreated** |
| Node.js | v20 from Raspberry Pi apt repo | v24 from NodeSource apt repo |

The `.bash_logout` hazard affects both installs but from opposite directions:
the Pi5 gets the dangerous file automatically; Agentlab1 gets nothing but risks
getting it if the user is ever recreated from skel.

---

## Troubleshooting

### "prepare environment: exit status 1"

This error has three distinct root causes on Debian/Trixie; check in order:

**1. `clear_console` in the `gitlab-runner` user's `.bash_logout` (most likely)**

The runner prepare-script sets `set -o errexit`.  When the login shell for
the `gitlab-runner` user exits, bash sources `/home/gitlab-runner/.bash_logout`,
which runs `clear_console -q`.  With no controlling tty that command exits 1,
and `errexit` propagates that code back as the job exit code.

Fix: replace `/home/gitlab-runner/.bash_logout` with a no-op (Step 3 above).

**2. `git-lfs` not installed**

The runner calls `git lfs install` during prepare.  If `git-lfs` is not
installed, `git` reports "not a git command" and exits 1.

Fix: `sudo apt-get install -y git-lfs` (Step 4 above).

**3. `su` authentication failure (wrong service configuration)**

If `User=gitlab-runner` is added to the systemd service file AND `--user
gitlab-runner` is still in `ExecStart`, the daemon (uid 1001) tries to `su`
to itself.  PAM rejects that without a password.

If `--user gitlab-runner` is removed from `ExecStart` without adding
`User=gitlab-runner`, the "new shell command execution" feature in runner
19.x fails to pass the script content to bash when the daemon runs as root
with stdin=/dev/null.

The correct configuration: root daemon + `--user gitlab-runner` in
`ExecStart` + no `User=` directive in the service unit.

---

## CI pipeline

The `.gitlab-ci.yml` at the repo root defines two stages:

```yaml
default:
  tags: [rpi5]

stages:
  - diagnose
  - cycle

diagnose:
  stage: diagnose
  script:
    - bash diagnosis.sh "$FTDI_VID_PID"

bind-unbind-cycle:
  stage: cycle
  script:
    - sudo macos-linux/ftdi-unbind "$FTDI_VID_PID"
    - sleep 1
    - 'test -z "$(ls /dev/ttyUSB* 2>/dev/null)" && echo "PASS: no ttyUSB* after unbind" || { echo "FAIL: ttyUSB* still present after unbind"; exit 1; }'
    - sudo macos-linux/ftdi-bind "$FTDI_VID_PID"
    - sleep 1
    - 'ls /dev/ttyUSB* 2>/dev/null && echo "PASS: ttyUSB* present after rebind" || { echo "FAIL: no ttyUSB* after rebind"; exit 1; }'
  after_script:
    - sudo macos-linux/ftdi-bind "$FTDI_VID_PID" 2>/dev/null || true
```

The `bind-unbind-cycle` job fails hard if no `0403:6015` device is connected
to the runner host.  The `after_script` always resets the device state so the
runner host stays usable after a mid-test failure.
