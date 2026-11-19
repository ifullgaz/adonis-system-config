import cache from '@adonisjs/cache/services/main'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { type BaseModel } from '@adonisjs/lucid/orm'
import SystemConfig from '../src/model/system_config.js'
import { SystemConfigService } from '../src/core/system_config_service.js'
import type { ConfigValue, ConfigValueType } from '../src/types/types.js'
import { defaultServiceConfig, getApp, resetStorage } from './helpers/app.js'

function columnOf(model: typeof BaseModel, name: string) {
  const definition = model.$getColumn(name)
  if (!definition) {
    throw new Error(`Missing column ${name}`)
  }
  return definition
}

test.group('SystemConfig model', (group) => {
  group.each.setup(async () => {
    await resetStorage()
  })

  test('uses the key as a self-assigned primary key', ({ assert }) => {
    assert.equal(SystemConfig.primaryKey, 'key')
    assert.isTrue(SystemConfig.selfAssignPrimaryKey)
    assert.equal(SystemConfig.table, 'system_configs')

    const key = columnOf(SystemConfig, 'key')
    const value = columnOf(SystemConfig, 'value')
    const type = columnOf(SystemConfig, 'type')
    const description = columnOf(SystemConfig, 'description')
    const createdAt = columnOf(SystemConfig, 'createdAt')
    const updatedAt = columnOf(SystemConfig, 'updatedAt')

    assert.isTrue(key.isPrimary)
    assert.equal(value.meta?.type, 'json')
    assert.isFunction(value.prepare)
    assert.isFunction(value.consume)
    assert.equal(type.columnName, 'type')
    assert.equal(description.columnName, 'description')
    assert.equal(createdAt.meta?.type, 'datetime')
    assert.isTrue(createdAt.meta?.autoCreate)
    assert.isFalse(createdAt.meta?.autoUpdate)
    assert.equal(updatedAt.meta?.type, 'datetime')
    assert.isTrue(updatedAt.meta?.autoCreate)
    assert.isTrue(updatedAt.meta?.autoUpdate)
  })

  test('persists every value type and a null description', async ({ assert }) => {
    const samples: Array<{ key: string; value: ConfigValue; type: ConfigValueType }> = [
      { key: 'label', value: 'dark', type: 'string' },
      { key: 'count', value: 0, type: 'number' },
      { key: 'enabled', value: false, type: 'boolean' },
      { key: 'roles', value: ['admin', 'staff'], type: 'array' },
      { key: 'theme', value: { mode: 'dark', flags: [true] }, type: 'object' },
    ]

    for (const sample of samples) {
      await SystemConfig.create({ ...sample, description: null })
    }

    for (const sample of samples) {
      const fresh = await SystemConfig.find(sample.key)
      assert.isNotNull(fresh)
      assert.equal(fresh?.key, sample.key)
      assert.deepEqual(fresh?.value, sample.value)
      assert.equal(fresh?.type, sample.type)
      assert.isNull(fresh?.description)
      assert.isTrue(DateTime.isDateTime(fresh?.createdAt))
      assert.isTrue(DateTime.isDateTime(fresh?.updatedAt))
    }
  })

  test('stores, updates, and destroys rows through the scoped model helpers', async ({
    assert,
  }) => {
    const stored = await SystemConfig.store({
      key: 'label',
      value: 'dark',
      type: 'string',
      description: 'Theme',
    })
    assert.equal(stored.value, 'dark')

    const updated = await stored.update({ value: 'light', description: null })
    assert.equal(updated.value, 'light')
    assert.isNull(updated.description)

    const fresh = await SystemConfig.find('label')
    assert.equal(fresh?.value, 'light')
    assert.isNull(fresh?.description)

    await stored.destroy()
    assert.isNull(await SystemConfig.find('label'))
  })

  test('updates the stored value and can delete the row', async ({ assert }) => {
    const row = await SystemConfig.create({
      key: 'label',
      value: 'light',
      type: 'string',
      description: 'Theme name',
    })

    row.value = 'dark'
    await row.save()

    const fresh = await SystemConfig.find('label')
    if (!fresh) {
      throw new Error('Expected the label row to exist')
    }
    assert.deepEqual(fresh.value, 'dark')
    assert.equal(fresh.description, 'Theme name')
    assert.equal(fresh.type, 'string')
    assert.isTrue(DateTime.isDateTime(fresh.createdAt))
    assert.isTrue(DateTime.isDateTime(fresh.updatedAt))

    await fresh.delete()
    assert.isNull(await SystemConfig.find('label'))
  })

  test('afterSave clears the registered service and the persistent cache', async ({ assert }) => {
    const registered = await getApp().container.make('systemConfig')
    const local = new SystemConfigService(defaultServiceConfig())
    await registered.get('name')
    await local.get('name')

    await SystemConfig.create({
      key: 'name',
      value: 'Ada',
      type: 'string',
      description: null,
    })

    assert.equal(await cache.get({ key: defaultServiceConfig().cacheKey }), null)
    assert.deepEqual(await local.all(), {})
    assert.deepEqual(await registered.all(), { name: 'Ada' })

    const warmed = new SystemConfigService(defaultServiceConfig())
    assert.equal(await warmed.get('name'), 'Ada')

    const row = await SystemConfig.find('name')
    if (!row) {
      throw new Error('Expected the name row to exist')
    }
    row.value = 'Bea'
    await row.save()

    assert.equal(await cache.get({ key: defaultServiceConfig().cacheKey }), null)
    assert.equal(await warmed.get('name'), 'Ada')
    assert.equal(await registered.get('name'), 'Bea')
  })

  test('afterDelete clears the registered service and the persistent cache', async ({ assert }) => {
    await SystemConfig.create({
      key: 'name',
      value: 'Ada',
      type: 'string',
      description: null,
    })

    const registered = await getApp().container.make('systemConfig')
    const local = new SystemConfigService(defaultServiceConfig())
    await registered.get('name')
    await local.get('name')

    const row = await SystemConfig.find('name')
    if (!row) {
      throw new Error('Expected the name row to exist')
    }
    await row.delete()

    assert.isNull(await SystemConfig.find('name'))
    assert.equal(await cache.get({ key: defaultServiceConfig().cacheKey }), null)
    assert.equal(await local.get('name'), 'Ada')
    assert.isUndefined(await registered.get('name'))
    assert.isFalse(await registered.has('name'))
  })
})
