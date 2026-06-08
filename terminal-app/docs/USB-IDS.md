# USB VID:PID Data — Sources, Findings, and Automation Plan

This document records what we know about obtaining USB vendor/product identity
data, what sources exist, and how a future build step should pull from them
automatically.

---

## Why we need this

`src/backends/usbVendors.ts` maps USB Vendor ID + Product ID pairs to
human-readable strings displayed in the "Serial connect" dropdown.  Without
this mapping a Raspberry Pi Pico shows as `(2e8a:000a)` and two identical
CH340-based cables are indistinguishable.  With it they show as
`Raspberry Pi Pico CDC UART (2e8a:000a)` and duplicates are numbered `#1`,
`#2`, etc.

The table is deliberately small — only chip families likely to appear in a lab
serial terminal session — but it needs to stay current as new silicon appears
(RP2350, CH9102, CP2102N, etc.).

---

## Current implementation

File: `src/backends/usbVendors.ts`

The `VENDORS` constant is hand-maintained.  `deviceLabel()` prefers
USB string descriptors (`productName`, `serialNumber`) from the device itself
when available (WebUSB path), and falls back to the table, then to bare
`(xxxx:xxxx)`.

Entries as of this writing:

| VID    | Alias        | Named PIDs |
|--------|--------------|------------|
| 0x0403 | FTDI         | FT232R, FT2232, FT4232, FT232H, FT-X |
| 0x067b | Prolific     | PL2303, PL2303x |
| 0x10c4 | Silicon Labs | CP210x, CP2105, CP2108 |
| 0x1a86 | QinHeng      | CH341 (serial), CH340 |
| 0x2341 | Arduino      | (vendor alias only) |
| 0x2a03 | Arduino      | (vendor alias only) |
| 0x2e8a | Raspberry Pi | Pico CDC UART (×2), Pico MicroPython, Pico CircuitPython, PicoProbe, Debug Probe, RP2040 Boot, RP2350 Boot |

---

## Data sources

### Source 1 — USB-IF official vendor list (usb.org)

**URL to discover PDF:** `https://www.usb.org/developers`
**What it contains:** VID → company name only.  No product IDs.
**Authority:** Highest — USB-IF is the registrar.
**Access:** The PDF link on the developers page changes with every release
(filename encodes the date, e.g. `vendor_ids03102026_0.pdf`).  Direct
programmatic download returns HTTP 403; the file requires a browser session
cookie obtained by visiting the page first.

**Findings from this session:**
- The PDF is a two-column table: `XXXX  Company Name` where XXXX is a
  four-digit hex VID.
- Content confirmed to cover all registered VIDs.
- Could not fetch programmatically without a headless browser.

### Source 2 — usb.ids community database (usb-ids.gowdy.us)

**URL:** `https://usb-ids.gowdy.us/usb.ids`
**What it contains:** Both VIDs and PIDs with names.  Vendor lines are
`XXXX  Vendor Name`; product lines are `\tXXXX  Product Name` (tab-indented).
**Authority:** Community-maintained volunteer project that mirrors and
extends USB-IF data.  Powers `lsusb` and similar tools on Linux.
**Access:** Plain HTTP, no auth, ~2 MB text file.

**Findings from this session:**
- Successfully fetched via `curl`.
- Confirmed entries for 0x067b (Prolific), 0x10c4 (Silicon Labs), 0x1a86
  (QinHeng Electronics), 0x2341 (Arduino SA), 0x2a03 (dog hunter AG).
- 0x2e8a (Raspberry Pi) was not present in the copy fetched — likely added
  after the last community sync.
- The format is stable and has been consistent for many years.
- Notable: 0x2a03 is registered to "dog hunter AG" not "Arduino"; all
  0x2a03 products are Arduino-branded so we alias it as "Arduino" for user
  clarity.

**Relevant blocks extracted (serial-adapter subset):**

```
067b  Prolific Technology, Inc.
    2303  PL2303 Serial Port / Mobile Phone Data Cable
    aaa2  PL2303 Serial Adapter (IODATA USB-RSAQ3)
    aaa3  PL2303x Serial Adapter

10c4  Silicon Labs
    ea60  CP210x UART Bridge
    ea61  CP210x UART Bridge
    ea63  CP210x UART Bridge
    ea70  CP2105 Dual UART Bridge
    ea71  CP2108 Quad UART Bridge

1a86  QinHeng Electronics
    5523  CH341 in serial mode, usb to serial port converter
    7522  CH340 serial converter
    7523  CH340 serial converter

2341  Arduino SA
    (many CDC ACM boards — alias only for now)

2a03  dog hunter AG
    (many Arduino-branded CDC ACM boards — alias "Arduino" for clarity)
```

