/** Parameters for a vendor-specific FTDI control transfer. */
export interface ControlSetup {
  /** bRequest field (vendor command code, e.g. `VendorRequest.RESET`). */
  readonly request: number;
  /** wValue field. */
  readonly value: number;
  /** wIndex field (typically encodes interface number and/or port). */
  readonly index: number;
}

/**
 * Minimal USB transport interface used by {@link FtdiUart}.
 *
 * Production code uses {@link WebUsbTransport}; tests inject
 * `MockUsbTransport` (exported from `ftdi-webusb-driver/testing`).
 */
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
