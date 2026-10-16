import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { shutdownTelemetry } from './state';

/** Sends the spans and error reports still buffered when the app stops. */
@Injectable()
export class TelemetryShutdown implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    await shutdownTelemetry();
  }
}
