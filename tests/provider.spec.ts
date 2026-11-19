import cache from '@adonisjs/cache/services/main'
import { test } from '@japa/runner'
import SystemConfigProvider from '../providers/provider.js'
import { SystemConfigService } from '../src/core/system_config_service.js'
import { defaultServiceConfig, getApp, resetStorage } from './helpers/app.js'

test.group('SystemConfigProvider', (group) => {
  group.each.setup(async () => {
    await resetStorage()
  })

  test('resolves one shared service from the booted provider', async ({ assert }) => {
    const app = getApp()
    assert.isTrue(app.container.hasBinding('systemConfig'))

    const first = await app.container.make('systemConfig')
    const second = await app.container.make('systemConfig')

    assert.instanceOf(first, SystemConfigService)
    assert.strictEqual(first, second)

    await first.set('name', 'Ada', 'string')
    assert.equal(await second.get('name'), 'Ada')
  })

  test('builds the service from the systemConfig config', async ({ assert }) => {
    const app = getApp()
    const provider = new SystemConfigProvider(app)
    app.config.set(
      'systemConfig',
      defaultServiceConfig({ cacheKey: 'from-config', cacheTtl: 60_000 })
    )
    provider.register()

    try {
      const service = await app.container.make('systemConfig')
      await service.set('name', 'Ada', 'string')
      assert.equal(await cache.get({ key: 'from-config' }), null)
      await service.get('name')
      assert.deepEqual(await cache.get({ key: 'from-config' }), { name: 'Ada' })
      assert.equal(await cache.get({ key: defaultServiceConfig().cacheKey }), null)
    } finally {
      app.config.set('systemConfig', defaultServiceConfig())
      provider.register()
    }
  })
})
