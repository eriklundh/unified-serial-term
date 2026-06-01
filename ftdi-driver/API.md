# API Reference — ftdi-webusb-driver

> Generated from TSDoc comments. Run `npm run docs` to rebuild the full
> hyperlinked reference in `docs-out/`.

---

## `FtdiUart`

Main driver class. Wraps a {@link UsbTransport} and exposes a serial-port-like
API over WebUSB.

```ts
import { FtdiUart } from 'ftdi-webusb-driver';
```

### Static factory

```ts
static async open(device: USBDevice, opts?: FtdiUartOptions): Promise<FtdiUart>
```

Opens the USB device, selects configuration 1, and claims the interface.
Wraps `device` in a `WebUsbTransport` automatically.

### Instance methods

```ts
async configure(opts: SerialOptions): Promise<void>
```
Apply serial settings (baud rate, data format, flow control, modem lines,
latency timer). Safe to call multiple times.

```ts
async write(data: BufferSource): Promise<void>
```
Send data to the TX FIFO. Split into ≤ 64-byte chunks automatically.

```ts
async read(maxBytes?: number): Promise<Uint8Array>
```
One bulk-IN transfer with status header stripped. Returns an empty array on
idle packets. `maxBytes` defaults to 64.

```ts
async setModemControl(opts: { dtr?: boolean; rts?: boolean }): Promise<void>
```
Assert or deassert DTR/RTS lines independently.

```ts
async getModemStatus(): Promise<ModemStatusFlags>
```
Query current CTS/DSR/RI/RLSD state.

```ts
async close(): Promise<void>
```
Release the USB interface and close the transport.

### Stream accessors

```ts
readonly readable: ReadableStream<Uint8Array>
readonly writable: WritableStream<Uint8Array>
```

Created lazily on first access. The readable stream loops `read()` internally,
suppressing idle (zero-length) packets. Cancel/close is wired to `close()`.

### Read-only properties

| Property | Type | Default | Description |
|---|---|---|---|
| `interfaceNumber` | `number` | `0` | USB interface claimed |
| `bulkInEndpoint` | `number` | `1` | Bulk-IN endpoint number |
| `bulkOutEndpoint` | `number` | `2` | Bulk-OUT endpoint number |
| `maxPacketSize` | `number` | `64` | Max bulk packet size |

---

## `SerialOptions`

Passed to `FtdiUart.configure()`.

| Field | Type | Default | Description |
|---|---|---|---|
| `baud` | `number` | *(required)* | Baud rate in bps |
| `dataBits` | `DataBits` | `8` | 5, 6, 7, or 8 |
| `parity` | `Parity` | `'none'` | `'none'`, `'odd'`, `'even'`, `'mark'`, `'space'` |
| `stopBits` | `StopBits` | `1` | `1`, `1.5`, or `2` |
| `flowControl` | `FlowMode` | `'none'` | `'none'`, `'rtscts'`, `'dtrdsr'`, `'xonxoff'` |
| `dtr` | `boolean` | `true` | Initial DTR state |
| `rts` | `boolean` | `true` | Initial RTS state |
| `latencyMs` | `number` | `16` | Latency timer (1–255 ms) |

---

## `FtdiUartOptions`

Optional second argument to `FtdiUart.open()` / `new FtdiUart()`.

| Field | Type | Default |
|---|---|---|
| `interfaceNumber` | `number` | `0` |
| `bulkInEndpoint` | `number` | `1` |
| `bulkOutEndpoint` | `number` | `2` |

---

## `UsbTransport` (interface)

Abstraction layer over WebUSB. Inject a `MockUsbTransport` in tests.

```ts
import type { UsbTransport } from 'ftdi-webusb-driver';
import { MockUsbTransport } from 'ftdi-webusb-driver/testing';
```

Methods: `open`, `close`, `selectConfiguration`, `claimInterface`,
`releaseInterface`, `controlOut`, `controlIn`, `bulkOut`, `bulkIn`.

---

## `WebUsbTransport`

Production `UsbTransport` that wraps a real `USBDevice`.

```ts
import { WebUsbTransport } from 'ftdi-webusb-driver';
const transport = new WebUsbTransport(device);
```

---

## `TransferError`

Thrown by `WebUsbTransport` when a USB transfer returns a non-`'ok'` status.

```ts
import { TransferError } from 'ftdi-webusb-driver';
```

---

## Status-header types

```ts
import { stripStatus, ModemStatusBits, LineStatusBits } from 'ftdi-webusb-driver';
import type { StrippedPacket, ModemStatusFlags, LineStatusFlags } from 'ftdi-webusb-driver';
```

### `stripStatus(packet: Uint8Array): StrippedPacket`

Strip the mandatory 2-byte status header from a raw bulk-IN packet.
Throws `RangeError` if packet is < 2 bytes.

### `ModemStatusFlags`

`{ cts, dsr, ri, rlsd, raw }` — decoded byte 0 of every bulk-IN packet.

### `LineStatusFlags`

`{ overrunError, parityError, framingError, breakInterrupt,
transmitHoldingRegisterEmpty, transmitterEmpty, fifoError, raw }`

---

## Pure-function building blocks

These are exported for advanced use and testing; normally `FtdiUart.configure()`
calls them internally.

```ts
import { baudToDivisor, encodeLineProperties, encodeModemControl, encodeFlowControl }
  from 'ftdi-webusb-driver';
```

| Function | Returns | Notes |
|---|---|---|
| `baudToDivisor(baud)` | `BaudDivisor` | FT232BM divisor encoding |
| `encodeLineProperties(opts)` | `number` | `wValue` for `SIO_SET_DATA` |
| `encodeModemControl(opts)` | `{ wValue }` | `wValue` for `SIO_MODEM_CTRL` |
| `encodeFlowControl(mode, opts?)` | `{ wValue, wIndex }` | `SIO_SET_FLOW_CTRL` |

---

## `VendorRequest` / `ResetSubcommand`

Const enums of FTDI vendor command codes, exported for low-level use.

```ts
import { VendorRequest, ResetSubcommand } from 'ftdi-webusb-driver';
```
