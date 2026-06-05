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
