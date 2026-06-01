# USB-CDC.md — TinyUSB CDC device reference

What you need to know about TinyUSB's CDC device class to implement this
rig. This is reference material, not a full TinyUSB tutorial — the SDK
bundles TinyUSB and its examples under `$PICO_SDK_PATH/lib/tinyusb/`.

## Why CDC-ACM

The terminal-app's Web Serial backend talks to whatever the OS exposes
as a serial port. A USB CDC-ACM (Communications Device Class, Abstract
Control Model) device is bound by the OS's built-in USB-serial driver
and appears as `/dev/ttyACM*` (Linux), a COM port (Windows), or
`/dev/cu.usbmodem*` (macOS). No driver install. That's exactly the
target `navigator.serial` opens.

This is deliberately *not* an FTDI-style vendor device — that's the
other rig (the FT231X dongle, tested via WebUSB). A CDC device exercises
the Web Serial path specifically.

## Minimal CDC device: the three pieces

### 1. `tusb_config.h`

Enables the device stack and the CDC class. The essentials:

```c
#define CFG_TUSB_MCU              OPT_MCU_RP2040   // set by the SDK board
#define CFG_TUSB_OS               OPT_OS_PICO

#define CFG_TUD_ENABLED           1
#define CFG_TUD_CDC               1                // one CDC interface

#define CFG_TUD_CDC_RX_BUFSIZE    256
#define CFG_TUD_CDC_TX_BUFSIZE    256
#define CFG_TUD_CDC_EP_BUFSIZE    64               // matches USB FS bulk max
```

Most of this is boilerplate lifted from the TinyUSB CDC example. The
buffer sizes are the knobs that matter for the loopback's throughput
behavior under fast input.

### 2. `usb_descriptors.c`

Three descriptor sets:

- **Device descriptor:** VID/PID, USB version, device class. Use a
  **test VID/PID** — the TinyUSB examples use `0xCafe` as VID. Do **not**
  ship a real vendor's VID. For a private test rig, `0xCafe` with any
  PID is fine; the host doesn't care for CDC binding.
- **Configuration descriptor:** declares the CDC interface association
  (a CDC device is two interfaces — a control interface and a data
  interface — wrapped in an IAD). The
  `TUD_CDC_DESCRIPTOR(...)` helper macro emits the whole block; you
  supply interface numbers, the notification endpoint, and the two bulk
  endpoints. Copy the example's macro usage and adjust endpoint numbers.
- **String descriptors:** manufacturer, product, serial. Make the
  product string something recognizable like `"Pico CDC Test Rig"` so
  it's obvious in `lsusb -v` and in the Web Serial port picker.

The endpoint numbers matter only in that they must be internally
consistent and not collide. The example's defaults (notification on
EP 0x81, data out 0x02 / in 0x82) work as-is.

### 3. The service loop

USB needs servicing continuously. In `main()`:

```c
tusb_init();
while (true) {
    tud_task();          // TinyUSB device task — must be called often
    cdc_service();       // our loopback/echo logic (Phase 2+)
}
```

`tud_task()` drives enumeration, control transfers, and endpoint
servicing. Starve it and the device drops off the bus. Keep the loop
tight — no blocking delays.

## The CDC API you'll use

Reading and writing:

```c
uint32_t tud_cdc_available(void);                       // bytes waiting in RX
uint32_t tud_cdc_read(void *buf, uint32_t bufsize);     // read from host
uint32_t tud_cdc_write(const void *buf, uint32_t size); // queue to host
uint32_t tud_cdc_write_available(void);                 // room in TX buffer
uint32_t tud_cdc_write_flush(void);                     // push TX now
bool     tud_cdc_connected(void);                       // host opened the port
```

Callbacks (you implement these; TinyUSB calls them):

```c
// Host changed line coding (baud, parity, data bits, stop bits).
void tud_cdc_line_coding_cb(uint8_t itf, cdc_line_coding_t const* coding);

// Host changed control lines (DTR/RTS).
void tud_cdc_line_state_cb(uint8_t itf, bool dtr, bool rts);

// Optional: host sent data (alternative to polling tud_cdc_available()).
void tud_cdc_rx_cb(uint8_t itf);
```

`cdc_line_coding_t` is:

```c
typedef struct {
    uint32_t bit_rate;     // host-requested baud (cosmetic for USB, but reported)
    uint8_t  stop_bits;    // 0=1, 1=1.5, 2=2
    uint8_t  parity;       // 0=none,1=odd,2=even,3=mark,4=space
    uint8_t  data_bits;    // 5,6,7,8,16
} cdc_line_coding_t;
```

## What the rig does with each piece

| CDC element | Rig behavior | Phase |
|-------------|--------------|-------|
| RX data | Echo back via TX (the loopback) | 2 |
| `tud_cdc_line_coding_cb` | Store baud/parity/stop/data for reporting | 3 |
| `tud_cdc_line_state_cb` | Store DTR/RTS; mirror DTR to the LED | 3 |
| Sentinel byte sequence in RX | Reply with a text report of stored settings instead of echoing | 3 |

### The loopback (Phase 2)

Read whatever's available, write it straight back, flush. The only
subtlety is backpressure: if `tud_cdc_write_available()` is less than
what you read, you'd drop bytes by writing blindly. A small ring buffer
between RX and TX absorbs the mismatch. The ring buffer's index math is
pure logic — unit-test it on the host (Phase 2/4) rather than debugging
it on-target.

### The settings report (Phase 3)

USB CDC doesn't actually run a UART, so `bit_rate` etc. are nominal —
but the host *does* send them via SET_LINE_CODING, and TinyUSB hands
them to `tud_cdc_line_coding_cb`. Capturing them lets the rig answer
"what did the host ask for?", which is how the terminal-app's Web Serial
backend test confirms it passed `open({ baudRate, ... })` through
correctly.

Pick a sentinel unlikely in normal text — e.g. the two-byte sequence
`0x01 0x3F`. When the rig sees it in the RX stream, instead of echoing
it, it writes back a single line like:

```
RIG baud=115200 data=8 parity=none stop=1 dtr=1 rts=0
```

The formatter (struct → string) is pure logic; unit-test it test-first.
Everything that isn't the sentinel still echoes normally, so the
loopback test and the settings test don't interfere.

## Pitfalls

- **Not calling `tud_task()` often enough** — the device enumerates then
  drops, or never enumerates. Keep the main loop free of blocking calls.
- **Forgetting `tud_cdc_write_flush()`** — bytes sit in the TX buffer and
  the host sees nothing until the buffer fills. Flush after writing the
  echo.
- **Writing more than `tud_cdc_write_available()`** — silent byte loss.
  Check available room, or ring-buffer and drain as room frees up.
- **Submodules not initialized** — TinyUSB headers missing at compile
  time. See `DEV-ENVIRONMENT.md` §2.
- **Sentinel appearing in real payload** — if the test harness ever
  legitimately sends `0x01 0x3F` as data, it'll be intercepted. Keep the
  sentinel out of the loopback test payloads, or make it a longer,
  less-likely sequence.
