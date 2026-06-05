# FTDI USB protocol reference

Authoritative reference for the FT-X family (FT231XS specifically) USB
behaviour. Sourced from:
- `drivers/usb/serial/ftdi_sio.c` and `ftdi_sio.h` in the Linux kernel
- FTDI AN_120 (FT-X series datasheet supplement)
- FTDI D2XX Programmer's Guide
- The user's verified USBPcap captures (collected with Cynthion + Packetry)

> The prior-art ChatGPT-generated code in `docs/prior-art/` contains
> documented bugs; do not lift its constants without checking against this
> document.

## Device identification

- **VID:** `0x0403` (Future Technology Devices International Ltd)
- **PID:** `0x6015` (FT231XS, single-channel; same PID covers FT230X)
- USB device class / subclass / protocol: `0x00 / 0x00 / 0x00`
- Interface class / subclass / protocol: `0xFF / 0xFF / 0xFF` (vendor-specific)
- One configuration, one interface, two endpoints.
- Full-speed USB 2.0 device (12 Mbps).

## Endpoints (FT231XS)

| Address  | Direction | Type | wMaxPacketSize |
|----------|-----------|------|----------------|
| `0x02`   | OUT       | Bulk | 64             |
| `0x81`   | IN        | Bulk | 64             |

**Critical:** WebUSB's `device.transferIn(endpointNumber, length)` and
`device.transferOut(endpointNumber, data)` take the endpoint **number**
(1–15), not the full address byte. So for FT231XS:
- `transferOut(2, data)` for the OUT endpoint (`0x02`).
- `transferIn(1, length)` for the IN endpoint (`0x81`).

The previous ChatGPT-generated JS code hardcoded `inEp = 0x82` (decimal 130);
this is wrong and would cause every read to fail. The correct value is `1`.

## Control transfer envelope

All FTDI configuration uses **vendor-specific control transfers** on EP 0.

```
bmRequestType = 0x40   // Vendor, Host → Device, recipient: Device
bmRequestType = 0xC0   // Vendor, Device → Host, recipient: Device
```

For WebUSB, these map to `controlTransferOut` / `controlTransferIn` with
`requestType: 'vendor'` and `recipient: 'device'`.

`wIndex` selects the channel/port on multi-channel chips:
- `0` for single-channel chips (FT231XS)
- `1` for channel A on FT2232x
- `2` for channel B on FT2232x

