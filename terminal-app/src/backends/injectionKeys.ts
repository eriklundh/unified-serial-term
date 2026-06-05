import type { InjectionKey } from 'vue'
import type { SerialBackendFactory } from './SerialBackend'

/** @deprecated use FACTORIES_KEY */
export const FACTORY_KEY: InjectionKey<SerialBackendFactory> = Symbol('SerialBackendFactory')

export const FACTORIES_KEY: InjectionKey<SerialBackendFactory[]> = Symbol('SerialBackendFactories')
