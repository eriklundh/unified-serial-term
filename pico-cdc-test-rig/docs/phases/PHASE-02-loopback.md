# PHASE-02-loopback.md — Byte loopback

Branch: `phase/02-loopback`

## Goal

Every byte the host writes comes back unchanged. This is the rig's
primary behavior and what proves the terminal-app Web Serial backend's
read/write path against real hardware.

The one subtlety is backpressure: the host can send faster than the USB
TX buffer drains. Writing blindly drops bytes. A ring buffer between RX
and TX absorbs the mismatch — and its index math is pure logic, so it
gets host-unit-tested **test-first** even though the surrounding
firmware doesn't.

## The test-first part: the ring buffer

The ring buffer is the one piece here you can develop the same way as
the TypeScript repos — red, green, refactor — because it's pure logic
with no hardware dependency. Compile it for the host and test it there.

### Files

```
src/ringbuf.h
src/ringbuf.c
test/ringbuf_test.c        ← host-compiled, not flashed
test/CMakeLists.txt        ← or a simple Makefile for the host test
```

### 2.1 — Failing test first

`test/ringbuf_test.c` (using plain asserts, or Unity if you prefer):

```c
#include <assert.h>
#include <string.h>
#include "../src/ringbuf.h"

int main(void) {
    ringbuf_t rb;
    uint8_t storage[8];
    ringbuf_init(&rb, storage, sizeof storage);

    // empty buffer
    assert(ringbuf_count(&rb) == 0);
    assert(ringbuf_free(&rb) == 7);   // one slot reserved to distinguish full/empty

    // push/pop round-trips
    assert(ringbuf_push(&rb, 'A') == true);
    assert(ringbuf_count(&rb) == 1);
    uint8_t b;
    assert(ringbuf_pop(&rb, &b) == true && b == 'A');
    assert(ringbuf_count(&rb) == 0);

    // fill to capacity, then push fails (no overwrite)
    for (int i = 0; i < 7; i++) assert(ringbuf_push(&rb, i) == true);
    assert(ringbuf_push(&rb, 99) == false);     // full — must not overwrite
    assert(ringbuf_free(&rb) == 0);

    // wrap-around: pop some, push some, order preserved
    assert(ringbuf_pop(&rb, &b) == true && b == 0);
    assert(ringbuf_pop(&rb, &b) == true && b == 1);
    assert(ringbuf_push(&rb, 100) == true);
    assert(ringbuf_push(&rb, 101) == true);
    // remaining drain order: 2,3,4,5,6,100,101
    uint8_t expect[] = {2,3,4,5,6,100,101};
    for (size_t i = 0; i < sizeof expect; i++) {
        assert(ringbuf_pop(&rb, &b) == true && b == expect[i]);
    }
    assert(ringbuf_count(&rb) == 0);

    return 0;
}
```

Build and run on the host (no ARM toolchain — native gcc):

```bash
cc -o /tmp/ringbuf_test test/ringbuf_test.c src/ringbuf.c && /tmp/ringbuf_test && echo PASS
```

It fails (no `ringbuf.c` yet). Commit:
`test(loopback): host-unit-test the RX→TX ring buffer logic`

### 2.2 — Implement to green

`src/ringbuf.h` + `src/ringbuf.c`: a classic single-producer
single-consumer ring buffer, head/tail indices, one reserved slot to
distinguish full from empty. Make `push`/`pop` return bool for
success/failure (never overwrite on full). Run the host test until it
passes.

Commit: `feat(loopback): ring buffer between CDC RX and TX`

### 2.3 — Refactor

Tidy naming, add the header doc comment describing the SPSC contract.
Re-run the host test. Commit:
`refactor(loopback): document ring buffer SPSC contract`

## The firmware part: wire it into CDC

### 2.4 — Echo via the ring buffer

In `main.c`, between `tud_task()` calls, drain RX into the ring buffer
and the ring buffer into TX as room allows:

```c
static void cdc_service(void) {
    // RX → ring
    while (tud_cdc_available() && ringbuf_free(&rb) > 0) {
        uint8_t c;
        if (tud_cdc_read(&c, 1) == 1) ringbuf_push(&rb, c);
    }
    // ring → TX
    while (ringbuf_count(&rb) > 0 && tud_cdc_write_available() > 0) {
        uint8_t c;
        if (ringbuf_pop(&rb, &c)) tud_cdc_write(&c, 1);
    }
    tud_cdc_write_flush();
}
```

(Byte-at-a-time shown for clarity; batch with small stack buffers if you
want throughput. Keep it correct first.)

Commit: `feat(loopback): echo received bytes back to host`

### 2.5 — Manual smoke

```bash
picocom -b 115200 /dev/ttyACM0     # or screen, or minicom
# type characters → they echo back
# Ctrl-A Ctrl-X to exit picocom
```

Then a stress check: paste several KB at once and confirm nothing is
dropped (the ring buffer earns its place here).

## Acceptance checklist

- [ ] Ring-buffer host unit tests pass
- [ ] Typed characters echo back over a terminal program
- [ ] A multi-KB paste round-trips with no byte loss
- [ ] Build clean, branch merged to `main`

## Why the ring buffer matters

Without it, a fast host write overruns the TX buffer and you drop bytes
silently — which would show up later as flaky, intermittent failures in
the terminal-app's Web Serial test that are maddening to diagnose.
Getting it right here, with unit tests proving the wrap-around and
full-buffer behavior, means the loopback is trustworthy as a test
oracle.
