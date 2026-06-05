import { WebUSB } from 'usb';

const webusb = new WebUSB({ allowAllDevices: true });

let cachedDevice: USBDevice | undefined;

export async function getTestDevice(): Promise<USBDevice> {
  if (!process.env.FTDI_HW_TEST) {
    throw new Error('Hardware tests skipped: FTDI_HW_TEST not set');
  }
  if (cachedDevice) return cachedDevice;

  const devices = await webusb.getDevices();
  const ftdi = devices.find((d) => d.vendorId === 0x0403 && d.productId === 0x6015);
  if (!ftdi) {
    throw new Error('No FT231XS (0403:6015) found. Plug the board in and try again.');
  }
  cachedDevice = ftdi;
  return ftdi;
}
