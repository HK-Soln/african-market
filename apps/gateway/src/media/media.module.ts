import { Module } from '@nestjs/common';
import { AdminMediaController, MediaController } from './media.controller';

@Module({ controllers: [MediaController, AdminMediaController] })
export class MediaModule {}
