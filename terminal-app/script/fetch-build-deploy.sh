#!/usr/bin/env bash
#
# fetch-build-deploy.sh — update, build, and publish the terminal-app.
#
# This script runs ON the deploy host (agentlab1), where the web server and
# the repo checkout both live. A developer working on another machine (e.g. a
# Windows laptop) triggers it over SSH *after* a local test-and-fix cycle has
# been committed and pushed:
#
#     ssh eriklundh@serial-lab.test.delivery-academy.se \
#         'bash ~/unified-serial-terminal/terminal-app/script/fetch-build-deploy.sh'
#
# The SSH channel is only ever used to invoke this script — never to run ad-hoc
# remote commands. Everything the deploy needs is captured here, committed, and
# reviewable in git.
#
# What it does, in order:
#   1. Fast-forward the checkout to origin/<branch> (default: main).
#   2. Re-exec itself if this very script changed in the pull (so script edits
#      take effect on the same trigger).
#   3. Verify the build prerequisite: the sibling ftdi-webusb-driver is built.
#   4. Reproducible install + production build (static dist/, no runtime).
#   5. Publish the static bundle to the target site's web root.
#   6. Verify the site answers 200 over HTTPS.
#
# The published artefact is purely static (HTML/JS/CSS). Node runs only on this
# build host; the public web server (nginx/apache) serves dist/ with no Node
# runtime — that is why the university URL needs no app server.
#
# It is idempotent: re-running with no new commits rebuilds and re-publishes
# identical content.
#
# This script does NOT build the sibling ftdi-webusb-driver; that is a host
# prerequisite (built out-of-band). It fails fast if the driver's dist/ is
# missing.
#
# Environment knobs:
#   TERMINAL_APP_DIR   Override the repo path (default: ~/unified-serial-terminal/terminal-app)
#   DRY_RUN=1          Do everything except touch the live web root (safe first run)
#
# Usage:
#   fetch-build-deploy.sh [target]
#     target  Which site to publish to (default: serial-lab). See the case
#             block below — a second publish cycle is added by copying a branch.
#
set -euo pipefail

# Absolute path to this script, resolved before any checkout mutation so the
# re-exec guard can hash and re-run the freshly pulled copy.
SELF="$(readlink -f "$0")"

# --- Configuration: deploy targets -------------------------------------------
# Single source of truth for where each public site is served from. A second
# publish cycle (different URL / web root) is added as another case branch.
TARGET="${1:-serial-lab}"
case "$TARGET" in
  serial-lab)
    SITE_HOST="serial-lab.test.delivery-academy.se"
    WEBROOT="/var/www/serial-terminal"
    ;;
  # Add the second publish target here once its URL and web root are known:
  # other-lab)
  #   SITE_HOST="other-lab.example.se"
  #   WEBROOT="/var/www/other-serial-terminal"
  #   ;;
  *)
    echo "ERROR: unknown deploy target '$TARGET'" >&2
    exit 2
    ;;
esac

BRANCH="${DEPLOY_BRANCH:-main}"
REPO_DIR="${TERMINAL_APP_DIR:-$HOME/unified-serial-terminal/terminal-app}"

# --- Helpers -----------------------------------------------------------------
log()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m    %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

# --- 1. Fetch ----------------------------------------------------------------
[ -d "$REPO_DIR/.git" ] || die "no git checkout at $REPO_DIR (set TERMINAL_APP_DIR?)"
cd "$REPO_DIR"

log "Updating $REPO_DIR to origin/$BRANCH"
before_self="$(sha1sum "$SELF" | cut -d' ' -f1)"
git fetch --prune origin
# Hard-reset to the remote branch tip. We deliberately do NOT `git clean`:
# untracked build artefacts (node_modules/, dist/) must survive the reset.
git reset --hard "origin/$BRANCH"
after_self="$(sha1sum "$SELF" | cut -d' ' -f1)"

# --- 2. Re-exec guard --------------------------------------------------------
# If the pull changed this script, re-run the updated copy exactly once so the
# new logic governs the rest of this deploy. FBD_REEXEC prevents a loop.
if [ "${FBD_REEXEC:-}" != "1" ] && [ "$before_self" != "$after_self" ]; then
  log "Deploy script changed in pull — re-exec'ing updated version"
  exec env FBD_REEXEC=1 bash "$SELF" "$TARGET"
fi

DEPLOY_REF="$(git rev-parse --short HEAD)"
DEPLOY_SUBJECT="$(git log -1 --pretty=%s)"

# --- 3. Verify build prerequisites -------------------------------------------
# terminal-app imports `ftdi-webusb-driver` (a `file:../ftdi-webusb-driver`
# dependency) whose package entry points resolve to its built dist/ (.js +
# .d.ts). By design this script does NOT build the sibling driver — it is built
# out-of-band on this host (see docs/DEPLOYMENT.md). Fail fast with an
# actionable message instead of a cryptic vue-tsc "cannot find module" error.
command -v npm >/dev/null 2>&1 || die "npm not found on PATH"
DRIVER_DIR="$REPO_DIR/../ftdi-webusb-driver"
[ -f "$DRIVER_DIR/dist/index.d.ts" ] || die \
  "sibling ftdi-webusb-driver is not built ($DRIVER_DIR/dist missing). Build it first: (cd $DRIVER_DIR && npm ci && npm run build)"

# --- 4. Build ----------------------------------------------------------------
# Produces a purely static dist/ (HTML/JS/CSS). Node runs only here, on the
# build host; the published bundle needs no runtime — a plain web server
# (nginx/apache) serves it. `npm ci` installs against the committed lockfile.
log "Installing dependencies (npm ci)"
npm ci

log "Building (npm run build)"
npm run build
[ -f dist/index.html ] || die "build produced no dist/index.html"

# --- 5. Publish --------------------------------------------------------------
if [ "${DRY_RUN:-}" = "1" ]; then
  warn "[dry-run] skipping publish to $WEBROOT"
  warn "[dry-run] would: sudo rsync -a --delete dist/ $WEBROOT/"
  warn "[dry-run] would: sudo chown -R www-data:www-data $WEBROOT"
else
  [ -d "$WEBROOT" ] || die "web root $WEBROOT does not exist on this host"
  log "Publishing dist/ to $WEBROOT"
  # --delete clears stale hashed asset bundles from previous deploys.
  sudo rsync -a --delete dist/ "$WEBROOT/"
  sudo chown -R www-data:www-data "$WEBROOT"
fi

# --- 6. Verify ---------------------------------------------------------------
if [ "${DRY_RUN:-}" = "1" ]; then
  warn "[dry-run] skipping HTTPS verification"
else
  log "Verifying https://$SITE_HOST/"
  code="$(curl -fsS -o /dev/null -w '%{http_code}' "https://$SITE_HOST/" || true)"
  [ "$code" = "200" ] || die "https://$SITE_HOST/ returned HTTP ${code:-<none>}"
fi

log "Deployed $TARGET @ $DEPLOY_REF — $DEPLOY_SUBJECT"
