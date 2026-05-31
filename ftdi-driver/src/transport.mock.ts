import type { ControlSetup, UsbTransport } from './transport.js';

export interface RecordedControlOut {
  setup: ControlSetup;
  data: Uint8Array | undefined;
}

export interface RecordedBulkOut {
  endpoint: number;
  data: Uint8Array;
}

function toUint8Array(src: BufferSource): Uint8Array {
  if (src instanceof Uint8Array) return src;
  if (src instanceof ArrayBuffer) return new Uint8Array(src);
  return new Uint8Array(src.buffer, src.byteOffset, src.byteLength);
}

export class MockUsbTransport implements UsbTransport {
  isOpen = false;
  selectedConfig: number | null = null;
  claimedInterfaces: number[] = [];
  releasedInterfaces: number[] = [];

  controlOutCalls: RecordedControlOut[] = [];
  controlInCalls: { setup: ControlSetup; length: number }[] = [];
  bulkOutCalls: RecordedBulkOut[] = [];
  bulkInCalls: { endpoint: number; length: number }[] = [];

  private readonly controlInQueue: Uint8Array[] = [];
  private readonly bulkInQueue: Uint8Array[] = [];

  enqueueControlInResponse(data: Uint8Array): void {
    this.controlInQueue.push(data);
  }

  enqueueBulkInResponse(data: Uint8Array): void {
    this.bulkInQueue.push(data);
  }

  open(): Promise<void> {
    this.isOpen = true;
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.isOpen = false;
    return Promise.resolve();
  }

  selectConfiguration(n: number): Promise<void> {
    this.selectedConfig = n;
    return Promise.resolve();
  }

  claimInterface(n: number): Promise<void> {
    this.claimedInterfaces.push(n);
    return Promise.resolve();
  }

  releaseInterface(n: number): Promise<void> {
    this.releasedInterfaces.push(n);
    return Promise.resolve();
  }

  controlOut(setup: ControlSetup, data?: BufferSource): Promise<void> {
    this.controlOutCalls.push({
      setup,
      data: data === undefined ? undefined : toUint8Array(data),
    });
    return Promise.resolve();
  }

  controlIn(setup: ControlSetup, length: number): Promise<Uint8Array> {
    this.controlInCalls.push({ setup, length });
    return Promise.resolve(this.controlInQueue.shift() ?? new Uint8Array(0));
  }

  bulkOut(endpoint: number, data: BufferSource): Promise<void> {
    this.bulkOutCalls.push({ endpoint, data: toUint8Array(data) });
    return Promise.resolve();
  }

  bulkIn(endpoint: number, length: number): Promise<Uint8Array> {
    this.bulkInCalls.push({ endpoint, length });
    return Promise.resolve(this.bulkInQueue.shift() ?? new Uint8Array(0));
  }
}
