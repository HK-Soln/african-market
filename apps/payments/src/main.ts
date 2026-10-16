// First, before anything that tracing instruments is loaded.
import './instrument';
import { bootstrapService } from '@am/core';
import { AppModule } from './app.module';

void bootstrapService('payments', AppModule);