### Source 3 — Raspberry Pi USB PID registry (GitHub)

**URL:** `https://raw.githubusercontent.com/raspberrypi/usb-pid/refs/heads/main/Readme.md`
**What it contains:** All PIDs allocated under VID 0x2E8A, in a Markdown
table.  Split into "Internal" (Raspberry Pi own products) and "Commercial
Selection" (third-party RP2040/RP2350 products, 0x1000–0x1125 range).
**Authority:** Authoritative for VID 0x2E8A — maintained by Raspberry Pi.
**Access:** Plain HTTPS, no auth.

**Findings from this session:**
- Successfully fetched.
- Internal PIDs relevant to a serial terminal:

  | PID    | Name |
  |--------|------|
  | 0x0003 | RP2040 boot mode |
  | 0x0004 | PicoProbe (obsolete) |
  | 0x0005 | Pico MicroPython firmware (CDC) |
  | 0x0009 | Pico SDK CDC UART |
  | 0x000A | Pico SDK CDC UART (RP2040) |
  | 0x000B | Pico CircuitPython firmware |
  | 0x000C | Debug Probe |
  | 0x000F | RP2350 boot mode |

- PIDs 0x0009 and 0x000A have the same functional meaning (CDC UART); the
  VID:PID suffix already distinguishes them in the label.
- Commercial range (0x1000+) covers >200 third-party products; not included
  in the table since they are community-specific devices.

---

## Future automation plan

The goal is a build step (`npm run generate:usb-vendors`) that fetches all
three sources, merges them, and emits a TypeScript file (or JSON) that
`usbVendors.ts` imports — replacing the hand-maintained table.

### Architecture overview

```
generate-usb-vendors/
  index.ts          — orchestrator: fetch → merge → emit
  parsers/
    usbids.ts       — parses usb.ids plain-text format
    raspberrypi.ts  — parses raspberrypi/usb-pid Readme.md
    usbif.ts        — fetches usb.org/developers, finds PDF, parses PDF
  merge.ts          — merges sources with priority rules
  emit.ts           — writes src/backends/usbVendors.generated.ts
```

The hand-maintained `usbVendors.ts` would shrink to the `deviceLabel()`
function plus an import of the generated data:

```ts
import { VENDORS } from './usbVendors.generated'
```

An override mechanism (a small hand-maintained `usbVendors.overrides.ts`)
allows correcting machine-parsed data without touching generated output.

### Source priority (on conflict)

1. Vendor-specific repos (Raspberry Pi) — authoritative for their own VIDs
2. usb.ids — best PID coverage, community-curated
3. USB-IF official list — VID names only, use as fallback for vendor alias

### Parser 1 — usb.ids

**Complexity:** Low.  Format is documented and stable.

```
Fetch: GET https://usb-ids.gowdy.us/usb.ids
Parse:
  for each line:
    /^([0-9a-f]{4})  (.+)/      → new vendor { vid, name }
    /^\t([0-9a-f]{4})  (.+)/   → product { pid, name } under current vendor
    /^#/ or blank               → skip
Filter:
  Optionally restrict to a whitelist of VIDs relevant to USB-serial.
  For a full table, emit all vendors.
Output:
  Record<number, VendorEntry>
```

The file is ~2 MB; parse time is negligible.  Run at most once per day (the
file is updated infrequently).  Cache locally in `scripts/cache/usb.ids` with
an `If-Modified-Since` header.

### Parser 2 — Raspberry Pi usb-pid Readme.md

**Complexity:** Low-medium.  Markdown tables with a known structure.

```
Fetch: GET https://raw.githubusercontent.com/raspberrypi/usb-pid/refs/heads/main/Readme.md
Parse:
  1. Extract VID from "## Vendor ID" section (line matching /0x[0-9A-F]{4}/).
  2. Find "## Product IDs (Internal)" section.
  3. Parse the Markdown table: lines matching /^\| 0x([0-9A-F]{4}) \| (.+) \|/
     (case-insensitive hex).
  4. Optionally parse "## Product IDs (Commercial Selection)" for completeness.
Output:
  Single VendorEntry for 0x2E8A with devices map.
```

Watch for format changes: add a schema-version assertion that fails the build
loudly if the section headings disappear, so drift is caught early.

### Parser 3 — USB-IF official vendor list PDF (usb.org)

**Complexity:** High.  Two sub-problems: discovering the current PDF URL, and
parsing the PDF itself.

