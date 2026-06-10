# CI-RUNNER-SETUP.md — standing up CI

CI is defined in two mirrored pipelines that have so far been **dormant** (no
runner / Actions enabled):

- `/.gitlab-ci.yml` — the canonical pipeline, meant to run on a **GitLab
  Runner on the CI host (`Agentlab1`, a VM with no USB ports)** using a
  **shell executor**.
- `/.github/workflows/ci.yml` — the GitHub mirror; its non-hardware jobs run on
  **GitHub-hosted `ubuntu-latest`**, so they need nothing beyond enabling
  Actions.

This document is the one-time setup to make both run. It does **not** cover the
hardware-in-loop jobs, which run on a separate `hil-hardware`-tagged runner on
the rig machine (see `hil-preflight/rpi5-gitlab-runner-setup.md` and the `hw`
stage comments in `.gitlab-ci.yml`).

## What runs where

| Job | Platform | Runner | Needs |
|---|---|---|---|
| `ftdi-driver`, `terminal-app`, `terminal-app:e2e`, `python-suites` | GitLab | Agentlab1 (shell) | Node 22, npm, python3, Playwright browser deps |
| same four (`*-e2e` etc.) | GitHub | GitHub-hosted `ubuntu-latest` | nothing (Actions enabled) |
| `*:test:hw` / `hardware` | both | `hil-hardware` self-hosted | real USB devices |

The `check`-stage jobs are **untagged** — register Agentlab1's runner with
"Run untagged jobs" enabled so it picks them up.

---

## 1. Host prerequisites (Agentlab1)

The shell executor runs jobs directly on the host as the `gitlab-runner` user,
so the toolchain must be installed system-wide (on `PATH` for that user).

```bash
# Node 22 LTS or later (NodeSource). Agentlab1 currently runs Node 24.
# Use the appropriate setup script for the target LTS version.
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs

# python3 is used by python-suites' compile smoke (usually already present)
sudo apt-get install -y python3

node --version   # v22.x or v24.x
npm --version
```

