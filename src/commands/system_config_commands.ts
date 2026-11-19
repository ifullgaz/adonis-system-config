import { args, BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { ValidationError } from '@vinejs/vine'
import { createSystemConfigValidator } from '../validators/system_config.js'
import {
  CONFIG_VALUE_TYPES,
  type ConfigValue,
  type ConfigValueType,
  type SystemConfigServiceConfig,
} from '../types/types.js'

const ACTIONS = ['list', 'add', 'delete'] as const

type Action = (typeof ACTIONS)[number]

export default class SystemConfigCommand extends BaseCommand {
  static commandName = 'system:config'
  static description = 'List, add, or delete system config entries'
  static help = [
    'Manage entries stored by the system config service.',
    'add creates a row or updates the existing one.',
    '',
    '{{ binaryName }} system:config list',
    '{{ binaryName }} system:config add <key> <value> --type=<type> [--description=<text>]',
    '{{ binaryName }} system:config delete <key>',
    '',
    'array and object values are JSON. boolean values are true or false.',
  ]

  static options: CommandOptions = {
    startApp: true,
  }

  @args.string({ description: 'Action to run: list, add, or delete' })
  declare action: string

  @args.string({ description: 'Config key. Required for add and delete', required: false })
  declare key?: string

  @args.string({ description: 'Config value. Required for add', required: false })
  declare value?: string

  @flags.string({ description: `Value type: ${CONFIG_VALUE_TYPES.join(', ')}` })
  declare type?: string

  @flags.string({ description: 'Description stored with the value' })
  declare description?: string

  async run() {
    if (!isAction(this.action)) {
      this.fail(`Unknown action "${this.action}". Use list, add, or delete`)
      return
    }

    if (this.action === 'list') {
      await this.#list()
      return
    }

    if (this.action === 'add') {
      await this.#add()
      return
    }

    await this.#delete()
  }

  async #list() {
    if (
      this.key !== undefined ||
      this.value !== undefined ||
      this.type !== undefined ||
      this.description !== undefined
    ) {
      this.fail('list does not accept a key, value, type, or description')
      return
    }

    const config = this.app.config.get('systemConfig') as SystemConfigServiceConfig
    const rows = await config.model.query().orderBy('key', 'asc')
    if (rows.length === 0) {
      this.logger.info('No system config entries')
      return
    }

    const table = this.ui.table()
    table.head(['Key', 'Type', 'Value', 'Description'])
    for (const row of rows) {
      table.row([row.key, row.type, formatConfigValue(row.value), row.description ?? ''])
    }
    table.render()
  }

  async #add() {
    if (this.key === undefined || this.value === undefined) {
      this.fail('add requires a key and a value')
      return
    }
    if (this.type === undefined) {
      this.fail(`add requires --type (${CONFIG_VALUE_TYPES.join(', ')})`)
      return
    }
    if (!isConfigValueType(this.type)) {
      this.fail(`Invalid type "${this.type}". Use ${CONFIG_VALUE_TYPES.join(', ')}`)
      return
    }

    const parsed = parseConfigValue(this.value, this.type)
    if ('error' in parsed) {
      this.fail(parsed.error)
      return
    }

    let payload: Awaited<ReturnType<typeof createSystemConfigValidator.validate>>
    try {
      payload = await createSystemConfigValidator.validate({
        key: this.key,
        value: parsed.value,
        type: this.type,
        description: this.description,
      })
    } catch (error) {
      if (error instanceof ValidationError) {
        this.fail(formatValidationError(error))
        return
      }
      throw error
    }

    const service = await this.app.container.make('systemConfig')
    await service.set(payload.key, payload.value, payload.type, payload.description)
    this.logger.info(`Saved system config "${payload.key}"`)
  }

  async #delete() {
    if (this.key === undefined) {
      this.fail('delete requires a key')
      return
    }
    if (this.value !== undefined || this.type !== undefined || this.description !== undefined) {
      this.fail('delete accepts only a key')
      return
    }

    const service = await this.app.container.make('systemConfig')
    if (!(await service.has(this.key))) {
      this.fail(`System config "${this.key}" does not exist`)
      return
    }

    await service.delete(this.key)
    this.logger.info(`Deleted system config "${this.key}"`)
  }

  private fail(message: string) {
    this.logger.error(message)
    this.exitCode = 1
  }
}

function isAction(value: string): value is Action {
  return (ACTIONS as readonly string[]).includes(value)
}

function isConfigValueType(value: string): value is ConfigValueType {
  return (CONFIG_VALUE_TYPES as readonly string[]).includes(value)
}

function parseConfigValue(
  raw: string,
  type: ConfigValueType
): { value: ConfigValue } | { error: string } {
  if (type === 'string') {
    return { value: raw }
  }

  if (type === 'number') {
    if (raw.trim() === '' || !Number.isFinite(Number(raw))) {
      return { error: 'Value is not a finite number' }
    }
    return { value: Number(raw) }
  }

  if (type === 'boolean') {
    if (raw !== 'true' && raw !== 'false') {
      return { error: 'Value must be true or false' }
    }
    return { value: raw === 'true' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { error: 'Value is not valid JSON' }
  }

  if (type === 'array') {
    if (!Array.isArray(parsed)) {
      return { error: 'Value must be a JSON array' }
    }
    return { value: parsed }
  }

  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    return { error: 'Value must be a JSON object' }
  }

  return { value: parsed as { [key: string]: ConfigValue } }
}

function formatConfigValue(value: ConfigValue) {
  if (typeof value === 'string') {
    return value
  }
  return JSON.stringify(value)
}

function formatValidationError(error: ValidationError) {
  const messages = error.messages as Array<{ field?: string; message?: string }>
  if (!Array.isArray(messages) || messages.length === 0) {
    return 'Invalid system config'
  }

  return messages
    .map((item) => {
      if (item.field && item.message) {
        return `${item.field}: ${item.message}`
      }
      return item.message ?? 'Invalid system config'
    })
    .join('\n')
}
