# PHASE-03-line-reporting.md — Line coding and state reporting

Branch: `phase/03-line-reporting`

## Goal

Capture the connection settings the host sets (baud, data bits, parity,
stop bits, DTR, RTS) and report them back on a sentinel command. This is
what lets the terminal-app's Web Serial backend test assert that
`open({ baudRate, dataBits, parity, stopBits })` actually reached the
device — closing the loop on settings pass-through, not just data
echo.

See `docs/USB-CDC.md` for the callback signatures and the
`cdc_line_coding_t` layout.

## The test-first part: the report formatter

The formatter turns a settings struct into a one-line report string.
Pure logic, host-testable, test-first.

### 3.1 — Failing test

`test/report_test.c`:

```c
#include <assert.h>
#include <string.h>
#include "../src/report.h"

int main(void) {
    rig_settings_t s = {
        .bit_rate = 115200, .data_bits = 8,
        .parity = 0 /*none*/, .stop_bits = 0 /*1*/,
        .dtr = true, .rts = false,
    };
    char buf[128];
    int n = rig_format_report(&s, buf, sizeof buf);

    assert(n > 0);
    assert(strcmp(buf, "RIG baud=115200 data=8 parity=none stop=1 dtr=1 rts=0\n") == 0);

    // parity / stop-bit enum mapping
    rig_settings_t s2 = { .bit_rate=9600, .data_bits=7, .parity=2 /*even*/,
                          .stop_bits=2 /*2*/, .dtr=false, .rts=true };
    rig_format_report(&s2, buf, sizeof buf);
    assert(strcmp(buf, "RIG baud=9600 data=7 parity=even stop=2 dtr=0 rts=1\n") == 0);

    return 0;
}
```

```bash
cc -o /tmp/report_test test/report_test.c src/report.c && /tmp/report_test && echo PASS
```

Fails (no `report.c`). Commit:
`test(report): unit-test the line-coding report formatter`

### 3.2 — Implement to green

`src/report.h` + `src/report.c`: `rig_format_report()` maps the parity
enum (0=none,1=odd,2=even,3=mark,4=space) and stop-bits enum (0=1,1=1.5,
2=2) to text and formats the line. Run host test to green. Commit:
`feat(report): implement line-coding report formatter`

## The firmware part: capture and respond

### 3.3 — Capture line coding

```c
static rig_settings_t g_settings;   // updated by callbacks

void tud_cdc_line_coding_cb(uint8_t itf, cdc_line_coding_t const* c) {
    (void) itf;
    g_settings.bit_rate  = c->bit_rate;
    g_settings.data_bits = c->data_bits;
    g_settings.parity    = c->parity;
    g_settings.stop_bits = c->stop_bits;
}
```

Commit: `feat(linecoding): capture host line coding via TinyUSB callback`

### 3.4 — Capture line state, mirror DTR to LED

```c
void tud_cdc_line_state_cb(uint8_t itf, bool dtr, bool rts) {
    (void) itf;
    g_settings.dtr = dtr;
    g_settings.rts = rts;
#ifdef PICO_DEFAULT_LED_PIN
    gpio_put(PICO_DEFAULT_LED_PIN, dtr);   // visual aid: LED on = DTR asserted
#endif
}
```

(Init the LED pin in `main()` even though we're no longer blinking — it's
now a DTR indicator.)

Commit: `feat(linecoding): capture DTR/RTS and mirror DTR to LED`

### 3.5 — Sentinel detection and report

Define a sentinel unlikely in normal text — the two bytes `0x01 0x3F`.
In `cdc_service()`, watch the RX stream: when the sentinel arrives,
write the formatted report instead of echoing those bytes. Everything
else echoes as before.

Keep a tiny 2-byte match state so the sentinel can span reads. On match,
format `g_settings` and queue the report string to TX.

Commit: `feat(report): reply with settings on sentinel sequence`

## Acceptance checklist

- [ ] Report-formatter host unit tests pass
- [ ] Sending `0x01 0x3F` returns a line like
      `RIG baud=115200 data=8 parity=none stop=1 dtr=1 rts=0`
- [ ] Reopening the host port at a different baud/parity changes the
      reported values
- [ ] Toggling DTR on the host toggles the LED and the reported `dtr=`
- [ ] Non-sentinel bytes still echo normally (Phase 2 behavior intact)
- [ ] Branch merged to `main`

## Note on USB CDC and "baud rate"

A USB CDC device has no real UART, so the baud rate is nominal — the
host's choice doesn't change any signaling on the wire. But the host
*does* transmit it via SET_LINE_CODING, TinyUSB delivers it to the
callback, and we store it. That's the point: the rig reports *what the
host asked for*, which is exactly what the terminal-app test needs to
confirm — that the Web Serial backend passed the user's `open()` options
through to the device. We're testing the software path, not UART
timing.
