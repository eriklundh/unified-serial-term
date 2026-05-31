# LAB-SERVER-SETUP.md — one-time server provisioning

This is the one-time setup runbook for the lab VM that will host the
deployed terminal app. Everything here is done **once** before any
deployment. After this, `docs/DEPLOYMENT.md` covers the recurring
deploy procedure.

## Target environment

- **VM:** Debian 13 (Trixie), external IP `194.14.84.44`
- **Hostname:** `serial-lab.test.delivery-academy.se`
- **DNS:** `*.test.delivery-academy.se` already wildcard-points at the VM
- **Web server:** nginx
- **TLS:** Let's Encrypt (HTTP-01 challenge, single-hostname cert)
- **Firewall:** ufw
- **Privileged user:** Claude Code's user has `NOPASSWD: ALL` in
  `/etc/sudoers.d/`, so `sudo` commands run non-interactively

## Prerequisites (verify before starting)

```bash
# DNS resolves to the right IP
dig +short serial-lab.test.delivery-academy.se
# expected: 194.14.84.44

# Sudo works without prompting
sudo -n true && echo OK
# expected: OK

# Ports 80 and 443 reachable from outside (test from another host)
nc -zv 194.14.84.44 80
nc -zv 194.14.84.44 443
# expected: connection succeeds (or "Connection refused" if nothing's
# listening yet — that's fine; "filtered" or "timeout" is the bad one,
# meaning the external firewall blocks the port)
```

If any of those fail, fix them before continuing. Certbot's HTTP-01
challenge needs port 80 reachable from Let's Encrypt's validation
servers; HTTPS serving needs 443.

## 1. UFW: open ports

```bash
sudo ufw status verbose
```

If UFW is **not active yet**, do this in order so you don't lock
yourself out over SSH:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

If UFW **is already active**, just add the nginx rules:

```bash
sudo ufw allow 'Nginx Full'
sudo ufw status
```

`Nginx Full` opens both 80 and 443. You need both — 443 for the HTTPS
traffic and 80 for the ACME HTTP-01 challenge (initial issuance and
every renewal).

## 2. Install nginx and certbot

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
sudo systemctl status nginx --no-pager
curl -I http://localhost/
# expected: 200 OK, default nginx welcome page
```

## 3. Document root and smoke-test page

```bash
sudo mkdir -p /var/www/serial-terminal

sudo tee /var/www/serial-terminal/index.html >/dev/null <<'HTML'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Serial terminal — smoke test</title>
  <style>body{font:14px/1.5 system-ui;max-width:40em;margin:2em auto;padding:0 1em}</style>
</head>
<body>
  <h1>Serial terminal — smoke test page</h1>
  <p>Hostname: <code id="host"></code></p>
  <p>Protocol: <code id="proto"></code></p>
  <p>Secure context: <code id="sec"></code></p>
  <p>navigator.serial available: <code id="ws"></code></p>
  <p>navigator.usb available: <code id="wu"></code></p>
  <p>This page is replaced by the built terminal app after Phase 6
     deployment. If you're seeing it post-launch, something is wrong
     with rsync.</p>
  <script>
    document.getElementById('host').textContent = location.host;
    document.getElementById('proto').textContent = location.protocol;
    document.getElementById('sec').textContent = window.isSecureContext;
    document.getElementById('ws').textContent = ('serial' in navigator);
    document.getElementById('wu').textContent = ('usb' in navigator);
  </script>
</body>
</html>
HTML

sudo chown -R www-data:www-data /var/www/serial-terminal
```

## 4. nginx site config (HTTP only, for now)

```bash
sudo tee /etc/nginx/sites-available/serial-terminal >/dev/null <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name serial-lab.test.delivery-academy.se;

    root /var/www/serial-terminal;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/serial-terminal /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

## 5. Verify HTTP from outside

From a different machine (your workstation, not the VM):

```bash
curl -I http://serial-lab.test.delivery-academy.se/
# expected: 200 OK

curl -s http://serial-lab.test.delivery-academy.se/ | grep -i smoke
# expected: <title>Serial terminal — smoke test</title>
```

Also open the URL in Chromium. You should see:

- `Protocol: http:`
- `Secure context: false`
- `navigator.serial available: false`
- `navigator.usb available: false`

That last result is the **point** of this stage: both APIs correctly
report unavailable over plain HTTP, regardless of the browser. The
next step makes them available.

## 6. Get the Let's Encrypt cert

```bash
sudo certbot --nginx -d serial-lab.test.delivery-academy.se \
  --email YOUR-EMAIL@delivery-academy.se \
  --agree-tos --redirect --no-eff-email
```

Flags explained:

- `--nginx`: use the nginx authenticator + installer (rewrites the
  site config automatically)
- `-d serial-lab.test.delivery-academy.se`: issue a cert for this name
- `--email ...`: where Let's Encrypt sends renewal-failure warnings
- `--agree-tos`: accept Let's Encrypt TOS non-interactively
- `--redirect`: rewrite the site config so HTTP redirects to HTTPS
- `--no-eff-email`: skip the "share your email with EFF?" prompt

Certbot does the HTTP-01 challenge, gets the cert, then rewrites
`/etc/nginx/sites-available/serial-terminal` to add a 443 server block
and a redirect block on 80.

