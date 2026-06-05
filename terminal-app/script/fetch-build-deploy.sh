#!/usr/bin/env bash
#
# fetch-build-deploy.sh — update, build, and publish the terminal-app.
#
# This script runs ON the deploy host, in a DEDICATED publish-only mirror
# checkout (~/deploy-unified-serial-term) — kept separate from any development
# checkout — because step 1 hard-resets it to origin. A developer on another
# machine triggers it over SSH *after* a local test-and-fix cycle has been
# committed and pushed:
#
#     ssh <deploy-user>@<deploy-host> \
#         'bash ~/deploy-unified-serial-term/terminal-app/script/fetch-build-deploy.sh'
#
# The SSH channel is only ever used to invoke this script — never to run ad-hoc
# remote commands. Everything the deploy needs is captured here, committed, and
# reviewable in git.
#
# What it does, in order:
#   1. Fast-forward the checkout to origin/<branch> (default: main).
#   2. Re-exec itself if this very script changed in the pull (so script edits
#      take effect on the same trigger).
#   3. Reproducible install + production build (static dist/, no runtime). The
#      build's prebuild hook (script/ensure-driver-built.mjs) auto-builds the
#      sibling ftdi-driver if its dist/ is missing or stale, so no manual
#      driver build is needed.
#   4. Publish the static bundle to the target site's web root.
#   5. Verify the site answers 200 over HTTPS.
#
# The published artefact is purely static (HTML/JS/CSS). Node runs only on this
# build host; the public web server (nginx/apache) serves dist/ with no Node
# runtime — that is why the university URL needs no app server.
#
# It is idempotent: re-running with no new commits rebuilds and re-publishes
# identical content.
#
# Environment knobs (or set them in the gitignored script/deploy.env):
#   DEPLOY_MIRROR=1    REQUIRED — marks this checkout as the publish-only deploy
#                      mirror. Without it the script refuses to run, so it can
#                      never hard-reset a development checkout. Set it in the
#                      mirror's script/deploy.env.
#   DEPLOY_SITE_HOST   Public hostname verified after publish; keep it out of the
#                      committed repo (set it in script/deploy.env on the host)
#   DEPLOY_WEBROOT     Web root to publish into (default: /var/www/serial-terminal)
#   TERMINAL_APP_DIR   Override the repo path (default: derived from this script's location)
#   DEPLOY_BRANCH      Branch to deploy (default: main)
#   DRY_RUN=1          Do everything except touch the live web root (safe first run)
#   FBD_FORCE=1        Bypass the dirty/ahead safety checks before the hard-reset
#
# Usage:
#   fetch-build-deploy.sh [target]
#     target  Which site to publish to (default: serial-lab). See the case
#             block below — a second publish cycle is added by copying a branch.
#
set -euo pipefail

# Absolute path to this script, resolved before any checkout mutation so the
# re-exec guard can hash and re-run the freshly pulled copy. Everything the
# script needs to locate (the repo) is derived from this, so it works no matter
# the caller's cwd — an SSH trigger starts in $HOME, not the repo.
SELF="$(readlink -f "$0")"
SCRIPT_DIR="$(dirname "$SELF")"

# Optional, gitignored host overrides (e.g. the concrete deploy hostname) so
# this committed script stays host-agnostic. See script/deploy.env.example.
# shellcheck source=/dev/null
[ -f "$SCRIPT_DIR/deploy.env" ] && . "$SCRIPT_DIR/deploy.env"

# Publish-only mirror guard. Step 1 hard-resets this checkout to origin, which
# would wipe in-progress work in a development checkout. So the script runs ONLY
# in the dedicated deploy-mirror checkout (~/deploy-unified-serial-term), whose
# gitignored script/deploy.env sets DEPLOY_MIRROR=1.
[ "${DEPLOY_MIRROR:-}" = "1" ] || { \
  printf '\n\033[1;31mERROR: not a deploy mirror.\033[0m Run this only in the deploy-mirror checkout\n  (~/deploy-unified-serial-term); its script/deploy.env must set DEPLOY_MIRROR=1.\n' >&2; \
  exit 1; }

