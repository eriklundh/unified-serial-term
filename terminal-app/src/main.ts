import { createApp } from 'vue'
import App from './App.vue'
import { WebSerialFactory } from './backends/WebSerialBackend'
import { FACTORY_KEY } from './backends/injectionKeys'

const app = createApp(App)
app.provide(FACTORY_KEY, new WebSerialFactory())
app.mount('#app')
