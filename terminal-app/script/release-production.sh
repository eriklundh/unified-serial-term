#!/usr/bin/env bash
#
# release-production.sh — ███  THE BIG RED BUTTON  ███
# Deploy a verified version of terminal-app to the production server URL.
# Author Erik Lundh, The Joy of Engineering, erik.lundh@ingenjorsgladje.se
#
# What it does:
#   1. Safety checks: clean tree; when releasing HEAD it must equal origin/main.
#   2. Creates an annotated `release-YYYY-MM-DD` tag (suffix -2, -3… when
#      re-releasing the same day) and pushes it.
#   3. The tag push triggers the GitLab CI job terminal-app:deploy:production,
#      which re-runs the full check suite and publishes that exact tag.
#   4. Watches https://<prod-host>/version.json until the new release is live.
#
# Usage (from anywhere inside the repo):
#   terminal-app/script/release-production.sh                # release origin/main
#   terminal-app/script/release-production.sh -m "message"   # custom tag message
#   terminal-app/script/release-production.sh <ref>          # an older verified commit
#
# Env overrides:
#   PROD_SITE_HOST   production hostname (default: unified-serial.delivery-academy.se)
#   WAIT_TIMEOUT     seconds to wait for the site to flip (default: 900)
#
set -euo pipefail

PROD_SITE_HOST="${PROD_SITE_HOST:-unified-serial.delivery-academy.se}"
WAIT_TIMEOUT="${WAIT_TIMEOUT:-900}"

MSG="Verified production release"
if [ "${1:-}" = "-m" ]; then
    [ $# -ge 2 ] || { echo "ERROR: -m requires a message." >&2; exit 2; }
    MSG="$2"; shift 2
fi
REF="${1:-HEAD}"

# Run from the repo root regardless of the caller's cwd.
cd "$(dirname "$(readlink -f "$0")")/../.."

git diff --quiet && git diff --cached --quiet || {
    echo "ERROR: uncommitted changes — commit or stash before releasing." >&2; exit 1; }

git fetch -q origin
if [ "$REF" = "HEAD" ]; then
    [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || {
        echo "ERROR: HEAD differs from origin/main. Push first, or name an explicit ref." >&2
        exit 1; }
fi
COMMIT="$(git rev-parse --short "$REF^{commit}")"

# Tag name: release-YYYY-MM-DD (UTC), -2/-3… for same-day re-releases.
BASE="release-$(date -u +%F)"
TAG="$BASE"; n=2
while git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; do
    TAG="$BASE-$n"; n=$((n+1))
done

echo "███  Releasing $COMMIT to production as $TAG  ███"
echo "     ($MSG)"
git tag -a "$TAG" -m "$MSG" "$REF"
git push origin "$TAG"
echo "Tag pushed — the CI pipeline now re-checks and deploys it."

printf 'Waiting for https://%s/ to serve %s ' "$PROD_SITE_HOST" "$TAG"
deadline=$(( $(date +%s) + WAIT_TIMEOUT ))
live=""
while [ "$(date +%s)" -lt "$deadline" ]; do
    live="$(curl -fsS --max-time 10 "https://$PROD_SITE_HOST/version.json" 2>/dev/null \
            | python3 -c 'import json,sys; print(json.load(sys.stdin).get("ref",""))' \
              2>/dev/null || true)"
    if [ "$live" = "$TAG" ]; then
        printf '\nLIVE: https://%s/ now serves %s (%s).\n' "$PROD_SITE_HOST" "$TAG" "$COMMIT"
        exit 0
    fi
    printf '.'
    sleep 15
done
printf '\n'
echo "TIMED OUT after ${WAIT_TIMEOUT}s. The tag IS pushed, so the deploy may still" >&2
echo "finish — check the pipeline in GitLab. Live ref right now: '${live:-unknown}'." >&2
exit 1
