import type { UsbTransport } from './transport.js';
import type { DataBits, Parity, StopBits } from './types.js';
import type { FlowMode } from './flow.js';
import { baudToDivisor } from './baud.js';
import { encodeLineProperties } from './line.js';
import { encodeModemControl } from './modem.js';
import { encodeFlowControl } from './flow.js';
import { VendorRequest, ResetSubcommand } from './ftdi-protocol.js';
import { WebUsbTransport } from './transport.webusb.js';

export interface SerialOptions {
  baud: number;
  dataBits?: DataBits;
  parity?: Parity;
  stopBits?: StopBits;
  flowControl?: FlowMode;
  dtr?: boolean;
  rts?: boolean;
  latencyMs?: number;
}

export interface FtdiUartOptions {
  interfaceNumber?: number;
  bulkInEndpoint?: number;
  bulkOutEndpoint?: number;
}

export class FtdiUart {
  readonly interfaceNumber: number;
  readonly bulkInEndpoint: number;
  readonly bulkOutEndpoint: number;
  readonly maxPacketSize = 64;

  constructor(
    private readonly transport: UsbTransport,
    opts?: FtdiUartOptions,
  ) {
    this.interfaceNumber = opts?.interfaceNumber ?? 0;
    this.bulkInEndpoint = opts?.bulkInEndpoint ?? 1;
    this.bulkOutEndpoint = opts?.bulkOutEndpoint ?? 2;
  }

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

  async close(): Promise<void> {
    await this.transport.releaseInterface(this.interfaceNumber);
    await this.transport.close();
  }

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
