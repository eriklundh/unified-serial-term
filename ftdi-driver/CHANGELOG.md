# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-06-01

### Added

- `FtdiUart` class with `open`, `configure`, `read`, `write`, `close`
- `UsbTransport` interface with `WebUsbTransport` (production) and
  `MockUsbTransport` (testing, exported via `ftdi-webusb-driver/testing`)
- `ReadableStream` and `WritableStream` accessors on `FtdiUart`
- Pure-function building blocks: `baudToDivisor`, `encodeLineProperties`,
  `encodeModemControl`, `encodeFlowControl`, `stripStatus`
- Hardware-in-loop test suite under `test-hw/` (gated by `FTDI_HW_TEST=1`)
- Full TSDoc-generated API documentation (`npm run docs` → `docs-out/`)

### Tested chips

- FT231XS (VID `0x0403`, PID `0x6015`)

### Known limitations

- No MPSSE / JTAG / bit-bang support — out of scope
- Multi-channel chips (FT2232x, FT4232x) not in supported matrix
- Firefox / Safari not supported (no WebUSB)