#### Step A — Discover the PDF URL

The PDF filename encodes the date and changes with every release.  The
canonical entry point is `https://www.usb.org/developers`.

```
Fetch: GET https://www.usb.org/developers  (HTML page)
Parse:
  Find <a> tags whose href matches /vendor_ids.*\.pdf$/i.
  Take the first (or most recent by date in filename).
  Resolve to an absolute URL.
```

This page is public HTML and does not require authentication to *read*.  Only
the PDF download itself enforces a session check (HTTP 403 for non-browser
clients, confirmed in this session).

#### Step B — Download the PDF

Direct `curl`/`fetch` of the PDF returns 403.  Options in order of
preference:

1. **Playwright headless browser** — navigate to the developers page, click
   the PDF link; Playwright handles the session cookie automatically.
   ```ts
   const browser = await chromium.launch()
   const page = await browser.newPage()
   await page.goto('https://www.usb.org/developers')
   const [download] = await Promise.all([
     page.waitForEvent('download'),
     page.click('a[href*="vendor_ids"]'),
   ])
   const path = await download.path()
   ```
   Playwright is already a dev dependency (used for e2e tests).

2. **Cached copy** — ship a known-good copy of the PDF in
   `scripts/cache/usb-if-vendors.pdf` and only re-fetch when the discovered
   URL changes.  Reduces dependency on session-cookie behaviour.

3. **Accept partial data** — if usb.org is unreachable or 403, skip it and
   rely on usb.ids for vendor names.  usb.ids mirrors USB-IF data for the
   vast majority of VIDs; the gap is small.

#### Step C — Parse the PDF

```
Tool: pdf-parse (npm) or pdfjs-dist
Input: downloaded PDF buffer
Parse:
  Extract full text with page layout preserved.
  Each vendor row appears as: "XXXX\tCompany Name" or similar
  (exact spacing depends on PDF generation; verify against a known entry
  such as "0403\tFuture Technology Devices International, Ltd").
  Regex: /^([0-9A-Fa-f]{4})\s{2,}(.+)$/m on each text line.
Output:
  Record<number, string>  (VID → vendor name, no PIDs)
```

### Merge logic

```
// Priority: raspberry-pi > usb-ids > usb-if
const merged: Record<number, VendorEntry> = {}

for (const [vid, entry] of usbIfVendors) {
  merged[vid] = { alias: entry.name }
}
for (const [vid, entry] of usbIdsVendors) {
  merged[vid] = {
    alias: entry.name,
    devices: entry.products,
  }
}
for (const [vid, entry] of raspberryPiVendors) {
  merged[vid] = {
    ...merged[vid],
    alias: entry.alias,
    devices: { ...merged[vid]?.devices, ...entry.devices },
  }
}

// Apply manual overrides last
for (const [vid, override] of overrides) {
  merged[vid] = { ...merged[vid], ...override }
}
```

### Filtering for the dropdown

The full usb.ids contains ~25 000 vendor entries.  For the dropdown we only
care about devices a student might plug into a lab serial terminal.  Two
approaches:

- **Whitelist (current approach, automated):** maintain a list of VIDs to
  include; the build step extracts only those vendors from the full table.
  Easy to extend by adding a VID to the list.

- **Full table (future):** ship the entire parsed table as a JSON asset and
  import it lazily.  Adds ~500 kB to the bundle; acceptable if tree-shaking
  removes unused entries, but needs measurement.

Recommended starting point: whitelist approach, with the VID list in a
separate config file (`scripts/usb-vendor-vids.json`).

### Build step integration

```jsonc
// package.json
"scripts": {
  "generate:usb-vendors": "tsx scripts/generate-usb-vendors/index.ts",
  "prebuild": "node script/ensure-driver-built.mjs && npm run generate:usb-vendors"
}
```

The generated file is **checked in** so that a cold CI build (no network
access to usb.org/usb-ids) still has valid data.  The generation script is
run by maintainers when updating the table, with output committed.  A CI job
can optionally run it on a schedule and open a PR if the output changes.

---

## Manual update checklist (until automation is built)

Until the build step exists, update `usbVendors.ts` by hand when:

- A new chip family appears in the lab (students report `(xxxx:xxxx)` labels)
- Raspberry Pi releases new firmware with new PIDs — check
  `https://github.com/raspberrypi/usb-pid`
- A new silicon vendor becomes common (e.g. WCH CH9102, CP2102N)

Look up the PID in usb.ids first, then cross-check with the vendor's datasheet.
Add a unit test in `usbVendors.test.ts` for every new entry.
