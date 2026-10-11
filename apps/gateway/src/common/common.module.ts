import { Global, Module } from '@nestjs/common';
import { ServiceCaller } from './service-caller';

/** Global so every feature module's controllers can inject `ServiceCaller`. */
@Global()
@Module({
  providers: [ServiceCaller],
  exports: [ServiceCaller],
})
export class CommonModule {}
