import type { ControlSetup, UsbTransport } from './transport.js';

export class TransferError extends Error {
  constructor(
    public readonly op: string,
    public readonly setup: ControlSetup,
    public readonly status: string,
  ) {
    super(`USB ${op} failed: status=${status}, setup=${JSON.stringify(setup)}`);
    this.name = 'TransferError';
  }
}

export class WebUsbTransport implements UsbTransport {
  constructor(private readonly device: USBDevice) {}

  async open(): Promise<void> {
    await this.device.open();
  }

  async close(): Promise<void> {
    await this.device.close();
  }

  async selectConfiguration(n: number): Promise<void> {
    await this.device.selectConfiguration(n);
  }

  async claimInterface(n: number): Promise<void> {
    await this.device.claimInterface(n);
  }

  async releaseInterface(n: number): Promise<void> {
    await this.device.releaseInterface(n);
  }

  async controlOut(setup: ControlSetup, data?: BufferSource): Promise<void> {
    const result = await this.device.controlTransferOut(
      {
        requestType: 'vendor',
        recipient: 'device',
        request: setup.request,
        value: setup.value,
        index: setup.index,
      },
      data,
    );
    if (result.status !== 'ok') {
      throw new TransferError('controlOut', setup, result.status);
    }
  }

  async controlIn(setup: ControlSetup, length: number): Promise<Uint8Array> {
    const result = await this.device.controlTransferIn(
      {
        requestType: 'vendor',
        recipient: 'device',
        request: setup.request,
        value: setup.value,
        index: setup.index,
      },
      length,
    );
    if (result.status !== 'ok') {
      throw new TransferError('controlIn', setup, result.status);
    }
    if (!result.data) {
      throw new TransferError('controlIn', setup, 'no-data');
    }
    return new Uint8Array(result.data.buffer);
  }

  async bulkOut(endpoint: number, data: BufferSource): Promise<void> {
    const result = await this.device.transferOut(endpoint, data);
    if (result.status !== 'ok') {
      throw new TransferError(
        'bulkOut',
        { request: endpoint, value: 0, index: 0 },
        result.status,
      );
    }
  }

  async bulkIn(endpoint: number, length: number): Promise<Uint8Array> {
    const result = await this.device.transferIn(endpoint, length);
    if (result.status !== 'ok') {
      throw new TransferError(
        'bulkIn',
        { request: endpoint, value: 0, index: 0 },
        result.status,
      );
    }
    if (!result.data) {
      throw new TransferError('bulkIn', { request: endpoint, value: 0, index: 0 }, 'no-data');
    }
    return new Uint8Array(result.data.buffer);
  }
}
