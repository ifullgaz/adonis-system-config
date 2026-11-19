import cache from '@adonisjs/cache/services/main'
import { test } from '@japa/runner'
import SystemConfig from '../src/model/system_config.js'
import { SystemConfigService } from '../src/core/system_config_service.js'
import type { ConfigValue, SystemConfigServiceConfig } from '../src/types/types.js'
import { defaultServiceConfig, getApp, resetStorage } from './helpers/app.js'

type BusListener = (event: { message: { type: string; keys: string[] } }) => void

function createService(overrides: Partial<Omit<SystemConfigServiceConfig, 'model'>> = {}) {
  return new SystemConfigService(defaultServiceConfig(overrides))
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function publishBusMessage(type: string, keys: string[]) {
  const emitter = (await getApp().container.make('emitter')) as unknown as {
    emit(event: string, data: { message: { type: string; keys: string[] } }): Promise<void>
  }
  await emitter.emit('bus:message:received', { message: { type, keys } })
}

async function changeValue(key: string, value: string) {
  const row = await SystemConfig.find(key)
  if (!row) {
    throw new Error(`Expected ${key} to exist`)
  }
  row.value = value
  await row.save()
}

test.group('SystemConfigService', (group) => {
  group.each.setup(async () => {
    await resetStorage()
  })

  test('returns stored values and falls back when a key is missing', async ({ assert }) => {
    const service = createService()
    await service.set('label', 'dark', 'string', 'theme')
    await service.set('count', 3, 'number')
    await service.set('enabled', true, 'boolean')
    await service.set('roles', ['admin'], 'array')
    await service.set('theme', { mode: 'dark', flags: [true, 'beta'] }, 'object')

    assert.equal(await service.get('label'), 'dark')
    assert.equal(await service.get('label', 'fallback'), 'dark')
    assert.equal(await service.get('missing', 'fallback'), 'fallback')
    assert.isUndefined(await service.get('missing'))
    assert.equal(await service.getString('label'), 'dark')
    assert.equal(await service.getString('label', 'fallback'), 'dark')
    assert.equal(await service.getString('missing', 'fallback'), 'fallback')
    assert.isUndefined(await service.getString('missing'))
    assert.equal(await service.getNumber('count'), 3)
    assert.equal(await service.getNumber('count', 9), 3)
    assert.equal(await service.getNumber('missing', 9), 9)
    assert.isUndefined(await service.getNumber('missing'))
    assert.equal(await service.getBoolean('enabled'), true)
    assert.equal(await service.getBoolean('enabled', false), true)
    assert.equal(await service.getBoolean('missing', false), false)
    assert.isUndefined(await service.getBoolean('missing'))
    assert.deepEqual(await service.getArray('roles'), ['admin'])
    assert.deepEqual(await service.getArray('roles', ['guest']), ['admin'])
    assert.deepEqual(await service.getArray('missing', ['guest']), ['guest'])
    assert.isUndefined(await service.getArray('missing'))
    assert.deepEqual(await service.getObject('theme'), { mode: 'dark', flags: [true, 'beta'] })
    assert.deepEqual(await service.getObject('theme', { mode: 'light' }), {
      mode: 'dark',
      flags: [true, 'beta'],
    })
    assert.deepEqual(await service.getObject('missing', { mode: 'light' }), { mode: 'light' })
    assert.isUndefined(await service.getObject('missing'))

    const row = await SystemConfig.find('label')
    assert.equal(row?.type, 'string')
    assert.equal(row?.description, 'theme')
  })

  test('keeps falsy values instead of applying defaults', async ({ assert }) => {
    const service = createService()
    await service.set('count', 0, 'number')
    await service.set('enabled', false, 'boolean')
    await service.set('label', '', 'string')
    await service.set('roles', [], 'array')
    await service.set('theme', {}, 'object')

    assert.equal(await service.getNumber('count', 5), 0)
    assert.equal(await service.getBoolean('enabled', true), false)
    assert.equal(await service.getString('label', 'fallback'), '')
    assert.deepEqual(await service.getArray('roles', ['admin']), [])
    assert.deepEqual(await service.getObject('theme', { mode: 'dark' }), {})
  })

  test('treats a json null as missing and still reports the key', async ({ assert }) => {
    const service = createService()
    const database = await getApp().container.make('lucid.db')
    await database
      .connection()
      .rawQuery(`insert into system_configs ("key", "value", "type") values (?, ?, ?)`, [
        'empty',
        'null',
        'string',
      ])

    assert.isUndefined(await service.get('empty'))
    assert.equal(await service.get('empty', 'fallback'), 'fallback')
    assert.isTrue(await service.has('empty'))
    assert.deepEqual(await service.all(), { empty: null })
  })

  test('creates a row, then updates its value and type', async ({ assert }) => {
    const service = createService()

    const created = await service.set('count', 1, 'number', 'counter')
    assert.strictEqual(created, service)

    await created.set('count', '1', 'string')
    const row = await SystemConfig.find('count')
    assert.equal(row?.value, '1')
    assert.equal(row?.type, 'string')
    assert.equal(row?.description, 'counter')
    assert.equal(await service.get('count'), '1')
  })

  test('stores a null description when create omits it or passes a blank string', async ({
    assert,
  }) => {
    const service = createService()
    await service.set('name', 'Ada', 'string')
    await service.set('title', 'Config', 'string', '')

    const name = await SystemConfig.find('name')
    const title = await SystemConfig.find('title')
    assert.isNull(name?.description)
    assert.isNull(title?.description)
  })

  test('leaves the description unchanged when an update omits it', async ({ assert }) => {
    const service = createService()
    await service.set('name', 'Ada', 'string', 'first')
    await service.set('name', 'Bea', 'string')

    const row = await SystemConfig.find('name')
    assert.equal(row?.value, 'Bea')
    assert.equal(row?.description, 'first')
  })

  test('replaces the description when an update provides one', async ({ assert }) => {
    const service = createService()
    await service.set('name', 'Ada', 'string', 'first')
    await service.set('name', 'Ada', 'string', '')

    const row = await SystemConfig.find('name')
    assert.equal(row?.description, '')
  })

  test('returns every stored value from all and has', async ({ assert }) => {
    const warmed = createService()
    assert.deepEqual(await warmed.all(), {})
    assert.isFalse(await warmed.has('name'))

    const service = createService()
    await service.set('name', 'Ada', 'string')
    await service.set('count', 2, 'number')

    const registered = await getApp().container.make('systemConfig')
    assert.deepEqual(await warmed.all(), {})
    assert.isFalse(await warmed.has('name'))
    assert.deepEqual(await service.all(), { name: 'Ada', count: 2 })
    assert.isTrue(await service.has('name'))
    assert.isFalse(await service.has('missing'))
    assert.deepEqual(await registered.all(), { name: 'Ada', count: 2 })
  })

  test('deletes the row and clears the registered cache', async ({ assert }) => {
    const service = createService()
    await service.set('name', 'Ada', 'string')
    await service.get('name')

    await service.delete('name')

    const registered = await getApp().container.make('systemConfig')
    assert.equal(await service.get('name'), 'Ada')
    assert.isTrue(await service.has('name'))
    assert.isNull(await SystemConfig.find('name'))
    assert.isUndefined(await createService().get('name'))
    assert.isFalse(await createService().has('name'))
    assert.deepEqual(await createService().all(), {})
    assert.isUndefined(await registered.get('name'))
  })

  test('ignores delete when the key is missing and keeps the warm cache', async ({ assert }) => {
    const service = createService()
    await service.set('name', 'Ada', 'string')
    await service.get('name')
    await changeValue('name', 'Bea')

    await service.delete('missing')

    const row = await SystemConfig.find('name')
    assert.equal(await service.get('name'), 'Ada')
    assert.equal(row?.value, 'Bea')
  })

  test('keeps a warm instance after a model write and serves a new instance from the database', async ({
    assert,
  }) => {
    const service = createService()
    await service.set('name', 'Ada', 'string')
    assert.equal(await service.get('name'), 'Ada')
    await changeValue('name', 'Bea')

    assert.equal(await service.get('name'), 'Ada')
    assert.equal(await cache.get({ key: defaultServiceConfig().cacheKey }), null)
    assert.equal(await createService().get('name'), 'Bea')

    await service.clearCache()
    assert.equal(await service.get('name'), 'Bea')
    assert.equal(await createService().get('name'), 'Bea')
  })

  test('reloads from the database and refreshes both caches', async ({ assert }) => {
    const service = createService()
    await service.set('name', 'Ada', 'string')
    await service.get('name')
    await changeValue('name', 'Bea')

    assert.deepEqual(await service.reload(), { name: 'Bea' })
    assert.equal(await service.get('name'), 'Bea')
    assert.deepEqual(await cache.get({ key: defaultServiceConfig().cacheKey }), { name: 'Bea' })
  })

  test('keeps its memory cache after the persistent entry expires', async ({ assert }) => {
    const config = { cacheKey: 'system_config:expiring', cacheTtl: 80 }
    const service = createService(config)
    await service.set('name', 'Ada', 'string')
    await service.get('name')
    await changeValue('name', 'Bea')

    await wait(200)

    assert.equal(await service.get('name'), 'Ada')
    assert.equal(await createService(config).get('name'), 'Bea')
  })

  test('drops its memory cache when a bus delete names its cache key', async ({ assert }) => {
    const service = createService()
    await service.set('name', 'Ada', 'string')
    await service.get('name')
    await cache.set({
      key: defaultServiceConfig().cacheKey,
      value: { name: 'Bea' },
      ttl: defaultServiceConfig().cacheTtl,
    })

    assert.equal(await service.get('name'), 'Ada')
    await publishBusMessage('delete', ['other', defaultServiceConfig().cacheKey])
    assert.equal(await service.get('name'), 'Bea')
  })

  test('ignores bus messages for other keys, empty key lists, and other operations', async ({
    assert,
  }) => {
    const service = createService()
    const secondary = createService({ cacheKey: 'system_config:secondary', cacheTtl: '1d' })
    await service.set('name', 'Ada', 'string')
    await service.get('name')
    await secondary.get('name')
    await cache.set({
      key: defaultServiceConfig().cacheKey,
      value: { name: 'Bea' },
      ttl: '1d',
    })
    await cache.set({
      key: 'system_config:secondary',
      value: { name: 'Cara' },
      ttl: '1d',
    })

    await publishBusMessage('delete', ['system_config:secondary'])
    await publishBusMessage('delete', [])
    await publishBusMessage('set', [defaultServiceConfig().cacheKey])

    assert.equal(await service.get('name'), 'Ada')
    assert.equal(await secondary.get('name'), 'Cara')
  })

  test('reads and writes through the model supplied in config', async ({ assert }) => {
    class FakeModel {
      static rows = new Map<string, FakeModel>()
      static created: Array<{
        key: string
        value: ConfigValue
        type: string
        description: string | null
      }> = []
      static deleted: string[] = []
      static saves = 0

      declare key: string
      declare value: ConfigValue
      declare type: string
      declare description: string | null

      static async all() {
        return [...this.rows.values()]
      }

      static async findBy(_column: string, key: string) {
        return this.rows.get(key) ?? null
      }

      fill(payload: { key: string; value: ConfigValue; type: string; description: string | null }) {
        this.key = payload.key
        this.value = payload.value
        this.type = payload.type
        this.description = payload.description
      }

      async save() {
        if (!FakeModel.rows.has(this.key)) {
          FakeModel.created.push({
            key: this.key,
            value: this.value,
            type: this.type,
            description: this.description,
          })
        }
        FakeModel.saves++
        FakeModel.rows.set(this.key, this)
      }

      async delete() {
        FakeModel.deleted.push(this.key)
        FakeModel.rows.delete(this.key)
      }
    }

    const service = new SystemConfigService({
      model: FakeModel as unknown as SystemConfigServiceConfig['model'],
      cacheKey: 'system_config:injected-model',
      cacheTtl: '1d',
    })

    await service.set('label', 'dark', 'string', 'theme')
    await service.set('label', 'light', 'string')
    assert.deepEqual(FakeModel.created, [
      { key: 'label', value: 'dark', type: 'string', description: 'theme' },
    ])
    assert.equal(FakeModel.rows.get('label')?.value, 'light')
    assert.equal(FakeModel.saves, 2)
    assert.isNull(await SystemConfig.find('label'))

    assert.equal(await service.get('label'), 'light')
    await service.delete('label')
    assert.deepEqual(FakeModel.deleted, ['label'])
    assert.equal(await service.get('label'), 'light')
    await service.clearCache()
    assert.isUndefined(await service.get('label'))
  })

  test('throws when the service is constructed without config', async ({ assert }) => {
    const listeners: BusListener[] = []
    const mutable = cache as unknown as {
      on(event: string, callback: BusListener): unknown
      off(event: string, callback: BusListener): void
    }
    const original = mutable.on
    mutable.on = (event, callback) => {
      if (event === 'bus:message:received') {
        listeners.push(callback)
      }
      return original.call(cache, event, callback)
    }

    try {
      const service = new SystemConfigService(undefined as unknown as SystemConfigServiceConfig)
      await assert.rejects(() => service.get('name'), TypeError, /cacheKey/)
    } finally {
      mutable.on = original
      for (const listener of listeners) {
        mutable.off('bus:message:received', listener)
      }
    }
  })
})
