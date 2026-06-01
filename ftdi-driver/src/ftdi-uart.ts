import type { UsbTransport } from './transport.js';
import type { DataBits, Parity, StopBits } from './types.js';
import type { FlowMode } from './flow.js';
import type { ModemStatusFlags } from './read.js';
import { baudToDivisor } from './baud.js';
import { encodeLineProperties } from './line.js';
import { encodeModemControl } from './modem.js';
import { encodeFlowControl } from './flow.js';
import { VendorRequest, ResetSubcommand } from './ftdi-protocol.js';
import { WebUsbTransport } from './transport.webusb.js';
import { stripStatus, ModemStatusBits } from './read.js';

function toUint8Array(src: BufferSource): Uint8Array<ArrayBuffer> {
  if (src instanceof ArrayBuffer) return new Uint8Array(src);
  // BufferSource constrains ArrayBufferView.buffer to ArrayBuffer (not SharedArrayBuffer).
  const view = src as ArrayBufferView & { buffer: ArrayBuffer };
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

/** Options passed to {@link FtdiUart.configure}. */
export interface SerialOptions {
  /** Baud rate in bits per second (e.g. `115200`). */
  baud: number;
  /** Data bits per character. Defaults to `8`. */
  dataBits?: DataBits;
  /** Parity. Defaults to `'none'`. */
  parity?: Parity;
  /** Stop bits. Defaults to `1`. */
  stopBits?: StopBits;
  /** Flow-control mode. Defaults to `'none'`. */
  flowControl?: FlowMode;
  /** Initial DTR state. Defaults to `true`. */
  dtr?: boolean;
  /** Initial RTS state. Defaults to `true`. */
  rts?: boolean;
  /** Latency timer in milliseconds (1–255). Defaults to `16`. */
  latencyMs?: number;
}

/** Construction options for {@link FtdiUart}. Defaults suit the FT231XS. */
export interface FtdiUartOptions {
  /** USB interface number to claim. Defaults to `0`. */
  interfaceNumber?: number;
  /** Bulk-IN endpoint number. Defaults to `1`. */
  bulkInEndpoint?: number;
  /** Bulk-OUT endpoint number. Defaults to `2`. */
  bulkOutEndpoint?: number;
}

/**
 * WebUSB driver for FTDI FT-X family UART chips.
 *
 * Typical usage:
 * ```ts
 * const device = await navigator.usb.requestDevice({ filters: [{ vendorId: 0x0403 }] });
 * const ftdi = await FtdiUart.open(device);
 * await ftdi.configure({ baud: 115200 });
 * // use ftdi.readable / ftdi.writable streams, or ftdi.read() / ftdi.write()
 * await ftdi.close();
 * ```
 */
export class FtdiUart {
  readonly interfaceNumber: number;
  readonly bulkInEndpoint: number;
  readonly bulkOutEndpoint: number;
  readonly maxPacketSize = 64;

  private readonly readAbort = new AbortController();
  // Lazy: streams are created on first access to avoid open handles in tests
  // that only use read()/write() directly.
  private _readable: ReadableStream<Uint8Array> | undefined;
  private _writable: WritableStream<Uint8Array> | undefined;

  get readable(): ReadableStream<Uint8Array> {
    this._readable ??= new ReadableStream<Uint8Array>({
      pull: async (controller) => {
        // Loop until a non-idle packet arrives or close() is called.
        // Safe because bulkIn genuinely blocks when the queue is empty
        // (real WebUSB) or when the mock has no pending data, so this
        // loop never spins — it blocks at the bulkIn level.
        while (!this.readAbort.signal.aborted) {
          const payload = await this.read();
          if (payload.length > 0) {
            controller.enqueue(payload);
            return;
          }
        }
        controller.error(new Error('FtdiUart closed'));
      },
      cancel: () => {
        this.readAbort.abort();
      },
    });
    return this._readable;
  }

  get writable(): WritableStream<Uint8Array> {
    this._writable ??= new WritableStream<Uint8Array>({
      write: async (chunk: Uint8Array) => {
        // Uint8Array<ArrayBufferLike> from the stream; copy to ArrayBuffer-backed
        // Uint8Array so it satisfies the BufferSource constraint (TS 6 strictness).
        await this.write(new Uint8Array(chunk));
      },
    });
    return this._writable;
  }

  constructor(
    private readonly transport: UsbTransport,
    opts?: FtdiUartOptions,
  ) {
    this.interfaceNumber = opts?.interfaceNumber ?? 0;
    this.bulkInEndpoint = opts?.bulkInEndpoint ?? 1;
    this.bulkOutEndpoint = opts?.bulkOutEndpoint ?? 2;
  }

  /**
   * Convenience factory: wraps `device` in a {@link WebUsbTransport}, opens
   * the USB device, selects configuration 1, claims the interface, and returns
   * the ready driver instance.
   */
  static async open(device: USBDevice, opts?: FtdiUartOptions): Promise<FtdiUart> {
    const transport = new WebUsbTransport(device);
    const ftdi = new FtdiUart(transport, opts);
    await ftdi.open();
    return ftdi;
  }

  async open(): Promise<void> {
    await this.transport.open();
    await this.transport.selectConfiguration(1);
    await this.transport.claimInterface(this.interfaceNumber);
  }

  /** Release the USB interface and close the underlying transport. */
  async close(): Promise<void> {
    this.readAbort.abort();
    await this.transport.releaseInterface(this.interfaceNumber);
    await this.transport.close(); // unblocks any in-flight bulkIn
  }

  /**
   * Send data to the UART TX FIFO.
   *
   * Splits `data` into ≤ 64-byte chunks and issues one bulk-OUT transfer per
   * chunk. A zero-length buffer is a no-op.
   */
  async write(data: BufferSource): Promise<void> {
    const bytes = toUint8Array(data);
    if (bytes.length === 0) return;
    let offset = 0;
    while (offset < bytes.length) {
      const chunk = bytes.subarray(offset, offset + this.maxPacketSize);
      await this.transport.bulkOut(this.bulkOutEndpoint, chunk);
      offset += chunk.length;
    }
  }

  /**
   * Read up to `maxBytes` bytes from the UART RX FIFO.
   *
   * Performs one bulk-IN transfer and strips the 2-byte FTDI status header.
   * Returns an empty `Uint8Array` when the chip sends an idle packet (status
   * bytes only, no payload).
   */
  async read(maxBytes: number = this.maxPacketSize): Promise<Uint8Array> {
    const raw = await this.transport.bulkIn(this.bulkInEndpoint, maxBytes);
    // Fewer than 2 bytes can't carry status headers; treat as empty (e.g. cancelled transfer).
    if (raw.length < 2) return new Uint8Array(0);
    const { payload } = stripStatus(raw);
    return payload;
  }

  async setModemControl(opts: { dtr?: boolean; rts?: boolean }): Promise<void> {
    const iface = this.interfaceNumber;
    if ('dtr' in opts) {
      await this.transport.controlOut({
        request: VendorRequest.MODEM_CTRL,
        value: encodeModemControl({ dtr: opts.dtr }).wValue,
        index: iface,
      });
    }
    if ('rts' in opts) {
      await this.transport.controlOut({
        request: VendorRequest.MODEM_CTRL,
        value: encodeModemControl({ rts: opts.rts }).wValue,
        index: iface,
      });
    }
  }

  async getModemStatus(): Promise<ModemStatusFlags> {
    const raw = await this.transport.controlIn(
      { request: VendorRequest.GET_MODEM_STATUS, value: 0x0000, index: this.interfaceNumber },
      2,
    );
    const byte = raw[0] ?? 0;
    return {
      raw: byte,
      cts: (byte & ModemStatusBits.CTS) !== 0,
      dsr: (byte & ModemStatusBits.DSR) !== 0,
      ri: (byte & ModemStatusBits.RI) !== 0,
      rlsd: (byte & ModemStatusBits.RLSD) !== 0,
    };
  }

  /**
   * Apply serial-port settings to the chip.
   *
   * Issues the full FTDI setup sequence: reset → data format → modem control
   * → flow control → baud rate → latency timer → modem-status read.
   * Safe to call multiple times to reconfigure on the fly.
   */
  async configure(opts: SerialOptions): Promise<void> {
    const dataBits = opts.dataBits ?? 8;
    const parity = opts.parity ?? 'none';
    const stopBits = opts.stopBits ?? 1;
    const flowControl = opts.flowControl ?? 'none';
    const dtr = opts.dtr ?? true;
    const rts = opts.rts ?? true;
    const latencyMs = opts.latencyMs ?? 16;
    const iface = this.interfaceNumber;

    // 1. Reset
    await this.transport.controlOut({
      request: VendorRequest.RESET,
      value: ResetSubcommand.RESET_SIO,
      index: iface,
    });

    // 2. Set data format
    await this.transport.controlOut({
      request: VendorRequest.SET_DATA,
      value: encodeLineProperties({ dataBits, parity, stopBits }),
      index: iface,
    });

    // 3. Set DTR
    await this.transport.controlOut({
      request: VendorRequest.MODEM_CTRL,
      value: encodeModemControl({ dtr }).wValue,
      index: iface,
    });

    // 4. Set RTS
    await this.transport.controlOut({
      request: VendorRequest.MODEM_CTRL,
      value: encodeModemControl({ rts }).wValue,
      index: iface,
    });

    // 5. Set flow control
    const flow = encodeFlowControl(flowControl);
    await this.transport.controlOut({
      request: VendorRequest.SET_FLOW_CTRL,
      value: flow.wValue,
      index: flow.wIndex | iface,
    });

    // 6. Set baud rate
    const baud = baudToDivisor(opts.baud);
    await this.transport.controlOut({
      request: VendorRequest.SET_BAUD_RATE,
      value: baud.wValue,
      index: baud.wIndex | iface,
    });

    // 7. Set latency timer
    await this.transport.controlOut({
      request: VendorRequest.SET_LATENCY_TIMER,
      value: latencyMs & 0xff,
      index: iface,
    });

    // 8. Read modem status as a sanity check
    await this.transport.controlIn(
      { request: VendorRequest.GET_MODEM_STATUS, value: 0x0000, index: iface },
      2,
    );
  }
}
