import type SystemConfig from '../model/system_config.ts'

export const CONFIG_VALUE_TYPES = ['string', 'number', 'boolean', 'array', 'object'] as const

export type ConfigValueType = (typeof CONFIG_VALUE_TYPES)[number]

export type ConfigValue = string | number | boolean | ConfigValue[] | { [key: string]: ConfigValue }

export interface SystemConfigServiceContract {
  get<T = ConfigValue>(key: string): Promise<T | undefined>
  get<T = ConfigValue>(key: string, defaultValue: T): Promise<T>
  set(
    key: string,
    value: ConfigValue,
    type: ConfigValueType,
    description?: string
  ): Promise<SystemConfigServiceContract>
  delete(key: string): Promise<void>
  all(): Promise<Record<string, ConfigValue>>
  has(key: string): Promise<boolean>
  clearCache(): Promise<void>
  reload(): Promise<Record<string, ConfigValue>>
  getString(key: string): Promise<string | undefined>
  getString(key: string, defaultValue: string): Promise<string>
  getNumber(key: string): Promise<number | undefined>
  getNumber(key: string, defaultValue: number): Promise<number>
  getBoolean(key: string): Promise<boolean | undefined>
  getBoolean(key: string, defaultValue: boolean): Promise<boolean>
  getArray(key: string): Promise<ConfigValue[] | undefined>
  getArray(key: string, defaultValue: ConfigValue[]): Promise<ConfigValue[]>
  getObject(key: string): Promise<{ [key: string]: ConfigValue } | undefined>
  getObject(
    key: string,
    defaultValue: { [key: string]: ConfigValue }
  ): Promise<{ [key: string]: ConfigValue }>
}

export interface SystemConfigServiceConfig {
  model: typeof SystemConfig
  cacheKey: string
  cacheTtl: number | string
}
