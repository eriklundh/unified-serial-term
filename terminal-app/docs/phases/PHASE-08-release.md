# PHASE-08-release.md

Branch: `phase/08-release`

## Goal

Ship v0.1.0 of the terminal app. Verify the static build deploys to a plain
Apache or nginx server with no Node.js required.

This phase was previously numbered Phase 6 in PLAN.md. It was renumbered to
Phase 8 when Phases 6 (terminal completeness) and 7 (E2E acceptance tests)
were inserted ahead of it. The content is otherwise identical.

---

## Tasks

### 8.1 — Verify the static build is portable

- Run `npm run build`. Confirm `dist/` contains only `.html`, `.js`, `.css`,
  and asset files — nothing requiring a runtime.
- Verify `<script>` and `<link>` tags in `dist/index.html` use relative paths
  (`./assets/...`), not absolute (`/assets/...`). This is what `base: './'` in
  `vite.config.ts` gives us.
- Smoke test the built bundle: `npx serve dist/` (or any static server),
  open in Chromium over HTTPS or `localhost`, exercise both backends.

### 8.2 — Write `docs/DEPLOYMENT.md`

Include:
- How to build (`npm run build` → upload `dist/` contents)
- Apache and nginx config snippets
- HTTPS requirement (loud — both Web Serial and WebUSB require secure context;
  this *must* be HTTPS in production)
- Subpath deployment notes (works at `/`, `/lab/`, `/courses/embedded-101/serial-terminal/`, etc., unchanged)
- A copy-pasteable `rsync` command for the user's typical workflow

### 8.3 — Update README.md

Include:
- What the app does
- Screenshot of both backends in use
- Lab-setup quickstart (Zadig instructions for binding WinUSB to FTDI on
  Windows; udev rules on Linux)
- Link to `docs/DEPLOYMENT.md`
- Link to the `ftdi-webusb-driver` library repo
- **Attribution** to zaxbux/web-serial-console as reference reading

### 8.4 — Add `docs/LAB-SETUP.md`

For instructors deploying this in a classroom:
- WinUSB binding (Windows: Zadig instructions)
- Chromium version requirements
- The one-time WebUSB permission prompt
- How to revoke permissions if a board changes hands
- udev rules for Linux (for WebUSB access without root)

### 8.5 — Add `CHANGELOG.md`

```markdown
# Changelog

## [0.1.0] - YYYY-MM-DD

### Added

- Browser serial terminal with two interchangeable backends:
  Web Serial API and WebUSB + ftdi-webusb-driver
- xterm.js terminal with FitAddon and WebLinksAddon
- Settings panel: baud (12 rates), data bits, parity, stop bits, flow control, local echo
- Settings persisted to localStorage; reset to defaults
- Backend preference persisted to localStorage
- Auto-reconnect to last-authorised device on page load
- Full Playwright E2E suite covering all UI flows (mocked backends)
- Manual smoke test protocol for real hardware verification
```

### 8.6 — Add `LICENSE` (MIT)

### 8.7 — Tag v0.1.0 and push

```bash
npm version 0.1.0 --no-git-tag-version
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore: bump version to 0.1.0 and date CHANGELOG"
git checkout main
git merge --no-ff phase/08-release -m "Merge phase/08-release: v0.1.0 release"
git tag -a v0.1.0 -m "v0.1.0 — first release"
git push origin main
git push origin v0.1.0
```

### 8.8 — Deploy to the university server

```bash
npm run build
rsync -avz --delete dist/ user@uni-server:/var/www/html/serial-terminal/
```

Verify the deployed URL serves over HTTPS and both backends work against real hardware.

---

## Commits

```
chore(build): verify dist/ uses only relative paths
docs(deploy): add DEPLOYMENT.md for static web server install
docs: write README with quick-start and lab setup link
docs: add LAB-SETUP guide for classroom deployment
docs: add CHANGELOG for v0.1.0
chore: add LICENSE (MIT)
chore: bump version to 0.1.0
chore: tag v0.1.0
```

---

## Acceptance criteria

- [ ] `dist/` is a self-contained static bundle (no Node, no runtime deps)
- [ ] HTML uses relative asset paths so deployment subpath doesn't matter
- [ ] Smoke-tested on a real Apache or nginx behind HTTPS
- [ ] README is clear enough that a new student can set up the classroom workflow from scratch
- [ ] `v0.1.0` tag is pushed
- [ ] App is deployed and reachable to students
