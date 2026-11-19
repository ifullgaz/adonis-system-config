import { test } from '@japa/runner'
import SystemConfig from '../src/model/system_config.js'
import { defineConfig } from '../src/define_config.js'

test.group('defineConfig', () => {
  test('returns the same config reference', ({ assert }) => {
    const config = {
      model: SystemConfig,
      cacheKey: 'system_config:all',
      cacheTtl: '1d' as const,
    }

    const defined = defineConfig(config)

    assert.strictEqual(defined, config)
    assert.strictEqual(defined.model, SystemConfig)
    assert.equal(defined.cacheKey, 'system_config:all')
    assert.equal(defined.cacheTtl, '1d')
  })

  test('keeps a numeric cache ttl', ({ assert }) => {
    const config = defineConfig({
      model: SystemConfig,
      cacheKey: 'system_config:all',
      cacheTtl: 1000,
    })

    assert.strictEqual(config.model, SystemConfig)
    assert.equal(config.cacheKey, 'system_config:all')
    assert.equal(config.cacheTtl, 1000)
  })
})
