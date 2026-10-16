import { Inject, Module, OnModuleInit } from '@nestjs/common';
import { APP_ENV, ServiceCoreModule } from '@am/core';
import { DatabaseModule } from '@am/database';
import { assertSafeMediaEnv, MediaEnv, mediaEnvSchema } from './config/media-env';
import { dataSourceConfig } from './data-source';
import { MediaModule } from './media/media.module';

@Module({
  imports: [
    ServiceCoreModule.forRoot({ name: 'media', envSchema: mediaEnvSchema }),
    DatabaseModule.forService(dataSourceConfig),
    MediaModule,
  ],
})
export class AppModule implements OnModuleInit {
  constructor(@Inject(APP_ENV) private readonly env: MediaEnv) {}

  onModuleInit(): void {
    assertSafeMediaEnv(this.env);
  }
}
