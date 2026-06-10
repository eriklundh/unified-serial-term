# DEPLOYMENT.md — static-server deploy

This app is a pure-frontend SPA. After `npm run build`, the `dist/`
folder contains only static files (HTML, JS, CSS, assets) — no Node.js,
no server-side runtime, no API endpoints, no database. Drop it into any
HTTP server's document root and you're done.

This document covers:
1. How to build a deployable bundle
2. The non-negotiable HTTPS requirement
3. Apache and nginx config
4. Subpath deployment
5. The end-to-end deploy command

## 1. Building

From the project root:

```bash
npm run build
```

You get a `dist/` folder. Inspect it once to confirm it's purely static:

```bash
$ ls dist/
assets/  index.html  favicon.ico

$ file dist/index.html
dist/index.html: HTML document, ASCII text

$ head -1 dist/index.html
<!DOCTYPE html><html lang="en"><head>...
```

Asset references in the HTML should use **relative paths**
(`./assets/...`), not absolute (`/assets/...`). That's guaranteed by
the `base: './'` line in `vite.config.ts` (Phase 0 of `PLAN.md`). If
you forget that config, the build only works at the web root, not in
subdirectories.

To smoke-test the bundle locally before deploying:

```bash
npx serve dist/ -l 8080
# Open http://localhost:8080 in Chromium.
```

`localhost` counts as a secure context, so Web Serial and WebUSB both
work there. On any other hostname they require HTTPS — see next section.

## 2. HTTPS is mandatory

Both APIs we depend on are **only available in secure contexts**:

| Context                          | `navigator.serial` | `navigator.usb` |
|----------------------------------|--------------------|-----------------|
| `https://...`                    | ✅                  | ✅               |
| `http://localhost` or `127.0.0.1`| ✅                  | ✅               |
| `http://anything-else`           | ❌ (undefined)      | ❌ (undefined)   |

If the lab server serves this over plain HTTP from anywhere other than
`localhost`, the app's `isAvailable()` checks return false and the
backend selector shows "no backends available." Students will not be
able to connect to anything.

The lab VM at `<deploy-host>` is set up with a
Let's Encrypt cert and an HTTP-to-HTTPS redirect — see
`docs/LAB-SERVER-SETUP.md` for the one-time provisioning. Don't try to
work around HTTPS; the browsers won't let you.

## 3. nginx config (this is what we actually use)

The lab VM is set up by `docs/LAB-SERVER-SETUP.md`, which creates
`/etc/nginx/sites-available/serial-terminal` and points it at the
document root `/var/www/serial-terminal/`. After running certbot with
`--nginx --redirect`, the file has two server blocks (port 80
redirecting to 443, and the 443 block serving with the Let's Encrypt
cert). Add the caching block inside the 443 server block:

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name <deploy-host>;

    ssl_certificate     /etc/letsencrypt/live/<deploy-host>/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/<deploy-host>/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    root /var/www/serial-terminal;
    index index.html;

    # SPA fallback (harmless for this app; future-proof for client routing)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Long-cache hashed asset files (Vite outputs content-hashed names)
    location ~* \.(js|css|woff2?|svg|png|ico)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Short-cache the unhashed entry HTML so re-deploys are picked up
    location ~* \.html$ {
        add_header Cache-Control "no-cache, must-revalidate";
    }
}

server {
    listen 80;
    listen [::]:80;
    server_name <deploy-host>;
    return 301 https://$host$request_uri;
}
```

After editing, validate and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 4. Apache config (alternative)

If you ever migrate to Apache, the equivalent vhost serving at the URL
root is:

```apache
<VirtualHost *:443>
    ServerName <deploy-host>
    DocumentRoot /var/www/serial-terminal

    SSLEngine on
    SSLCertificateFile      /etc/letsencrypt/live/<deploy-host>/fullchain.pem
    SSLCertificateKeyFile   /etc/letsencrypt/live/<deploy-host>/privkey.pem

    <Directory /var/www/serial-terminal/>
        Require all granted
        Options -Indexes

        RewriteEngine On
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule ^ index.html [L]

        <FilesMatch "\.(html)$">
            Header set Cache-Control "no-cache, must-revalidate"
        </FilesMatch>
        <FilesMatch "\.(js|css|woff2?|svg|png|ico)$">
            Header set Cache-Control "public, max-age=31536000, immutable"
        </FilesMatch>
    </Directory>
</VirtualHost>

<VirtualHost *:80>
    ServerName <deploy-host>
    Redirect permanent / https://<deploy-host>/
</VirtualHost>
```

Enable: `sudo a2enmod rewrite headers ssl` and `sudo a2ensite serial-terminal`.

## 5. Subpath deployment

Because `vite.config.ts` uses `base: './'`, the same `dist/` works at
any path on any host:

- `https://<deploy-host>/` — drop into the document root
- `https://<deploy-host>/serial-terminal/` — drop into a subfolder
- `https://<deploy-host>/courses/embedded-101/tools/serial/` — same

