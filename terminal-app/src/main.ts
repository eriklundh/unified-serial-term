import { createApp } from 'vue'
import App from './App.vue'
import { WebSerialFactory } from './backends/WebSerialBackend'
import { WebUsbFtdiFactory } from './backends/WebUsbFtdiBackend'
import { FACTORIES_KEY } from './backends/injectionKeys'

const app = createApp(App)
app.provide(FACTORIES_KEY, [new WebSerialFactory(), new WebUsbFtdiFactory()])
app.mount('#app')
