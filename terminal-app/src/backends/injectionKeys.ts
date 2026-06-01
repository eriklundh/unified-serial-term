import type { InjectionKey } from 'vue'
import type { SerialBackendFactory } from './SerialBackend'

export const FACTORY_KEY: InjectionKey<SerialBackendFactory> = Symbol('SerialBackendFactory')