No rebuild needed when you move it. The HTML references its sibling
assets relatively, so they're found wherever the HTML is served from.

## 6. Deploy command

The user's typical workflow from the dev VM:

```bash
# From the terminal-app repo root, with the latest commit checked out:
npm run build

# Push to the university server.
# --delete removes files no longer in dist/ (so old hashed asset bundles
# don't accumulate after re-deploys).
#
# Option A — Claude Code runs on the same VM as the web server:
#   With NOPASSWD sudo configured for your user, just copy directly:
sudo rsync -avz --delete dist/ /var/www/serial-terminal/
sudo chown -R www-data:www-data /var/www/serial-terminal

# Option B — Claude Code runs on a separate dev VM, pushing to the lab VM:
rsync -avz --delete dist/ \
    user@<deploy-host>:/var/www/serial-terminal/
```

That's the whole deploy. No npm install on the target, no Node.js, no
service to restart. The web server is already running and just serves
whatever is on disk; we replaced what's on disk.

### Automated remote deploy — `script/fetch-build-deploy.sh`

For the day-to-day workflow the manual steps above are captured in a
committed script that runs **on the deploy host** and is **triggered over
SSH** from a dev machine after a local test-and-fix cycle. The loop is:

1. Edit, test, and verify the app **locally** (Vitest, Playwright E2E, and
   the Playwright-MCP real-hardware smoke in `SEMIAUTO-SMOKE.md`).
2. Commit and push to `origin/main`.
3. Trigger the deploy host to fetch, build, and publish.

**The model (for maintainers / contributors).** Design choices worth
preserving if you change it:

- **The repo is the single source of truth.** All deploy logic lives in
  `script/fetch-build-deploy.sh`, committed and reviewable. The SSH channel
  is used *only* to invoke that script — never to run ad-hoc remote
  commands — so any deploy is exactly reproducible from git history.
- **Dedicated deploy mirror.** The script runs **only** in a separate,
  publish-only checkout — `~/deploy-unified-serial-term` — never in a
  development checkout. It enforces this: the mirror's gitignored
  `script/deploy.env` sets `DEPLOY_MIRROR=1`, and the script aborts without
  it. That keeps the hard-reset (below) from ever touching in-progress work.
- **Self-updating.** The script hard-resets the mirror to
  `origin/<branch>` (default `main`), then re-execs itself if that pull
  changed the script, so edits to the deploy logic take effect on the same
  trigger.
- **Non-destructive + guarded reset.** `git reset --hard origin/main` (never
  `git clean`, so untracked `node_modules/` and `dist/` survive between runs).
  Before resetting it refuses to run if the mirror has uncommitted tracked
  changes or commits not on the remote — override with `FBD_FORCE=1` — so
  nothing is ever lost silently.
- **Idempotent.** Re-running with no new commits rebuilds and republishes
  identical, content-hashed assets — safe to trigger repeatedly.
- **Two targets, tag-gated production.** `fetch-build-deploy.sh [target] [ref]`:
  - `serial-lab` (default) — **staging**; deploys `origin/main` continuously
    to `/var/www/serial-terminal`.
  - `production` — the **production server URL**; deploys only an explicit **release
    tag** (no default ref) to `/var/www/serial-terminal-production`. That is
    how a *verified* build is promoted — immutably and auditably.
- **Safe dry run.** `DRY_RUN=1` does everything up to (but not including)
  writing the live web root or curling the site — use it for a first run
  against a new host.

It publishes with the same `rsync --delete` + `chown www-data` shown by
hand above, then curls the site to confirm it answers `200` over HTTPS.

**Build host vs. serve host.** The build runs on the deploy host (which has
Node); the published `dist/` is *purely static* (HTML/JS/CSS) and is served
by nginx with **no Node runtime**. That's the whole point of a static SPA —
the university public URL never needs an app server. Don't add anything to
the serve path that assumes Node.

**The sibling driver is built on demand.** terminal-app imports
`ftdi-webusb-driver` (a `file:../ftdi-driver` dependency) whose entry
points resolve to its built `dist/`. `npm run build` (and `npm run dev`) runs
a `prebuild`/`predev` hook — `script/ensure-driver-built.mjs` — that builds
the sibling automatically when its `dist/` is **missing or stale** (any
`src/` file newer than the built types). So a fresh checkout or a pulled
driver change Just Works: no manual driver build, and no cryptic `vue-tsc`
"cannot find module" failure. If the driver's own build fails, the hook stops
the build with a clear message.

The manual build is still available as a fallback (e.g. to pre-warm the host
or debug a driver build in isolation):

```bash
cd ~/deploy-unified-serial-term/unified-serial-term/ftdi-driver && npm ci && npm run build
```

The auto-build is skipped entirely when `../ftdi-driver` isn't present
(e.g. CI building against a published registry version).

**Internal specifics (this lab).**

- Deploy host: reachable **only** at `<deploy-user>@<deploy-host>` (SSH,
  certificate auth). Its internal VM name is not routable from the dev/lab
  network — always connect via the public FQDN, never by VM name.
