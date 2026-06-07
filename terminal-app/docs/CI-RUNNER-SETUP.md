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
the rig machine (see the `hw` stage comments in `.gitlab-ci.yml`).

## What runs where

| Job | Platform | Runner | Needs |
|---|---|---|---|
| `ftdi-driver`, `terminal-app`, `terminal-app:e2e`, `python-suites` | GitLab | Agentlab1 (shell) | Node 22, npm, python3, Playwright browser deps |
| same four (`*-e2e` etc.) | GitHub | GitHub-hosted `ubuntu-latest` | nothing (Actions enabled) |
| `*:test:hw` / `hardware` | both | `hil-hardware` self-hosted | real USB devices |

The `check`-stage jobs are **untagged** — register Agentlab1's runner with
"Run untagged jobs" enabled so it picks them up.

## 1. Host prerequisites (Agentlab1)

The shell executor runs jobs directly on the host as the `gitlab-runner` user,
so the toolchain must be installed system-wide (on `PATH` for that user).

```bash
# Node 22 (NodeSource), system-wide so the gitlab-runner user sees it
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# python3 is used by python-suites' compile smoke (usually already present)
sudo apt-get install -y python3

node --version   # v22.x
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

## 2. Install and register the GitLab Runner

```bash
# Install the runner (Debian/Ubuntu)
curl -L "https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.deb.sh" | sudo bash
sudo apt-get install -y gitlab-runner
```

### 2a. Fix the runner user's `.bash_logout`  ← CRITICAL

The default Debian `/etc/skel/.bash_logout` calls `clear_console -q`, which
exits 1 when there is no controlling tty. The runner's prepare-script sets
`set -o errexit`, so if the file is ever sourced on shell exit, that non-zero
exit propagates back as a "prepare environment" failure. Pre-empt this:

```bash
echo '# no-op for CI runner — clear_console fails without a tty' | \
  sudo tee /home/gitlab-runner/.bash_logout
sudo chown gitlab-runner:gitlab-runner /home/gitlab-runner/.bash_logout
```

Without this, every job may fail with:
> Job failed: prepare environment: exit status 1

(The `gitlab-runner` package installer may or may not create the user with a
copy of `/etc/skel/.bash_logout` — create the no-op explicitly to be safe.)

### 2b. Install git-lfs

The runner calls `git lfs install` during prepare on some configurations. If
`git-lfs` is missing and the runner invokes it, the prepare step fails.

```bash
sudo apt-get install -y git-lfs
sudo -u gitlab-runner bash -c 'cd /tmp && git lfs install'
```

### 2c. Register

In GitLab: **project → Settings → CI/CD → Runners → New project runner**.
Set **Run untagged jobs = on** (the check jobs are untagged), create it, and
copy the **runner authentication token** (`glrt-…`). Then:

```bash
sudo gitlab-runner register \
  --non-interactive \
  --url "https://gitlab.compelcon.se" \
  --token "glrt-XXXXXXXXXXXXXXXXXXXX" \
  --executor "shell" \
  --description "Agentlab1 shell runner"
```

The runner now polls the project. Because it's a shell executor, there's no
`image:` to pull — jobs use the host toolchain from step 1.

### 2d. Sudoers for the deploy job

The `terminal-app:deploy:staging` job runs `sudo rsync` and `sudo chown` to
publish the static bundle to the web root. Grant scoped passwordless sudo:

```bash
echo 'gitlab-runner ALL=(root) NOPASSWD: /usr/bin/rsync, /usr/bin/chown' | \
  sudo tee /etc/sudoers.d/gitlab-runner-deploy
sudo chmod 440 /etc/sudoers.d/gitlab-runner-deploy
sudo visudo -c
```

> Optional: to also run the `@hardware` e2e tests on a USB-equipped runner, set
> a CI/CD variable `TERMINAL_HW_TEST=1` (project → Settings → CI/CD →
> Variables). On Agentlab1 (no USB) leave it unset — the suite then runs the
> 38 mock tests and skips the 4 `@hardware` ones.

## 3. Set CI/CD variables in GitLab

**Project → Settings → CI/CD → Variables**

| Variable | Value | Notes |
|---|---|---|
| `DEPLOY_SITE_HOST` | `serial-lab.test.delivery-academy.se` | Used by `fetch-build-deploy.sh` to verify HTTPS after publish. Without it the deploy job still succeeds but skips the final curl check. |

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

## 5. Verify

Trigger a pipeline (push a no-op commit, or use **Run pipeline** in the UI):

- [ ] GitLab: `ftdi-driver` / `terminal-app` / `terminal-app:e2e` /
      `python-suites` show up and the relevant ones run on the Agentlab1 runner
      (not "stuck" — that means no runner matched: check "Run untagged jobs").
- [ ] `terminal-app:e2e` passes its 38 mock tests; on failure it uploads
      `test-results/` (traces + screenshots) as an artifact.
- [ ] GitHub: the same jobs run green on `ubuntu-latest`.

If a GitLab job is stuck "pending" with no runner, the runner either isn't
registered for this project, isn't set to run untagged jobs, or is offline
(`sudo gitlab-runner verify` / `sudo gitlab-runner status`).

### Troubleshooting: "prepare environment: exit status 1"

This error has two root causes on Debian/Trixie — check in order:

**1. `clear_console` in `.bash_logout`** — The runner prepare-script sets
`errexit`; if the `gitlab-runner` user's login shell sources `~/.bash_logout`
on exit and `clear_console -q` finds no tty, it exits 1 and the failure
propagates. Fix: step 2a above.

**2. `git-lfs` not installed** — The runner calls `git lfs install` during
prepare on some configurations; if the binary is absent, `git` exits 1. Fix:
step 2b above.

> See `hil-preflight/rpi5-gitlab-runner-setup.md` for the same issues
> discovered while setting up the Pi5 HIL runner, with additional detail on
> the service-file `User=` pitfall that does not apply to the Agentlab1 apt
> install.
