import { test } from '@japa/runner'
import type { BaseCommand } from '@adonisjs/core/ace'
import SystemConfigCommand from '../src/commands/system_config_commands.js'
import SystemConfig from '../src/model/system_config.js'
import { getApp, resetStorage } from './helpers/app.js'

test.group('system:config command', (group) => {
  group.each.setup(async () => {
    await resetStorage()
  })

  test('lists entries in key order', async () => {
    await SystemConfig.createMany([
      { key: 'theme', value: 'dark', type: 'string', description: 'Active theme' },
      { key: 'count', value: 0, type: 'number', description: null },
      { key: 'enabled', value: false, type: 'boolean', description: null },
      { key: 'roles', value: ['admin'], type: 'array', description: null },
      { key: 'options', value: { mode: 'dark' }, type: 'object', description: null },
    ])

    const command = await run(['list'])
    command.assertSucceeded()
    command.assertTableRows([
      ['Key', 'Type', 'Value', 'Description'],
      ['count', 'number', '0', ''],
      ['enabled', 'boolean', 'false', ''],
      ['options', 'object', '{"mode":"dark"}', ''],
      ['roles', 'array', '["admin"]', ''],
      ['theme', 'string', 'dark', 'Active theme'],
    ])
  })

  test('reports an empty list', async () => {
    const command = await run(['list'])
    command.assertSucceeded()
    command.assertLog(info('No system config entries'))
  })

  test('rejects extra list input', async () => {
    const command = await run(['list', 'theme'])
    command.assertFailed()
    command.assertLog(error('list does not accept a key, value, type, or description'), 'stderr')
  })

  test('adds every value type and updates an existing row', async ({ assert }) => {
    const service = await getApp().container.make('systemConfig')
    await service.get('theme', 'missing')

    const samples = [
      ['label', 'dark', 'string'],
      ['count', '0', 'number'],
      ['enabled', 'false', 'boolean'],
      ['roles', '["admin","staff"]', 'array'],
      ['options', '{"mode":"dark"}', 'object'],
    ]

    for (const [key, value, type] of samples) {
      const command = await run(['add', key, value, '--type', type, '--description', 'Stored'])
      command.assertSucceeded()
      command.assertLog(info(`Saved system config "${key}"`))
    }

    assert.equal(await service.get('label'), 'dark')
    assert.equal(await service.get('count'), 0)
    assert.equal(await service.get('enabled'), false)
    assert.deepEqual(await service.get('roles'), ['admin', 'staff'])
    assert.deepEqual(await service.get('options'), { mode: 'dark' })

    const created = await SystemConfig.find('label')
    assert.equal(created?.description, 'Stored')

    const updated = await run(['add', 'label', 'light', '--type', 'string'])
    updated.assertSucceeded()
    const fresh = await SystemConfig.find('label')
    assert.equal(fresh?.value, 'light')
    assert.equal(fresh?.description, 'Stored')
    assert.equal(await service.get('label'), 'light')
  })

  test('rejects an invalid add', async ({ assert }) => {
    const missingValue = await run(['add', 'label', '--type', 'string'])
    missingValue.assertFailed()
    missingValue.assertLog(error('add requires a key and a value'), 'stderr')

    const missingType = await run(['add', 'label', 'dark'])
    missingType.assertFailed()
    missingType.assertLog(
      error('add requires --type (string, number, boolean, array, object)'),
      'stderr'
    )

    const badType = await run(['add', 'label', 'dark', '--type', 'date'])
    badType.assertFailed()
    badType.assertLog(
      error('Invalid type "date". Use string, number, boolean, array, object'),
      'stderr'
    )

    const badNumber = await run(['add', 'count', 'nope', '--type', 'number'])
    badNumber.assertFailed()
    badNumber.assertLog(error('Value is not a finite number'), 'stderr')

    const badBoolean = await run(['add', 'enabled', 'yes', '--type', 'boolean'])
    badBoolean.assertFailed()
    badBoolean.assertLog(error('Value must be true or false'), 'stderr')

    const badJson = await run(['add', 'roles', '{', '--type', 'array'])
    badJson.assertFailed()
    badJson.assertLog(error('Value is not valid JSON'), 'stderr')

    const notArray = await run(['add', 'roles', '{}', '--type', 'array'])
    notArray.assertFailed()
    notArray.assertLog(error('Value must be a JSON array'), 'stderr')

    const notObject = await run(['add', 'options', '[]', '--type', 'object'])
    notObject.assertFailed()
    notObject.assertLog(error('Value must be a JSON object'), 'stderr')

    const longKey = await run(['add', 'k'.repeat(65), 'dark', '--type', 'string'])
    longKey.assertFailed()
    longKey.assertLogMatches(/\[ red\(error\) \] key: /, 'stderr')

    const longDescription = await run([
      'add',
      'label',
      'dark',
      '--type',
      'string',
      '--description',
      'd'.repeat(257),
    ])
    longDescription.assertFailed()
    longDescription.assertLogMatches(/\[ red\(error\) \] description: /, 'stderr')

    assert.lengthOf(await SystemConfig.all(), 0)
  })

  test('deletes an existing key and reports a missing key', async ({ assert }) => {
    const service = await getApp().container.make('systemConfig')
    await service.set('theme', 'dark', 'string', 'Active theme')
    await service.get('theme')

    const missing = await run(['delete', 'missing'])
    missing.assertFailed()
    missing.assertLog(error('System config "missing" does not exist'), 'stderr')
    assert.equal(await service.get('theme'), 'dark')

    const deleted = await run(['delete', 'theme'])
    deleted.assertSucceeded()
    deleted.assertLog(info('Deleted system config "theme"'))
    assert.isFalse(await service.has('theme'))
    assert.isNull(await SystemConfig.find('theme'))
  })

  test('rejects a delete without a key or with extra input', async ({ assert }) => {
    await SystemConfig.create({
      key: 'theme',
      value: 'dark',
      type: 'string',
      description: null,
    })

    const missingKey = await run(['delete'])
    missingKey.assertFailed()
    missingKey.assertLog(error('delete requires a key'), 'stderr')

    const extraValue = await run(['delete', 'theme', 'dark'])
    extraValue.assertFailed()
    extraValue.assertLog(error('delete accepts only a key'), 'stderr')
    assert.isNotNull(await SystemConfig.find('theme'))
  })

  test('rejects an unknown action', async () => {
    const command = await run(['export'])
    command.assertFailed()
    command.assertLog(error('Unknown action "export". Use list, add, or delete'), 'stderr')
  })
})

function info(message: string) {
  return `[ blue(info) ] ${message}`
}

function error(message: string) {
  return `[ red(error) ] ${message}`
}

async function run(argv: string[]) {
  const ace = await getApp().container.make('ace')
  const command = await ace.create(SystemConfigCommand, argv)
  command.ui.switchMode('raw')
  await command.exec()
  return command as SystemConfigCommand & BaseCommand
}
