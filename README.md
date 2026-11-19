# Adonis System Config

`@ifullgaz/adonis-system-config` is an AdonisJS integration that stores
application settings in the database and serves them from memory and the
Adonis cache.

It integrates with:

- `@adonisjs/core`
- `@adonisjs/cache`
- `@adonisjs/lucid`
- `@ifullgaz/adonis-lucid`
- `@vinejs/vine`

## Installation

```bash
npm install @ifullgaz/adonis-system-config @adonisjs/cache @adonisjs/lucid @ifullgaz/adonis-lucid
node ace configure @ifullgaz/adonis-system-config
```

Install `@vinejs/vine` when you use the create and update validators.

The configure command will:

- register provider `@ifullgaz/adonis-system-config/provider`
- register command `@ifullgaz/adonis-system-config/commands`
- create `config/system_config.ts`
- create `database/migrations/<timestamp>_create_system_configs_table.ts`

Run the migration before reading or writing settings. The `system_configs`
table stores `key` (string, 64, primary), `value` (json), `type`
(`string`, `number`, `boolean`, `array`, or `object`), a nullable
`description` (string, 256), and timestamps.

## Configuration

Define your system config configuration:

```ts
import { defineConfig } from '@ifullgaz/adonis-system-config'
import SystemConfig from '@ifullgaz/adonis-system-config/model'

export default defineConfig({
  model: SystemConfig,
  cacheKey: 'system_config:all',
  cacheTtl: '1d',
})
```

`model` is the Lucid model used for reads and writes. `cacheKey` is the
Adonis cache entry that holds every row as a key-value map. `cacheTtl` is a
cache duration string or a number of milliseconds.

The provider registers a `systemConfig` container singleton and reads this
file when the singleton is resolved.

## Usage

### Read and write settings

```ts
import app from '@adonisjs/core/services/app'

const systemConfig = await app.container.make('systemConfig')

const theme = await systemConfig.get('theme', 'light')
await systemConfig.set('theme', 'dark', 'string', 'Active theme')

const values = await systemConfig.all()
const exists = await systemConfig.has('theme')

await systemConfig.delete('theme')
await systemConfig.reload()
```

`get` returns the default when the key is missing or the stored JSON value is
`null`. Stored `0`, `false`, `''`, `[]`, and `{}` are returned as-is. `has`
is true when the key is present, including a stored `null`.

`set` creates the row or updates its value and type. On create, a blank
description is stored as `null`. On update, an omitted description is left
unchanged. `set` returns the service. `delete` of a missing key leaves the
cache in place.

Reads use the in-memory map, then the cache entry, then `model.all()`.
`set`, `delete`, `clearCache`, and `reload` drop both caches. A cache bus
`delete` message whose keys include `cacheKey` drops only the in-memory map,
so another process reloads on its next read. The in-memory map stays until
one of those clears, even after `cacheTtl` expires.

`getString`, `getNumber`, `getBoolean`, `getArray`, and `getObject` follow
the same default-value rules as `get`. The `systemConfig` binding is typed as
`SystemConfigServiceContract`.

### Manage entries from the command line

```bash
node ace system:config list
node ace system:config add theme dark --type string --description "Active theme"
node ace system:config add count 0 --type number
node ace system:config add enabled false --type boolean
node ace system:config add roles '["admin"]' --type array
node ace system:config add options '{"mode":"dark"}' --type object
node ace system:config delete theme
```

`list` prints key, type, value, and description. `add` creates the row or
updates the existing value and type. Omit `--description` on update to keep
the stored description. `array` and `object` values are JSON. `delete` removes
one key and fails when that key does not exist.

### Use the model directly

```ts
import SystemConfig from '@ifullgaz/adonis-system-config/model'

const row = await SystemConfig.store({
  key: 'theme',
  value: 'dark',
  type: 'string',
  description: 'Active theme',
})

await row.update({ value: 'light' })
await row.destroy()
```

`SystemConfig` is a Lucid model with `withScopedModel()`. The primary key is
the self-assigned `key` column, and `value` is stored as JSON.

### Validate input

```ts
import {
  createSystemConfigValidator,
  updateSystemConfigValidator,
} from '@ifullgaz/adonis-system-config/validators'

const payload = await createSystemConfigValidator.validate(request.all())
```

Create requires `key` (trimmed, 1–64), `value`, and `type`. `description` is
optional, trimmed, and at most 256 characters. Update makes every field
optional. `description` may be `null` on update. Unknown keys are stripped.

## Types

You can use exported package types in your app code:

```ts
import type {
  ConfigValue,
  ConfigValueType,
  SystemConfigServiceConfig,
  SystemConfigServiceContract,
} from '@ifullgaz/adonis-system-config/types'
```

`CONFIG_VALUE_TYPES` is also exported from that path.

## Exports

- `@ifullgaz/adonis-system-config`
- `@ifullgaz/adonis-system-config/model`
- `@ifullgaz/adonis-system-config/types`
- `@ifullgaz/adonis-system-config/commands`
- `@ifullgaz/adonis-system-config/provider`
- `@ifullgaz/adonis-system-config/validators`

## Testing

### Prerequisites

Tests require a `NODE_AUTH_TOKEN` with read access to the `@ifullgaz` GitHub Packages registry (see `.npmrc`). Export it before running:

```bash
export NODE_AUTH_TOKEN=<your_token>
```

### Running the suite

```bash
npm test            # lint → c8 coverage → full Japa suite
npm run quick:test  # Japa only, no lint/coverage — use during iteration
```

### Running a single test or group

Pass Japa filter flags directly to the test entry:

```bash
# by group name
node --import=@poppinss/ts-exec --enable-source-maps bin/test.ts --groups "SystemConfig model"

# by test title (substring match)
node --import=@poppinss/ts-exec --enable-source-maps bin/test.ts --tests "persists every value type"
```

### Test harness (`tests/helpers/`)

`bin/test.ts` boots one shared AdonisJS app before the suite and terminates it during teardown. The app uses Lucid with SQLite (`better-sqlite3`), an in-memory cache store, and this package's provider. The `system_configs` table is created in that app. Tests do not run the package migration.

| Helper | What it does |
|--------|-------------|
| `bootTestApp()` | Boots the shared app once, creates the table, and sets the `systemConfig` config. |
| `resetStorage()` | Deletes every `system_configs` row and clears the cache and the in-memory map. |
| `defaultServiceConfig(overrides?)` | Returns the config used by the suite, including the booted model. |
| `getApp()` | Returns the shared app. Throws when the suite has not booted it. |
| `restoreTestApp()` | Points the global app service back at the shared app after a configure spec boots a host app. |
| `bootHostApplication(appRoot, rcFileContents?)` | Boots a short-lived app used by the configure specs. |
| `shutdownTestApp()` | Terminates the shared app. |

### Writing a new test

```ts
import { test } from '@japa/runner'
import SystemConfig from '../src/model/system_config.js'
import { resetStorage } from './helpers/app.js'

test.group('my feature', (group) => {
  group.each.setup(async () => {
    await resetStorage()
  })

  test('description', async ({ assert }) => {
    const row = await SystemConfig.create({
      key: 'theme',
      value: 'dark',
      type: 'string',
      description: null,
    })
    assert.equal(row.value, 'dark')
  })
})
```
