import { createApp } from 'vue'
import './fonts.css'
import App from './App.vue'
import { WebSerialFactory } from './backends/WebSerialBackend'
import { WebUsbFtdiFactory } from './backends/WebUsbFtdiBackend'
import { FACTORIES_KEY } from './backends/injectionKeys'
import type { SerialBackendFactory } from './backends/SerialBackend'

const app = createApp(App)

// Allow E2E tests to inject a mock WebUSB factory before Vue mounts.
// In production (window.__webusbFactory undefined) the real factory is used.
const webusbFactory: SerialBackendFactory =
  (window as unknown as Record<string, unknown>).__webusbFactory as SerialBackendFactory ??
  new WebUsbFtdiFactory()

app.provide(FACTORIES_KEY, [new WebSerialFactory(), webusbFactory])
app.mount('#app')
