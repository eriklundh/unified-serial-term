# PHASE-10-release.md — Release preparation

Branch: `phase/10-release`

## Goal

The library is feature-complete and tested. This phase polishes it into
something publishable: README, generated API docs, a minimal example,
CHANGELOG, version bump, and the `v0.1.0` git tag.

## Steps

### Step 10.1 — Expand README

Replace the placeholder README from Phase 0 with a real one:

```markdown
# ftdi-webusb-driver

Pure-TypeScript WebUSB driver for FTDI FT-X family chips (FT231XS, FT230X).

Enables browser-based serial UART access to FTDI chips bound to
WinUSB/libusb — no virtual COM port driver required. Designed for
educational and lab settings where the same FTDI chip needs to switch
between JTAG and UART workflows without swapping OS drivers.

## Status

`v0.1.0` — UART subset complete, tested against FT231XS. MPSSE/JTAG
support is out of scope; see the FT232H ecosystem for that.

## Installation

    npm install ftdi-webusb-driver

## Quick start

```ts
import { FtdiUart } from 'ftdi-webusb-driver';

// User gesture required for navigator.usb.requestDevice
const device = await navigator.usb.requestDevice({
  filters: [{ vendorId: 0x0403, productId: 0x6015 }],
});

const ftdi = await FtdiUart.open(device);
await ftdi.configure({ baud: 115200, dataBits: 8, parity: 'none', stopBits: 1 });

// Stream-based usage
const writer = ftdi.writable.getWriter();
await writer.write(new TextEncoder().encode('Hello UART\n'));
writer.releaseLock();

const reader = ftdi.readable.getReader();
const { value } = await reader.read();
console.log(new TextDecoder().decode(value));
reader.releaseLock();

await ftdi.close();
```

## API

See [API.md](./API.md) for the full reference.

Key types:

- `FtdiUart` — main driver class
- `SerialOptions` — configuration options
- `UsbTransport` — abstraction (allows mock injection)
- `ModemStatusFlags`, `LineStatusFlags` — decoded status

## Supported chips

Tested on **FT231XS** (PID `0x6015`). The protocol is shared with FT230X,
FT232R, and FT232BM, but only the FT-X family is in the supported
matrix. FT2232x and FT4232x (multi-channel) are not supported.

## Browser support

Requires WebUSB:

- Chrome / Chromium 61+
- Edge 79+
- Opera 48+

Not supported:

- Firefox (no WebUSB)
- Safari (no WebUSB)

## Development

See [CLAUDE.md](./CLAUDE.md) for project conventions.
See [PLAN.md](./PLAN.md) for the development plan.
See [docs/](./docs/) for protocol references and test vectors.

    npm install
    npm test               # unit tests
    npm run test:hw        # hardware-in-loop tests (requires board)
    npm run typecheck
    npm run lint
    npm run build

## License

MIT
```

**Commit:** `docs: expand README with quick-start and API overview`

### Step 10.2 — Generate API docs

Install `typedoc` and `typedoc-plugin-markdown`:

```
npm install --save-dev typedoc typedoc-plugin-markdown
```

#### CRITICAL: always point typedoc output at a dedicated subdirectory

`typedoc-plugin-markdown` v4+ cleans its output directory before writing.
If `"out"` is set to `"."` (project root), it will **delete the entire
project tree** — source files, `.git/`, `node_modules/`, everything — and
replace it with the generated docs. The repo was destroyed this way during
the first attempt at this phase (2026-06-01). Recovery required a fresh
clone from the remote.

**Rule:** always set `"out"` to a dedicated subdirectory such as
`"docs-out"`. Never point it at `.`, `..`, or any directory that contains
source files or a `.git/` directory.

Add `typedoc.json`:

```json
{
  "entryPoints": ["src/index.ts"],
  "out": "docs-out",
  "plugin": ["typedoc-plugin-markdown"],
  "readme": "none",
  "hideBreadcrumbs": true,
  "hidePageHeader": true,
  "githubPages": false
}
```

Add `docs-out` to `.gitignore` (the generated files are build artefacts;
commit `typedoc.json` and the TSDoc source comments, not the output):

```
docs-out/
```

