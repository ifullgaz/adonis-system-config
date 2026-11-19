import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setApp } from '@adonisjs/core/services/app'
import { IgnitorFactory } from '@adonisjs/core/factories'
import { defineConfig as defineCacheConfig, drivers, store } from '@adonisjs/cache'
import { defineConfig as defineDatabaseConfig } from '@adonisjs/lucid'
import type { ApplicationService } from '@adonisjs/core/types'
import type { SystemConfigServiceConfig } from '../../src/types/types.js'

let model: SystemConfigServiceConfig['model'] | undefined

export function defaultServiceConfig(
  overrides: Partial<Omit<SystemConfigServiceConfig, 'model'>> = {}
): SystemConfigServiceConfig {
  if (!model) {
    throw new Error('Test application is not booted')
  }
  return {
    model,
    cacheKey: 'system_config:all',
    cacheTtl: '1d',
    ...overrides,
  }
}

let application: ApplicationService | undefined

export function getApp() {
  if (!application) {
    throw new Error('Test application is not booted')
  }
  return application
}

/**
 * Point the global app service back at the shared test app. Configure specs boot
 * short-lived host apps, and those replace the global reference.
 */
export function restoreTestApp() {
  setApp(getApp())
}

export async function bootTestApp() {
  if (application) {
    return application
  }

  const filename = join(mkdtempSync(join(tmpdir(), 'adonis-system-config-')), 'db.sqlite')
  application = new IgnitorFactory()
    .withCoreProviders()
    .withCoreConfig()
    .merge({
      rcFileContents: {
        providers: [
          () => import('@adonisjs/lucid/database_provider'),
          () => import('@adonisjs/cache/cache_provider'),
          () => import('../../providers/provider.js'),
        ],
      },
      config: {
        database: defineDatabaseConfig({
          connection: 'sqlite',
          connections: {
            sqlite: {
              client: 'better-sqlite3',
              connection: { filename },
              useNullAsDefault: true,
              pool: { min: 1, max: 1 },
            },
          },
        }),
        cache: defineCacheConfig({
          default: 'memory',
          stores: {
            memory: store().useL1Layer(drivers.memory()),
          },
        }),
      },
    })
    .create(new URL('../../', import.meta.url), {
      importer: (filePath) => import(filePath),
    })
    .createApp('test')

  await application.init()
  await application.boot()
  await createSchema()

  // Bind the lucid and cache singletons to this app before another app calls setApp.
  await import('@adonisjs/lucid/services/db')
  await import('@adonisjs/cache/services/main')
  const systemConfigModel = await import('../../src/model/system_config.js')
  model = systemConfigModel.default
  application.config.set('systemConfig', defaultServiceConfig())
  return application
}

async function createSchema() {
  const database = await getApp().container.make('lucid.db')
  await database.connection().schema.createTable('system_configs', (table) => {
    table.string('key', 64).primary()
    table.json('value').notNullable()
    table.enum('type', ['string', 'number', 'boolean', 'array', 'object']).notNullable()
    table.string('description', 256).nullable()
    table.timestamp('created_at').nullable()
    table.timestamp('updated_at').nullable()
  })
}

export async function resetStorage() {
  const app = getApp()
  const database = await app.container.make('lucid.db')
  await database.connection().from('system_configs').delete()

  const { default: cache } = await import('@adonisjs/cache/services/main')
  await cache.clear()

  if (app.container.hasBinding('systemConfig')) {
    const service = await app.container.make('systemConfig')
    await service.clearCache()
  }
}

export async function bootHostApplication(appRoot: URL, rcFileContents?: Record<string, unknown>) {
  const factory = new IgnitorFactory().withCoreProviders().withCoreConfig()
  if (rcFileContents) {
    factory.merge({ rcFileContents })
  }

  const app = factory
    .create(appRoot, {
      importer: (filePath) => import(filePath),
    })
    .createApp('web')

  await app.init()
  await app.boot()
  return app
}

export async function shutdownTestApp() {
  if (!application) {
    return
  }
  await application.terminate()
  application = undefined
}
