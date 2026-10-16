import { Global, Module } from '@nestjs/common';
import { MediaLinks } from './media-links';
import { ServiceCaller } from './service-caller';

/** Global so every feature module's controllers can inject `ServiceCaller` and `MediaLinks`. */
@Global()
@Module({
  providers: [ServiceCaller, MediaLinks],
  exports: [ServiceCaller, MediaLinks],
})
export class CommonModule {}
