export interface ControlSetup {
  readonly request: number;
  readonly value: number;
  readonly index: number;
}

export interface UsbTransport {
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(configurationValue: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  releaseInterface(interfaceNumber: number): Promise<void>;

  /** Vendor-specific control transfer, host → device (bmRequestType 0x40). */
  controlOut(setup: ControlSetup, data?: BufferSource): Promise<void>;

  /** Vendor-specific control transfer, device → host (bmRequestType 0xC0). */
  controlIn(setup: ControlSetup, length: number): Promise<Uint8Array>;

  /** Bulk OUT to the given endpoint number (1-15, no direction bit). */
  bulkOut(endpoint: number, data: BufferSource): Promise<void>;

  /** Bulk IN from the given endpoint number (1-15, no direction bit). */
  bulkIn(endpoint: number, length: number): Promise<Uint8Array>;
}
