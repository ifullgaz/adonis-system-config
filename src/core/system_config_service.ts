import cache from '@adonisjs/cache/services/main'
import {
  type ConfigValue,
  type ConfigValueType,
  type SystemConfigServiceConfig,
  type SystemConfigServiceContract,
} from '../types/types.ts'

class SystemConfigService implements SystemConfigServiceContract {
  private configCache: Record<string, ConfigValue> | null = null

  constructor(private config: SystemConfigServiceConfig) {
    cache.on('bus:message:received', (event: any) => {
      const message = event.message
      if (message.type === 'delete' && message.keys.includes(this.config.cacheKey)) {
        this.configCache = null
      }
    })
  }

  /**
   * Load all configurations from cache or database
   * Returns a key-value map of all configurations
   */
  private async loadAll(): Promise<Record<string, ConfigValue>> {
    if (!this.configCache) {
      this.configCache = await cache.getOrSet({
        key: this.config.cacheKey,
        factory: async () => {
          const configs = await this.config.model.all()
          const configMap: Record<string, ConfigValue> = {}
          for (const config of configs) {
            configMap[config.key] = config.value
          }
          return configMap
        },
        ttl: this.config.cacheTtl,
      })
    }
    return this.configCache
  }

  /**
   * Get a configuration value by key
   */
  async get<T = ConfigValue>(key: string): Promise<T | undefined>
  async get<T = ConfigValue>(key: string, defaultValue: T): Promise<T>
  async get<T = ConfigValue>(key: string, defaultValue?: T): Promise<T | undefined> {
    const allConfig = await this.loadAll()
    const value = allConfig[key]

    if (value === undefined || value === null) {
      return defaultValue
    }

    return value as T
  }

  /**
   * Set a configuration value
   * Updates database and clears cache
   */
  async set(
    key: string,
    value: ConfigValue,
    type: ConfigValueType,
    description?: string
  ): Promise<SystemConfigServiceContract> {
    // Find or create config
    let config = await this.config.model.findBy('key', key)

    if (config) {
      config.value = value
      config.type = type
      if (description !== undefined) {
        config.description = description
      }
    } else {
      config = new this.config.model()
      config.fill({
        key,
        value,
        type,
        description: description || null,
      })
    }
    await config.save()

    // Clear cache
    // await this.clearCache()

    return this
  }

  /**
   * Delete a configuration value
   */
  async delete(key: string): Promise<void> {
    const config = await this.config.model.findBy('key', key)

    if (config) {
      await config.delete()
      // await this.clearCache()
    }
  }

  /**
   * Get all configuration values
   */
  async all(): Promise<Record<string, ConfigValue>> {
    return await this.loadAll()
  }

  /**
   * Check if a configuration key exists
   */
  async has(key: string): Promise<boolean> {
    const allConfig = await this.loadAll()
    return key in allConfig
  }

  /**
   * Clear all configuration cache
   */
  async clearCache(): Promise<void> {
    // Clear memory cache
    this.configCache = null

    // Clear persistent cache
    await cache.delete({ key: this.config.cacheKey })
  }

  /**
   * Reload configuration from database
   * Bypasses cache and forces a fresh load
   */
  async reload(): Promise<Record<string, ConfigValue>> {
    await this.clearCache()
    return await this.loadAll()
  }

  /**
   * Helper methods for type-safe value retrieval
   */
  async getString(key: string): Promise<string | undefined>
  async getString(key: string, defaultValue: string): Promise<string>
  async getString(key: string, defaultValue?: string): Promise<string | undefined> {
    return defaultValue === undefined ? this.get<string>(key) : this.get<string>(key, defaultValue)
  }

  async getNumber(key: string): Promise<number | undefined>
  async getNumber(key: string, defaultValue: number): Promise<number>
  async getNumber(key: string, defaultValue?: number): Promise<number | undefined> {
    return defaultValue === undefined ? this.get<number>(key) : this.get<number>(key, defaultValue)
  }

  async getBoolean(key: string): Promise<boolean | undefined>
  async getBoolean(key: string, defaultValue: boolean): Promise<boolean>
  async getBoolean(key: string, defaultValue?: boolean): Promise<boolean | undefined> {
    return defaultValue === undefined
      ? this.get<boolean>(key)
      : this.get<boolean>(key, defaultValue)
  }

  async getArray(key: string): Promise<ConfigValue[] | undefined>
  async getArray(key: string, defaultValue: ConfigValue[]): Promise<ConfigValue[]>
  async getArray(key: string, defaultValue?: ConfigValue[]): Promise<ConfigValue[] | undefined> {
    return defaultValue === undefined
      ? this.get<ConfigValue[]>(key)
      : this.get<ConfigValue[]>(key, defaultValue)
  }

  async getObject(key: string): Promise<{ [key: string]: ConfigValue } | undefined>
  async getObject(
    key: string,
    defaultValue: { [key: string]: ConfigValue }
  ): Promise<{ [key: string]: ConfigValue }>
  async getObject(
    key: string,
    defaultValue?: { [key: string]: ConfigValue }
  ): Promise<{ [key: string]: ConfigValue } | undefined> {
    return defaultValue === undefined
      ? this.get<{ [key: string]: ConfigValue }>(key)
      : this.get<{ [key: string]: ConfigValue }>(key, defaultValue)
  }
}

export { SystemConfigService }
