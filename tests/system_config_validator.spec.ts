import { test } from '@japa/runner'
import { type Assert } from '@japa/assert'
import { ValidationError } from '@vinejs/vine'
import { CONFIG_VALUE_TYPES } from '../src/types/types.js'
import {
  createSystemConfigValidator,
  updateSystemConfigValidator,
} from '../src/validators/system_config.js'

type FieldError = { field: string; rule: string }

test.group('system config validators', () => {
  test('accepts a trimmed create payload for every value type', async ({ assert }) => {
    assert.deepEqual([...CONFIG_VALUE_TYPES], ['string', 'number', 'boolean', 'array', 'object'])

    const samples = [
      { key: ' label ', value: 'dark', type: 'string' as const, description: '  Theme  ' },
      { key: 'count', value: 0, type: 'number' as const },
      { key: 'enabled', value: false, type: 'boolean' as const },
      { key: 'roles', value: ['admin'], type: 'array' as const },
      { key: 'theme', value: { mode: 'dark' }, type: 'object' as const },
    ]

    const stringPayload = await createSystemConfigValidator.validate(samples[0])
    assert.deepEqual(stringPayload, {
      key: 'label',
      value: 'dark',
      type: 'string',
      description: 'Theme',
    })

    for (const sample of samples.slice(1)) {
      assert.deepEqual(await createSystemConfigValidator.validate(sample), sample)
    }

    const longestKey = 'k'.repeat(64)
    const longestDescription = 'd'.repeat(256)
    const atLimit = await createSystemConfigValidator.validate({
      key: longestKey,
      value: { ok: true },
      type: 'object',
      description: longestDescription,
    })
    assert.equal(atLimit.key, longestKey)
    assert.deepEqual(atLimit.value, { ok: true })
    assert.equal(atLimit.description, longestDescription)
  })

  test('rejects an invalid create payload', async ({ assert }) => {
    await assertField(
      assert,
      () => createSystemConfigValidator.validate({ value: 'dark', type: 'string' }),
      'key',
      'required'
    )
    await assertField(
      assert,
      () => createSystemConfigValidator.validate({ key: '   ', value: 'dark', type: 'string' }),
      'key',
      'minLength'
    )
    await assertField(
      assert,
      () =>
        createSystemConfigValidator.validate({
          key: 'k'.repeat(65),
          value: 'dark',
          type: 'string',
        }),
      'key',
      'maxLength'
    )
    await assertField(
      assert,
      () => createSystemConfigValidator.validate({ key: 'label', type: 'string' }),
      'value',
      'required'
    )
    await assertField(
      assert,
      () => createSystemConfigValidator.validate({ key: 'label', value: null, type: 'string' }),
      'value',
      'required'
    )
    await assertField(
      assert,
      () => createSystemConfigValidator.validate({ key: 'label', value: 'dark', type: 'date' }),
      'type',
      'enum'
    )
    await assertField(
      assert,
      () =>
        createSystemConfigValidator.validate({
          key: 'label',
          value: 'dark',
          type: 'string',
          description: 'd'.repeat(257),
        }),
      'description',
      'maxLength'
    )
  })

  test('accepts a partial update and allows a null description', async ({ assert }) => {
    assert.deepEqual(await updateSystemConfigValidator.validate({}), {})
    assert.deepEqual(await updateSystemConfigValidator.validate({ value: 0, extra: true }), {
      value: 0,
    })
    assert.deepEqual(
      await updateSystemConfigValidator.validate({
        type: 'boolean',
        description: '  updated  ',
      }),
      { type: 'boolean', description: 'updated' }
    )
    assert.deepEqual(await updateSystemConfigValidator.validate({ description: null }), {
      description: null,
    })
    assert.deepEqual(await updateSystemConfigValidator.validate({ value: null }), {})
  })

  test('rejects an invalid update payload', async ({ assert }) => {
    await assertField(
      assert,
      () => updateSystemConfigValidator.validate({ type: 'date' }),
      'type',
      'enum'
    )
    await assertField(
      assert,
      () => updateSystemConfigValidator.validate({ description: 'd'.repeat(257) }),
      'description',
      'maxLength'
    )
  })
})

async function assertField(
  assert: Assert,
  run: () => Promise<unknown>,
  field: string,
  rule: string
) {
  const errors = await validationErrors(run)
  assert.include(
    errors.map((error) => `${error.field}:${error.rule}`),
    `${field}:${rule}`
  )
}

async function validationErrors(run: () => Promise<unknown>) {
  try {
    await run()
  } catch (error) {
    if (error instanceof ValidationError) {
      return error.messages as FieldError[]
    }
    throw error
  }
  throw new Error('Expected validation to fail')
}
