import type { ApplicationService } from '@adonisjs/core/types'
import type { SystemConfigServiceConfig, SystemConfigServiceContract } from '../src/types/types.ts'

declare module '@adonisjs/core/types' {
  interface ContainerBindings {
    systemConfig: SystemConfigServiceContract
  }
}

export default class SystemConfigProvider {
  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.singleton('systemConfig', async () => {
      const { SystemConfigService } = await import('../src/core/system_config_service.ts')
      const config = (await this.app.config.get('systemConfig')) as SystemConfigServiceConfig
      return new SystemConfigService(config)
    })
  }
}
