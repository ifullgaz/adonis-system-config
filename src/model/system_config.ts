import app from '@adonisjs/core/services/app'
import { type DateTime } from 'luxon'
import { compose } from '@adonisjs/core/helpers'
import { afterDelete, afterSave, BaseModel, column } from '@adonisjs/lucid/orm'
import { json, dateTime } from '@ifullgaz/adonis-lucid/columns'
import { type ConfigValue, type ConfigValueType } from '../types/types.js'
import { withScopedModel } from '@ifullgaz/adonis-lucid/traits'

export default class SystemConfig extends compose(BaseModel, withScopedModel()) {
  static primaryKey = 'key'

  static selfAssignPrimaryKey = true

  @afterSave()
  static async afterSave() {
    const systemConfig = await app.container.make('systemConfig')
    await systemConfig.clearCache()
  }

  @afterDelete()
  static async afterDelete() {
    const systemConfig = await app.container.make('systemConfig')
    await systemConfig.clearCache()
  }

  @column({ isPrimary: true })
  declare key: string

  @json()
  declare value: ConfigValue

  @column()
  declare type: ConfigValueType

  @column()
  declare description: string | null

  @dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