# --- Configuration: deploy targets -------------------------------------------
# Single source of truth for where each public site is served from. A second
# publish cycle (different URL / web root) is added as another case branch.
TARGET="${1:-serial-lab}"
case "$TARGET" in
  serial-lab)
    SITE_HOST="${DEPLOY_SITE_HOST:-<deploy-host>}"
    WEBROOT="${DEPLOY_WEBROOT:-/var/www/serial-terminal}"
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
# Derived from this script's location (<repo>/terminal-app/script -> terminal-app),
# so it's independent of the caller's cwd and of where the monorepo is cloned.
# git commands then operate on the whole monorepo (git walks up to the root).
REPO_DIR="${TERMINAL_APP_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"

# --- Helpers -----------------------------------------------------------------
log()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m    %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

# --- 1. Fetch ----------------------------------------------------------------
# Work-tree test (not `-d .git`): REPO_DIR is the terminal-app/ subdir of the
# monorepo, so its .git lives at the repo root, not here.
git -C "$REPO_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1 \
  || die "no git checkout at $REPO_DIR (set TERMINAL_APP_DIR?)"
cd "$REPO_DIR"

log "Updating $REPO_DIR to origin/$BRANCH"
before_self="$(sha1sum "$SELF" | cut -d' ' -f1)"
git fetch --prune origin
# Safety: even on a mirror, never silently destroy local work. Abort if the
# working tree has tracked modifications, or if this checkout has commits not
# on the remote. FBD_FORCE=1 overrides (e.g. a deliberately-dirty host).
if [ "${FBD_FORCE:-}" != "1" ]; then
  [ -z "$(git status --porcelain --untracked-files=no)" ] \
    || die "uncommitted tracked changes in $REPO_DIR — refusing to hard-reset (FBD_FORCE=1 to override)."
  ahead="$(git rev-list --count "origin/$BRANCH..HEAD" 2>/dev/null || echo 0)"
  [ "$ahead" = 0 ] \
    || die "$REPO_DIR is $ahead commit(s) ahead of origin/$BRANCH — push them first (FBD_FORCE=1 to override)."
fi
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

# --- 3. Build ----------------------------------------------------------------
# Produces a purely static dist/ (HTML/JS/CSS). Node runs only here, on the
# build host; the published bundle needs no runtime — a plain web server
# (nginx/apache) serves it. `npm ci` installs against the committed lockfile.
#
# terminal-app imports `ftdi-webusb-driver` (a `file:../ftdi-driver`
# dependency) whose entry points resolve to its built dist/. `npm run build`
# runs a prebuild hook that builds that sibling on demand if its dist/ is
# missing or stale — so this script needs no separate driver-build step and
# fails clearly (via the hook) if the driver itself cannot build.
command -v npm >/dev/null 2>&1 || die "npm not found on PATH"
log "Installing dependencies (npm ci)"
npm ci

log "Building (npm run build)"
npm run build
[ -f dist/index.html ] || die "build produced no dist/index.html"

# --- 4. Publish --------------------------------------------------------------
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

# --- 5. Verify ---------------------------------------------------------------
if [ "${DRY_RUN:-}" = "1" ]; then
  warn "[dry-run] skipping HTTPS verification"
elif [ "$SITE_HOST" = "<deploy-host>" ]; then
  warn "DEPLOY_SITE_HOST not set (script/deploy.env) — published, but skipping HTTPS verify"
else
  log "Verifying https://$SITE_HOST/"
  code="$(curl -fsS -o /dev/null -w '%{http_code}' "https://$SITE_HOST/" || true)"
  [ "$code" = "200" ] || die "https://$SITE_HOST/ returned HTTP ${code:-<none>}"
fi

log "Deployed $TARGET @ $DEPLOY_REF — $DEPLOY_SUBJECT"