**For FT231XS, always pass `wIndex = 0`** unless the request itself uses
`wIndex` to carry payload (baud rate's high 16 bits).

## Vendor request codes (`ftdi_sio.h`)

| Name                       | bRequest | Direction | Purpose                              |
|----------------------------|----------|-----------|--------------------------------------|
| `SIO_RESET_REQUEST`        | `0x00`   | OUT       | Reset chip / purge buffers           |
| `SIO_MODEM_CTRL_REQUEST`   | `0x01`   | OUT       | Set DTR/RTS                          |
| `SIO_SET_FLOW_CTRL_REQUEST`| `0x02`   | OUT       | Set flow control mode + XON/XOFF     |
| `SIO_SET_BAUD_RATE_REQUEST`| `0x03`   | OUT       | Set BRG divisor                      |
| `SIO_SET_DATA_REQUEST`     | `0x04`   | OUT       | Set data bits / parity / stop / break|
| `SIO_GET_MODEM_STATUS_REQUEST` | `0x05` | IN      | Read 2-byte status (modem + line)    |
| `SIO_SET_EVENT_CHAR_REQUEST`| `0x06`  | OUT       | Set event character                  |
| `SIO_SET_ERROR_CHAR_REQUEST`| `0x07`  | OUT       | Set error replacement character      |
| `SIO_SET_LATENCY_TIMER_REQUEST` | `0x09` | OUT  | Set BulkIn coalescing latency (1-255 ms)|
| `SIO_GET_LATENCY_TIMER_REQUEST` | `0x0A` | IN   | Read latency timer                   |
| `SIO_SET_BITMODE_REQUEST`  | `0x0B`   | OUT       | Bit-bang / MPSSE mode (not used here)|
| `SIO_READ_PINS_REQUEST`    | `0x0C`   | IN        | Read CBUS / async pins               |

### `SIO_RESET_REQUEST` (`0x00`) sub-commands in wValue

| wValue | Meaning              |
|--------|----------------------|
| `0x0000` | Reset SIO (both)   |
| `0x0001` | Purge RX buffer    |
| `0x0002` | Purge TX buffer    |

### `SIO_SET_DATA_REQUEST` (`0x04`) wValue encoding

```
 15  14    13 12 11    10  9  8     7   6   5   4   3   2   1   0
+--+-----+------------+-----------+--------------------------------+
|0 | BRK |  stop bits | parity    |        data bits literal       |
+--+-----+------------+-----------+--------------------------------+
```

- **Data bits** [7:0]: literal number, valid values 5, 6, 7, 8.
- **Parity** [10:8]: `0`=none, `1`=odd, `2`=even, `3`=mark, `4`=space.
- **Stop bits** [13:11]: `0`=1, `1`=1.5, `2`=2.
- **Break** [14]: 1 = transmit BREAK, 0 = normal.

Examples:
- 8N1: `0x0008`
- 7E1: `0x0207`
- 8O2: `0x1108`
- 8N1 with BREAK asserted: `0x4008`

### `SIO_MODEM_CTRL_REQUEST` (`0x01`) wValue encoding

The low byte is the **state** to set; the high byte is the **change mask**
(which bits actually take effect). Convention:

| wValue   | Meaning              |
|----------|----------------------|
| `0x0101` | Set DTR high (assert)|
| `0x0100` | Set DTR low (deassert)|
| `0x0202` | Set RTS high (assert)|
| `0x0200` | Set RTS low (deassert)|

To set both at once, OR the change masks and the states:
`0x0303` = DTR high + RTS high.

### `SIO_SET_FLOW_CTRL_REQUEST` (`0x02`) encoding

`wIndex` high byte (bits [15:8] of wIndex) holds the **flow control type**:

| Bit (in wIndex high) | Meaning  |
|----------------------|----------|
| `0x00`               | Disable  |
| `0x01`               | RTS/CTS  |
| `0x02`               | DTR/DSR  |
| `0x04`               | XON/XOFF |

`wValue` carries the XON char in the low byte and XOFF char in the high byte
when using XON/XOFF; otherwise both bytes are 0.

> Note: there is historical confusion in the wild about which field carries
> which datum. The `ftdi_sio.c` canonical form puts the **mode** in the
> high byte of `wIndex` and the **port** in the low byte of `wIndex`. Some
> older docs reverse it. Trust `ftdi_sio.c`.

### `SIO_SET_BAUD_RATE_REQUEST` (`0x03`) encoding

See `BAUD-VECTORS.md` for the canonical algorithm and verified test vectors.

The encoded 32-bit divisor splits as:
- Low 16 bits → `wValue`
- High 16 bits → `wIndex` (XOR'd with port number on multi-channel chips;
  for FT231XS, the high bits are usually 0)

## Bulk-IN status header (CRITICAL)

**Every** bulk-IN transfer the chip sends, regardless of payload size,
begins with 2 status bytes. Even when the UART has no data, the chip
sends `[status0, status1]` (2 bytes) at the latency-timer rate. With a
65-byte payload pending, you get one 64-byte packet with 2 status bytes
+ 62 data bytes, then a second packet with 2 status bytes + 3 data bytes.

### Status byte 0 — modem status

| Bit | Flag  | Meaning                            |
|-----|-------|------------------------------------|
| 0   | —     | reserved (always 1 on FT231X)      |
| 1-3 | —     | reserved                           |
| 4   | CTS   | Clear To Send                      |
| 5   | DSR   | Data Set Ready                     |
| 6   | RI    | Ring Indicator                     |
| 7   | RLSD  | Receive Line Signal Detect (DCD)   |

### Status byte 1 — line status

| Bit | Flag | Meaning                              |
|-----|------|--------------------------------------|
| 0   | —    | reserved                             |
| 1   | OE   | Overrun error                        |
| 2   | PE   | Parity error                         |
| 3   | FE   | Framing error                        |
| 4   | BI   | Break interrupt                      |
| 5   | THRE | Transmit holding register empty      |
| 6   | TEMT | Transmitter empty                    |
| 7   | RCV_FIFO_ERR | FIFO error                   |

## Latency timer

FTDI chips coalesce bulk-IN data: they accumulate UART input and only
ship it over USB when either (a) a full 64-byte packet's worth is
available, or (b) the latency timer expires. Default 16 ms. For
interactive terminals, lowering this (e.g. to 1-4 ms) noticeably
improves perceived responsiveness at the cost of more USB traffic.

Set via `SIO_SET_LATENCY_TIMER_REQUEST` (`0x09`) with wValue = ms (1-255).
