import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { SessionGuard } from './auth';
import { AuthService } from './auth.service';
import { DatabaseConnection } from './database.connection';
import { DatabaseMigrator } from './database.migrator';
import { StoriesController } from './stories.controller';
import { StoriesRepository } from './stories.repository';
import { StoriesService } from './stories.service';

@Module({
  controllers: [AuthController, StoriesController],
  providers: [
    AuthRepository,
    AuthService,
    DatabaseConnection,
    DatabaseMigrator,
    StoriesRepository,
    StoriesService,
    SessionGuard,
    { provide: APP_GUARD, useExisting: SessionGuard },
  ],
})
export class AppModule {}
