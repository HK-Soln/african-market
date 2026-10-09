import { MigrationInterface, QueryRunner } from 'typeorm';
import { createServiceSchema, dropServiceSchema } from '@am/database';

export class Init1791504000000 implements MigrationInterface {
  name = 'Init1791504000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await createServiceSchema(queryRunner, 'media', []);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await dropServiceSchema(queryRunner, 'media');
  }
}