- Two checkouts on the host, kept separate:
  - **Development** — `~/unified-serial-terminal/` (where changes are made,
    committed, and pushed). The deploy script refuses to run here.
  - **Deploy mirror** — `~/deploy-unified-serial-term/unified-serial-term/` (publish-only; the
    script hard-resets it to `origin/main`). Its gitignored `script/deploy.env`
    sets `DEPLOY_MIRROR=1` and `DEPLOY_SITE_HOST`. The `ftdi-driver/` subdir
    only needs to be *present*; the build auto-builds it on demand (see above).
- Targets / sites (hostnames come from the mirror's `deploy.env`:
  `DEPLOY_SITE_HOST`, `DEPLOY_PROD_SITE_HOST`):
  - `serial-lab` (staging) → `/var/www/serial-terminal`, `https://<deploy-host>/`
  - `production` (the production server URL) → `/var/www/serial-terminal-production`,
    `https://<prod-host>/`

Trigger a **staging** deploy after pushing to `main`:

```bash
ssh <deploy-user>@<deploy-host> \
    'bash ~/deploy-unified-serial-term/unified-serial-term/terminal-app/script/fetch-build-deploy.sh'
```

First-time or cautious run (builds, but writes nothing to the live site):

```bash
ssh <deploy-user>@<deploy-host> \
    'DRY_RUN=1 bash ~/deploy-unified-serial-term/unified-serial-term/terminal-app/script/fetch-build-deploy.sh'
```

### Promoting a verified release to production — the big red button

Once a `main` build is verified on staging, run the committed release script
from the dev checkout:

```bash
terminal-app/script/release-production.sh
```

It creates an annotated `release-YYYY-MM-DD` tag on origin/main (suffix `-2`,
`-3`… for same-day re-releases), pushes it, and then watches the production
`version.json` until the new release is serving. The tag push triggers the
GitLab CI job `terminal-app:deploy:production` (see the root
`.gitlab-ci.yml`), which re-runs the full check stage — lint, unit tests,
e2e — and only then publishes that **exact tag**. Production refuses to run
without an explicit tag, so it can never drift to whatever `main` happens
to be. Protect the `release-*` tag pattern in GitLab (Settings → Repository
→ Protected tags) so only maintainers can trigger it.

To release an older verified commit: `release-production.sh <ref>`.

The pre-CI manual fallback still works (run on the deploy host):

```bash
# 1. Tag the verified commit and push the tag.
git tag -a release-2026-06-05 -m "Verified release" && git push origin release-2026-06-05

# 2. Publish that tag to production from the deploy mirror.
bash ~/deploy-unified-serial-term/unified-serial-term/terminal-app/script/fetch-build-deploy.sh production release-2026-06-05
```

**What's live right now?** Every deploy stamps the published bundle with a
manifest, so the site self-identifies which release is serving:

```bash
curl -s https://<prod-host>/version.json
# { "target": "production", "ref": "v1.0.0", "commit": "…", "built_at": "…Z", … }
```

To roll back, deploy an earlier tag the same way. `serial-lab` keeps tracking
`main` independently, so staging and production move on separate cadences.

## 7. Verification checklist after deploy

- [ ] `curl -I https://<deploy-host>/` returns 200 and
      `content-type: text/html`
- [ ] `curl -I https://<deploy-host>/assets/index-*.js`
      returns 200 and `content-type: application/javascript`
- [ ] `curl -I http://<deploy-host>/` returns
      301 → https (the redirect from `LAB-SERVER-SETUP.md` step 6)
- [ ] Browser DevTools console is clean on page load (no 404s, no
      CORS errors, no mixed content warnings)
- [ ] The backend selector shows at least one available backend
      (if both options are greyed out → you're not on HTTPS, or you're
      using a non-Chromium browser)
- [ ] Clicking Connect opens the device picker dialog
- [ ] Bytes flow both directions against a real FT231XS

## 8. Permissions and cache invalidation

WebUSB permissions are **per-origin, per-device**, and **per-user**.
They persist in the browser profile. If a board changes hands between
students using the same machine, the new student has to re-grant
permission — Chromium shows the picker on first connect.

Cache: Vite output uses content-hashed filenames
(`index-DAaTuFA8.js`). New deploys get new hashes, so users never see
stale JS. The only file without a hash is `index.html`, which is why
the configs above mark it as no-cache.

## 9. What about GitLab Pages?

GitLab CE supports static-site hosting via GitLab Pages, which is fine
if you'd rather serve from your GitLab instead of from a separate web
server. Add `.gitlab-ci.yml`:

```yaml
pages:
  stage: deploy
  image: node:lts
  script:
    - npm ci
    - npm run build
    - mv dist public
  artifacts:
    paths:
      - public
  only:
    - main
```

This builds and publishes to `https://<your-namespace>.pages.<gitlab>/<project>/`.
Same HTTPS requirement applies; GitLab Pages defaults to HTTPS so
you're covered.
