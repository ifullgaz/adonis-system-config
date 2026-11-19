import vine from '@vinejs/vine'
import { CONFIG_VALUE_TYPES } from '../types/types.ts'

export const createSystemConfigValidator = vine.create(
  vine.object({
    key: vine.string().trim().minLength(1).maxLength(64),
    value: vine.any(),
    type: vine.enum(CONFIG_VALUE_TYPES),
    description: vine.string().trim().maxLength(256).optional(),
  })
)

export const updateSystemConfigValidator = vine.create(
  vine.object({
    value: vine.any().optional(),
    type: vine.enum(CONFIG_VALUE_TYPES).optional(),
    description: vine.string().trim().maxLength(256).optional().nullable(),
  })
)