### If you might rate-limit

Let's Encrypt's production rate limit is 5 certificates per identical
set of names per week. While iterating, use `--staging` to get the
wiring right without burning quota:

```bash
sudo certbot --nginx --staging -d serial-lab.test.delivery-academy.se \
  --email YOUR-EMAIL@delivery-academy.se --agree-tos --redirect --no-eff-email
# Verify everything works (browser will warn about cert; that's fine)
sudo certbot delete --cert-name serial-lab.test.delivery-academy.se
# Then issue the real one:
sudo certbot --nginx -d serial-lab.test.delivery-academy.se \
  --email YOUR-EMAIL@delivery-academy.se --agree-tos --redirect --no-eff-email
```

## 7. Verify HTTPS works end-to-end

```bash
curl -I https://serial-lab.test.delivery-academy.se/
# expected: 200 OK

curl -I http://serial-lab.test.delivery-academy.se/
# expected: 301 Moved Permanently → https://...
```

In Chromium, the smoke-test page should now report:

- `Protocol: https:`
- `Secure context: true`
- `navigator.serial available: true`
- `navigator.usb available: true`

That's the green light. The server is ready to host the built terminal
app, and both browser APIs will work for users.

## 8. Verify auto-renewal

Certbot installs a systemd timer that renews the cert when it's within
30 days of expiry:

```bash
systemctl list-timers | grep certbot
# expected: certbot.timer is listed and active

sudo certbot renew --dry-run
# expected: succeeds without actually renewing
```

Renewal is hands-off from now on, as long as port 80 stays open to
Let's Encrypt's validators.

## 9. (Optional) Quality-of-life additions

These aren't required for smoke testing but you'll likely want them
before letting students hit the URL:

### HTTP/2

certbot's nginx plugin doesn't enable HTTP/2 by default on Debian 13.
Edit the 443 server block in `/etc/nginx/sites-available/serial-terminal`
and add `http2 on;` near the `listen 443 ssl;` line:

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    # ... rest unchanged
}
```

Then `sudo nginx -t && sudo systemctl reload nginx`.

### Caching headers

These help students get fast page loads and immediate re-deploy
visibility. Add inside the 443 server block:

```nginx
location ~* \.(js|css|woff2?|svg|png|ico)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}

location ~* \.html$ {
    add_header Cache-Control "no-cache, must-revalidate";
}
```

Why: Vite emits content-hashed filenames for JS/CSS assets, so a new
deploy gets new filenames — long-cache them aggressively. The HTML
entry point is the only file that keeps the same name across deploys,
so we tell browsers to revalidate it on every load.

### HSTS

Do **not** enable HSTS during the iteration phase. Once set with a
long max-age, browsers refuse plain HTTP for the domain even if you
later take HTTPS down — that turns a 5-minute cert problem into a
"now my users can't reach the site at all" problem.

When you're confident the cert chain is stable, add to the 443 block:

```nginx
add_header Strict-Transport-Security "max-age=31536000" always;
```

Don't add `includeSubDomains` unless you're prepared to commit *every*
subdomain of `test.delivery-academy.se` to HTTPS forever, including
ones you haven't created yet.

## 10. Alternative: wildcard cert via DNS-01

Since you have `*.test.delivery-academy.se` wildcarded at the VM, you
could get a single wildcard cert covering every subdomain at once.
This requires DNS-01 challenges, which need API access to your DNS
provider so certbot can create temporary TXT records.

The certbot-dns plugins vary by provider (Cloudflare, Route53, DigitalOcean,
desec.io, etc.). If you want to go this route, install the matching
plugin (`apt search python3-certbot-dns-` for what's packaged) and
follow that plugin's docs.

**Recommendation:** stick with HTTP-01 single-hostname certs for now.
Wildcard certs are valuable when you're hosting many lab tools at many
subdomains; for one terminal app at one subdomain, the per-name cert
is simpler and has a smaller blast radius if anything goes wrong.

## 11. Logs and troubleshooting

```bash
# nginx access and errors
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Certbot's own log
sudo tail -f /var/log/letsencrypt/letsencrypt.log

# Cert files (don't move these — certbot expects this layout for renewal)
sudo ls /etc/letsencrypt/live/serial-lab.test.delivery-academy.se/

# Test the cert chain
echo | openssl s_client -servername serial-lab.test.delivery-academy.se \
  -connect serial-lab.test.delivery-academy.se:443 2>/dev/null \
  | openssl x509 -noout -dates -subject -issuer
```

Common issues:

- **HTTP-01 fails**: check that port 80 reaches the VM from the
  outside world. University-level firewalls and provider-level
  blocklists are the usual culprits.
- **DNS not propagating yet**: `dig +short` from multiple resolvers.
  Wait until they agree before retrying certbot.
- **nginx 502 / 503 after deploy**: `sudo nginx -t` to validate
  config, `sudo journalctl -u nginx -n 50` for runtime errors.

## 12. Document divergence

If something in this runbook doesn't work as written for your setup,
update this file as part of the fix (per the "Maintaining the docs"
principle in `CLAUDE.md`). The next person — possibly you in three
months — will thank you.
