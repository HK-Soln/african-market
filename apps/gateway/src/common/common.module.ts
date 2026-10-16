import { Global, Module } from '@nestjs/common';
import { MediaBinder } from './media-binder';
import { MediaLinks } from './media-links';
import { ServiceCaller } from './service-caller';

/** Global so every feature module's controllers can inject `ServiceCaller` and the media helpers. */
@Global()
@Module({
  providers: [ServiceCaller, MediaLinks, MediaBinder],
  exports: [ServiceCaller, MediaLinks, MediaBinder],
})
export class CommonModule {}