Install the **Playwright browser OS libraries** once (this is the only step
that needs root; the per-job `npx playwright install chromium` only fetches the
browser binary into the runner user's cache and needs no sudo):

```bash
# from a throwaway checkout, or the runner's build dir after the first run
cd terminal-app && npm ci
sudo npx playwright install-deps chromium
```

---

## 2. Install the GitLab Runner

```bash
# Install the runner package (Debian/Ubuntu)
curl -L "https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.deb.sh" | sudo bash
sudo apt-get install -y gitlab-runner
```

The package creates the `gitlab-runner` system user and installs the systemd
service. The service runs as **root** and uses `su -s /bin/bash gitlab-runner`
to execute each job as the `gitlab-runner` user. Do not add `User=gitlab-runner`
to the service file — see the Troubleshooting section.

### 2a. Populate the runner user's home with the skel bash files

The `gitlab-runner` Debian package creates the `gitlab-runner` user as a
**system user** (`adduser --system`, uid < 1000). System users intentionally
do not get their home directory populated from `/etc/skel` — so `.bashrc`,
`.bash_logout`, and `.profile` are all absent after installation.

By contrast, the Pi5 binary install (see `hil-preflight/rpi5-gitlab-runner-setup.md`)
used `useradd --create-home` (a regular user), which does copy skel — but then
inherits the dangerous `.bash_logout`. Either way, all three files need
explicit attention.

Copy the harmless skel files now so the state is known and reproducible:

```bash
sudo cp /etc/skel/.bashrc  /home/gitlab-runner/.bashrc
sudo cp /etc/skel/.profile /home/gitlab-runner/.profile
sudo chown gitlab-runner:gitlab-runner \
  /home/gitlab-runner/.bashrc \
  /home/gitlab-runner/.profile
```

### 2b. Fix `.bash_logout`  ← CRITICAL

`/etc/skel/.bash_logout` calls `clear_console -q`, which exits 1 when there is
no controlling tty. The runner prepare-script sets `set -o errexit`, so that
non-zero exit propagates back as a "prepare environment" failure — **every job
fails**.

Replace it with a no-op:

```bash
echo '# no-op for CI runner — clear_console fails without a tty' | \
  sudo tee /home/gitlab-runner/.bash_logout
sudo chown gitlab-runner:gitlab-runner /home/gitlab-runner/.bash_logout
```

Symptom if missed: `Job failed: prepare environment: exit status 1`.

### 2c. Install git-lfs (system-wide)  ← REQUIRED

The runner calls `git lfs install` during the prepare step. Without the binary,
`git` exits 1 and every job fails at prepare. Install it system-wide so it is
available regardless of which user account runs jobs, and register the LFS
filters at both the system and per-user level:

```bash
sudo apt-get install -y git-lfs

# System-level: writes /etc/gitconfig [filter "lfs"] — works for all users
sudo git lfs install --system

# Per-user: writes /home/gitlab-runner/.gitconfig — belt-and-suspenders
sudo -u gitlab-runner bash -c 'cd /tmp && git lfs install'
```

Verify:

```bash
sudo -u gitlab-runner bash -c 'cd /tmp && git lfs version'
# → git-lfs/3.x.y (...)
```

GitLab CE does not support the LFS locking API. Suppress the warning that
appears on every `git push` (affects all users on the host):

```bash
sudo git config --system \
  lfs.https://<gitlab-instance>/<group>/unified-serial-term.git/info/lfs.locksverify \
  false
```

### 2d. Register with GitLab

In GitLab: **project → Settings → CI/CD → Runners → New project runner**.
Set **Run untagged jobs = on** (the check jobs carry no `tags:` so only an
untagged runner picks them up), create it, and copy the runner authentication
token (`glrt-…`). Then:

```bash
sudo gitlab-runner register \
  --non-interactive \
  --url "https://<gitlab-instance>" \
  --token "glrt-XXXXXXXXXXXXXXXXXXXX" \
  --executor "shell" \
  --description "Agentlab1 shell runner"
```

The runner now polls the project. Because it's a shell executor, there is no
`image:` to pull — jobs use the host toolchain from step 1.

### 2e. Sudoers for the deploy job

The `terminal-app:deploy:staging` job runs `sudo rsync` and `sudo chown` to
publish the static bundle to the web root. Grant scoped passwordless sudo:

```bash
echo 'gitlab-runner ALL=(root) NOPASSWD: /usr/bin/rsync, /usr/bin/chown' | \
  sudo tee /etc/sudoers.d/gitlab-runner-deploy
sudo chmod 440 /etc/sudoers.d/gitlab-runner-deploy
sudo visudo -c    # syntax check — must say "parsed OK"
```

> Optional: to run the `@hardware` e2e tests on a USB-equipped runner too, set
> `TERMINAL_HW_TEST=1` as a CI/CD variable (project → Settings → CI/CD →
> Variables). On Agentlab1 (no USB) leave it unset — the suite skips the 4
> `@hardware` tests and runs the 38 mock tests.

---

## 3. Set CI/CD variables in GitLab

**Project → Settings → CI/CD → Variables**

| Variable | Value | Notes |
|---|---|---|
| `DEPLOY_SITE_HOST` | `serial-lab.test.delivery-academy.se` | Used by `fetch-build-deploy.sh` to verify HTTPS after publish. Without it the deploy job still succeeds but skips the final curl check. |

---

## 4. Enable GitHub Actions

The GitHub workflow's non-hardware jobs already target GitHub-hosted
`ubuntu-latest`, so there is no runner to install:

1. On the GitHub mirror: **Settings → Actions → General → Allow all actions**,
   and ensure workflows are enabled for the repo.
2. Push (or re-run) — the `changes` job gates each component job, and
   `terminal-app-e2e` installs its own browser with
   `npx playwright install --with-deps chromium` (GitHub-hosted runners have
   sudo, so `--with-deps` is fine there).

The `hardware` job stays `workflow_dispatch`-only on the self-hosted
`hil-hardware` runner.

---

## 5. Verify

Trigger a pipeline (push any commit touching `terminal-app/**` or
`ftdi-driver/**`, or use **CI/CD → Pipelines → Run pipeline** in the GitLab
UI):

- [ ] GitLab: `terminal-app` / `terminal-app:e2e` show up and run on Agentlab1
      (not "stuck pending" — that means no runner matched; check "Run untagged
      jobs" and `sudo gitlab-runner status`).
- [ ] `terminal-app:e2e` passes; on failure it uploads `test-results/`
      (traces + screenshots) as an artifact.
- [ ] On a push to `main`: `terminal-app:deploy:staging` runs and the site
      answers 200 at `https://serial-lab.test.delivery-academy.se/`.
- [ ] GitHub: the same check jobs run green on `ubuntu-latest`.

---

## Troubleshooting

### Every job fails: "prepare environment: exit status 1"

Three root causes on Debian/Trixie — check in order:

**1. `clear_console` in `~/.bash_logout`** (most common)

The runner prepare-script sets `errexit`. When the login shell for the
`gitlab-runner` user exits, bash sources `~/.bash_logout`. If that file
contains the Debian default `clear_console -q` call and there is no tty, the
command exits 1 and the failure propagates.

Fix: step 2b above. Confirm with:
```bash
sudo cat /home/gitlab-runner/.bash_logout
# should be a single comment line, nothing executable
```

**2. `git-lfs` not installed**

The runner calls `git lfs install` during prepare. If the binary is absent,
`git` reports "not a git command" and exits 1.

Fix: step 2c above. Confirm with:
```bash
sudo -u gitlab-runner bash -c 'cd /tmp && git lfs version'
```

**3. Wrong service configuration (`User=` + `--user` conflict)**

If `User=gitlab-runner` is added to the systemd service file while
`--user gitlab-runner` is still in `ExecStart`, the daemon (uid `gitlab-runner`)
tries to `su` to itself — PAM rejects that without a password.

The correct layout written by `gitlab-runner install`:
- Service runs as **root** (no `User=` directive)
- `ExecStart` carries `--user gitlab-runner`

Check with `systemctl cat gitlab-runner | grep -E 'User=|--user'`.

> See `hil-preflight/rpi5-gitlab-runner-setup.md` for the same issues
> encountered while setting up the Pi5 HIL runner, including additional detail
> on the `User=` pitfall and the arm64 binary install path.

### `terminal-app:e2e` fails: "port already in use"

```
Error: http://localhost:5173 is already used …
```

A stale Vite dev server from a previous job or developer session is squatting
on port 5173. The `.gitlab-ci.yml` already includes `fuser -k 5173/tcp || true`
before `npm run test:e2e` to guard against this. If the error recurs, find and
kill the process manually:

```bash
fuser -k 5173/tcp
# or: ss -tlnp | grep 5173, then kill <pid>
```