Add npm script:

```json
"docs": "typedoc"
```

Run `npm run docs`. Inspect `docs-out/`. Tweak TSDoc comments on public
exports until the generated docs read well.

**Commits (potentially several):**
- `chore: add typedoc with safe docs-out output directory`
- `docs: improve TSDoc comments on FtdiUart public methods`
- `docs: improve TSDoc comments on SerialOptions and related types`

### Step 10.3 — Minimal example

`examples/minimal.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ftdi-webusb-driver minimal example</title>
</head>
<body>
  <button id="connect">Connect</button>
  <pre id="output" style="background:#111;color:#0f0;padding:1em;min-height:200px"></pre>

  <script type="module">
    import { FtdiUart } from '../dist/index.js';

    const output = document.getElementById('output');
    const log = (msg) => { output.textContent += msg + '\n'; };

    document.getElementById('connect').onclick = async () => {
      try {
        const device = await navigator.usb.requestDevice({
          filters: [{ vendorId: 0x0403, productId: 0x6015 }],
        });
        log('Device opened: ' + device.productName);

        const ftdi = await FtdiUart.open(device);
        await ftdi.configure({ baud: 115200, latencyMs: 4 });
        log('Configured 115200 8N1');

        const reader = ftdi.readable.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) output.textContent += decoder.decode(value);
        }
      } catch (err) {
        log('Error: ' + err.message);
      }
    };
  </script>
</body>
</html>
```

Test it: build the library, serve the `examples/` directory with a
trivial HTTP server (WebUSB requires HTTPS or `localhost`), plug in
the board, click Connect, watch UART data appear.

**Commit:** `feat: add examples/minimal.html demonstrating library usage`

### Step 10.4 — CHANGELOG

`CHANGELOG.md`:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - YYYY-MM-DD

### Added

- `FtdiUart` class with `open`, `configure`, `read`, `write`, `close`
- `UsbTransport` interface with `WebUsbTransport` (production) and
  `MockUsbTransport` (testing, exported via `ftdi-webusb-driver/testing`)
- `ReadableStream` and `WritableStream` accessors on `FtdiUart`
- Pure-function building blocks: `baudToDivisor`, `encodeLineProperties`,
  `encodeModemControl`, `encodeFlowControl`, `stripStatus`
- Hardware-in-loop test suite under `test-hw/` (gated by `FTDI_HW_TEST=1`)
- Full TSDoc-generated API documentation

### Tested chips

- FT231XS (VID `0x0403`, PID `0x6015`)

### Known limitations

- No MPSSE / JTAG / bit-bang support — out of scope
- Multi-channel chips (FT2232x, FT4232x) not in supported matrix
- Firefox / Safari not supported (no WebUSB)
```

**Commit:** `docs: add CHANGELOG for v0.1.0`

### Step 10.5 — Version bump and tag

```
npm version 0.1.0 --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore: bump version to 0.1.0"

# Date the CHANGELOG
# Edit CHANGELOG.md to replace YYYY-MM-DD
git add CHANGELOG.md
git commit -m "docs: date the v0.1.0 CHANGELOG entry"

# Merge phase branch
git checkout main
git merge --no-ff phase/10-release -m "Merge phase/10-release

v0.1.0: feature-complete UART driver for FT231XS over WebUSB."

# Tag
git tag -a v0.1.0 -m "v0.1.0 — first release"
git push origin main
git push origin v0.1.0
```

## Acceptance checklist

- [ ] README has quick-start, API overview, supported chips, browser support
- [ ] `npm run docs` produces a clean `API.md`
- [ ] `examples/minimal.html` works against real hardware
- [ ] CHANGELOG.md exists and is dated
- [ ] Version is `0.1.0` in `package.json`
- [ ] `v0.1.0` git tag exists and is pushed
- [ ] Branch merged to `main`

## Optional follow-ups (post-v0.1.0)

- Publish to npm (`npm publish` — needs npm account, decide on scope name)
- Add a Latency vs. throughput benchmark page
- Add a doc on troubleshooting (`Device cannot be claimed` etc.)
- Consider adding TypeScript-projects-only smoke test that imports the
  built artifact, to catch broken `exports` map
