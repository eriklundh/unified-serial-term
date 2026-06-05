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

The lab VM at `serial-lab.test.delivery-academy.se` is set up with a
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
    server_name serial-lab.test.delivery-academy.se;

    ssl_certificate     /etc/letsencrypt/live/serial-lab.test.delivery-academy.se/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/serial-lab.test.delivery-academy.se/privkey.pem;
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
    server_name serial-lab.test.delivery-academy.se;
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
    ServerName serial-lab.test.delivery-academy.se
    DocumentRoot /var/www/serial-terminal

    SSLEngine on
    SSLCertificateFile      /etc/letsencrypt/live/serial-lab.test.delivery-academy.se/fullchain.pem
    SSLCertificateKeyFile   /etc/letsencrypt/live/serial-lab.test.delivery-academy.se/privkey.pem

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
    ServerName serial-lab.test.delivery-academy.se
    Redirect permanent / https://serial-lab.test.delivery-academy.se/
</VirtualHost>
```

Enable: `sudo a2enmod rewrite headers ssl` and `sudo a2ensite serial-terminal`.

## 5. Subpath deployment

Because `vite.config.ts` uses `base: './'`, the same `dist/` works at
any path on any host:

- `https://serial-lab.test.delivery-academy.se/` — drop into the document root
- `https://serial-lab.test.delivery-academy.se/serial-terminal/` — drop into a subfolder
- `https://serial-lab.test.delivery-academy.se/courses/embedded-101/tools/serial/` — same

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
    user@serial-lab.test.delivery-academy.se:/var/www/serial-terminal/
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
- **Self-updating.** The script fast-forwards the checkout to
  `origin/<branch>` (default `main`), then re-execs itself if that pull
  changed the script, so edits to the deploy logic take effect on the same
  trigger.
- **Non-destructive reset.** It runs `git reset --hard origin/main` but
  never `git clean`, so untracked `node_modules/` and `dist/` survive
  between runs.
- **Idempotent.** Re-running with no new commits rebuilds and republishes
  identical, content-hashed assets — safe to trigger repeatedly.
- **Parameterised targets.** A `case` block maps a target name → site host
  + web root, so a second publish cycle to a different URL is one added
  branch, not a forked script: `fetch-build-deploy.sh <target>`.
- **Safe dry run.** `DRY_RUN=1` does everything up to (but not including)
  writing the live web root or curling the site — use it for a first run
  against a new host.

It publishes with the same `rsync --delete` + `chown www-data` shown by
hand above, then curls the site to confirm it answers `200` over HTTPS.

**Internal specifics (this lab).**

- Deploy host: reachable **only** at
  `eriklundh@serial-lab.test.delivery-academy.se` (SSH, certificate auth).
  Its internal VM name is `agentlab1`, which is *not* routable from the
  dev/lab network — always connect via the public FQDN, never by VM name.
- Collection root on the host: `~/unified-serial-terminal` — holds
  `terminal-app` plus its sibling `ftdi-webusb-driver`, which both the
  `file:` dependency and the Vite build need present and built.
- Default target `serial-lab` → web root `/var/www/serial-terminal`, served
  at `https://serial-lab.test.delivery-academy.se/`.

Trigger a deploy after pushing to `main`:

```bash
ssh eriklundh@serial-lab.test.delivery-academy.se \
    'bash ~/unified-serial-terminal/terminal-app/script/fetch-build-deploy.sh'
```

First-time or cautious run (builds, but writes nothing to the live site):

```bash
ssh eriklundh@serial-lab.test.delivery-academy.se \
    'DRY_RUN=1 bash ~/unified-serial-terminal/terminal-app/script/fetch-build-deploy.sh'
```

## 7. Verification checklist after deploy

- [ ] `curl -I https://serial-lab.test.delivery-academy.se/` returns 200 and
      `content-type: text/html`
- [ ] `curl -I https://serial-lab.test.delivery-academy.se/assets/index-*.js`
      returns 200 and `content-type: application/javascript`
- [ ] `curl -I http://serial-lab.test.delivery-academy.se/` returns
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
