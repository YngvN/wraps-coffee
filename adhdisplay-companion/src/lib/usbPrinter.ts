import { NativeModules } from 'react-native'

/** A receipt printer plugged into this device by USB. `key` is vendor:product id, stable across replugs. */
export interface UsbPrinter {
  key: string
  name: string
}

interface UsbPrinterNativeModule {
  listPrinters(): Promise<UsbPrinter[]>
  print(key: string, base64: string): Promise<void>
}

/** `undefined` on any platform without the native module — web/Electron builds, or an Android build from before `withUsbPrinter.js`. Everything below degrades to "no USB printers" rather than throwing. */
const { UsbPrinterModule } = NativeModules as { UsbPrinterModule?: UsbPrinterNativeModule }

/** Receipt printers currently plugged in. Empty without the native module. */
export async function listUsbPrinters(): Promise<UsbPrinter[]> {
  if (!UsbPrinterModule) return []
  return UsbPrinterModule.listPrinters()
}

/** Sends a whole ESC/POS job (base64) to the printer with this key. The first time, Android asks the user to allow access to the device. Rejects with the native module's reason. */
export async function printOnUsbPrinter(key: string, base64: string): Promise<void> {
  if (!UsbPrinterModule) throw new Error('This app build cannot print over USB')
  return UsbPrinterModule.print(key, base64)
}
